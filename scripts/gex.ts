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
  const chainAsOf = easternTimestamp(x.timestamp), quoteAsOf = easternTimestamp(d.last_trade_time);
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
async function update() {
  const response = await fetch('https://cdn.cboe.com/api/global/delayed_quotes/options/QQQ.json', { signal: AbortSignal.timeout(30_000), headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Cboe HTTP ${response.status}`);
  const body = await response.text();
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
