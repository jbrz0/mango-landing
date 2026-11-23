import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { easternTimestamp, expiryTime, snapshotSchema, type Snapshot } from '../src/lib/gex/model.js';

const providerSchema = z.object({ timestamp: z.string(), symbol: z.literal('QQQ'), data: z.object({
  current_price: z.number().positive(), open: z.number().positive(), high: z.number().positive(), low: z.number().positive(), prev_day_close: z.number().positive(), last_trade_time: z.string(), options: z.array(z.unknown()).min(10),
}) });
const optionSchema = z.object({ option: z.string().regex(/^QQQ\d{6}[CP]\d{8}$/), gamma: z.number().finite().nonnegative(), iv: z.number().finite().nonnegative(), open_interest: z.number().int().nonnegative() });
export function parseChain(input: unknown, now = new Date()): Snapshot {
  const x = providerSchema.parse(input), d = x.data;
  // Cboe's file-generation timestamp is UTC; the underlying trade time is New York local.
  const chainAsOf = new Date(z.iso.datetime().parse(x.timestamp.replace(' ', 'T') + 'Z')).toISOString();
  const quoteAsOf = easternTimestamp(d.last_trade_time);
  if (+new Date(chainAsOf) > +now + 5 * 60_000 || +new Date(quoteAsOf) > +now + 5 * 60_000) throw new Error('Provider timestamp is in the future');
  if (+now - +new Date(chainAsOf) > 5 * 86400_000 || +now - +new Date(quoteAsOf) > 5 * 86400_000) throw new Error('Provider data is older than five days');
  let rejected = 0;
  const seen = new Set<string>();
  const contracts: Snapshot['contracts'] = [];
  for (const raw of d.options) {
    const result = optionSchema.safeParse(raw);
    if (!result.success) { rejected++; continue; }
    const o = result.data, m = /^QQQ(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/.exec(o.option)!;
    const expiry = `20${m[1]}-${m[2]}-${m[3]}`;
    if (seen.has(o.option)) throw new Error('Duplicate provider contract');
    seen.add(o.option);
    if (expiryTime(expiry) <= +new Date(chainAsOf)) continue;
    if (o.gamma <= 0 || o.iv <= 0 || !o.open_interest) continue;
    contracts.push({ expiry, side: m[4] as 'C' | 'P', strike: Number(m[5]) / 1000, gamma: o.gamma, iv: o.iv, oi: o.open_interest });
  }
  if (rejected / d.options.length > .05) throw new Error('Too many invalid provider contracts');
  return snapshotSchema.parse({ version: 1, symbol: 'QQQ', source: 'Cboe delayed', retrievedAt: now.toISOString(), chainAsOf, quoteAsOf, spot: d.current_price, open: d.open, high: d.high, low: d.low, previousClose: d.prev_day_close, contracts, rejected });
}
// Cboe moved the delayed-quotes API from cdn.cboe.com to cdn-api.cboe.com (307) in Nov 2026, and its
// Cloudflare rule rejects requests without a cboe.com Referer (the quote table at www.cboe.com loads it).
// Request the new host directly, and keep the old host as a fallback.
export const CHAIN_URLS = [
  'https://cdn-api.cboe.com/api/global/delayed_quotes/options/QQQ.json',
  'https://cdn.cboe.com/api/global/delayed_quotes/options/QQQ.json',
];
export const CHAIN_HEADERS = {
  Accept: 'application/json',
  Referer: 'https://www.cboe.com/',
  'User-Agent': 'mango-atlas-gex/1.0 (+https://www.mangoatlas.xyz/gex)',
};
const retryable = (status: number) => status === 403 || status === 408 || status === 429 || status >= 500;
export async function fetchChain(fetchImpl: typeof fetch = fetch, { attempts = 3, baseDelayMs = 2_000 } = {}): Promise<string> {
  const errors: string[] = [];
  for (const url of CHAIN_URLS) {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      let retry = true;
      try {
        const response = await fetchImpl(url, { signal: AbortSignal.timeout(30_000), headers: CHAIN_HEADERS });
        if (response.ok) return await response.text();
        retry = retryable(response.status);
        errors.push(`${new URL(url).host} HTTP ${response.status}`);
      } catch (error) {
        errors.push(`${new URL(url).host} ${error instanceof Error ? error.message : 'request failed'}`);
      }
      if (!retry) break;
      if (attempt < attempts) await new Promise(done => setTimeout(done, baseDelayMs * 2 ** (attempt - 1)));
    }
  }
  throw new Error(`Cboe fetch failed: ${errors.join('; ')}`);
}
async function update() {
  const body = await fetchChain();
  if (body.length > 20_000_000) throw new Error('Unexpected chain size');
  const snapshot = parseChain(JSON.parse(body));
  const path = resolve('public/data/gex/current.json');
  const prior = await readFile(path, 'utf8').then(text => snapshotSchema.parse(JSON.parse(text)), () => null);
  if (prior && prior.chainAsOf > snapshot.chainAsOf) throw new Error('Provider timestamp regressed; preserving last good snapshot');
  await mkdir(resolve('public/data/gex'), { recursive: true });
  await writeFile(`${path}.tmp`, JSON.stringify(snapshot) + '\n');
  await rename(`${path}.tmp`, path);
  console.log(`Published QQQ snapshot: ${snapshot.contracts.length} option series, quote ${snapshot.quoteAsOf}, chain ${snapshot.chainAsOf}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) update().catch(error => { console.error(error instanceof Error ? error.message : 'GEX refresh failed'); process.exitCode = 1; });
