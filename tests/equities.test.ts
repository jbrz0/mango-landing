import test from 'node:test';
import assert from 'node:assert/strict';
import { createEquityLoader, parseEquity } from '../server/equity-data';
import { equityStatus } from '../src/lib/markets/equities';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const now = Date.parse('2026-10-02T06:00:00Z');
const payload = (symbol = 'AAPL') => ({ chart: { error: null, result: [{ meta: {
  symbol, currency: 'USD', instrumentType: 'EQUITY', regularMarketPrice: 110,
  regularMarketTime: Date.parse('2026-10-01T20:00:00Z') / 1000, chartPreviousClose: 100,
} }] } });

test('equities function initializes under native Node ESM without the development loader', async () => {
  const work = resolve('.intel-work');
  await mkdir(work, { recursive: true });
  const directory = await mkdtemp(resolve(work, 'equities-runtime-'));
  try {
    for (const file of ['api/equities.ts', 'server/equity-data.ts', 'src/lib/markets/equities.ts']) {
      const output = resolve(directory, file.replace(/\.ts$/, '.js'));
      await mkdir(dirname(output), { recursive: true });
      const source = await readFile(resolve(file), 'utf8');
      await writeFile(output, ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText);
    }
    const snapshot = resolve(directory, 'data/intel/current.json');
    await mkdir(dirname(snapshot), { recursive: true });
    await writeFile(snapshot, await readFile(resolve('data/intel/current.json')));
    const url = pathToFileURL(resolve(directory, 'api/equities.js')).href;
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `const handler = (await import(${JSON.stringify(url)})).default; if (typeof handler !== 'function') process.exit(1);`], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  } finally {
    assert.equal(dirname(directory), work);
    await rm(directory, { recursive: true, force: true });
  }
});

test('quotes retain the provider timestamp and calculate change from previous session, not research', () => {
  const quote = parseEquity(payload(), 'AAPL', now);
  assert.equal(quote.price, 110);
  assert.ok(Math.abs(quote.changePct! - 10) < 1e-10);
  assert.equal(quote.updatedAt, '2026-10-01T20:00:00.000Z');
  assert.equal(quote.retrievedAt, '2026-10-02T06:00:00.000Z');
  assert.equal(equityStatus(quote, now), 'Regular session');
});

test('rejects missing, future, wrong-symbol, non-USD and invalid prices', () => {
  for (const patch of [{ regularMarketPrice: null }, { regularMarketPrice: 0 }, { regularMarketPrice: NaN }, { symbol: 'MSFT' }, { currency: 'EUR' }, { regularMarketTime: now / 1000 + 600 }]) {
    const data = payload(); Object.assign(data.chart.result[0].meta, patch);
    assert.throws(() => parseEquity(data, 'AAPL', now));
  }
  assert.throws(() => parseEquity({ chart: { result: null, error: { code: 'Not Found' } } }, 'AAPL', now));
});

test('all visitors share 15-minute requests, deduplicate symbols and retain dated prices on partial failure', async () => {
  let clock = now; let calls = 0; let fail = false;
  const load = createEquityLoader(['AAPL', 'MSFT', 'AAPL'], async input => {
    calls++;
    const symbol = String(input).includes('/AAPL?') ? 'AAPL' : 'MSFT';
    if (fail && symbol === 'AAPL') throw new Error('rate limited');
    assert.ok(String(input).endsWith('interval=1d&range=1d'));
    return Response.json(payload(symbol));
  }, () => clock);
  const [first, same] = await Promise.all([load(), load()]);
  assert.deepEqual(first, same); assert.equal(calls, 2);
  clock += 14 * 60_000; await load(); assert.equal(calls, 2);
  clock += 2 * 60_000; fail = true;
  const next = await load(); assert.equal(calls, 4);
  assert.deepEqual(next.quotes[0], { ...first.quotes[0], refreshFailed: true });
  assert.equal(next.quotes[1].refreshFailed, false);
  assert.match(equityStatus(next.quotes[0], clock), /Last known/);
  await load(); assert.equal(calls, 4);
});

test('cold outages are unavailable and do not invent prices; stale retrievals remain visible', async () => {
  const load = createEquityLoader(['AAPL'], async () => new Response('rate limited', { status: 429 }), () => now);
  assert.deepEqual(await load(), { quotes: [], unavailable: ['AAPL'] });
  const quote = parseEquity(payload(), 'AAPL', now);
  assert.match(equityStatus(quote, now + 31 * 60_000), /Last known/);
});
