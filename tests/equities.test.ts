import test from 'node:test';
import assert from 'node:assert/strict';
import { createEquityLoader, parseEquity } from '../server/equity-data';
import { equityStatus } from '../src/lib/markets/equities';

const now = Date.parse('2026-10-02T06:00:00Z');
const payload = (symbol = 'AAPL') => ({ chart: { error: null, result: [{ meta: {
  symbol, currency: 'USD', instrumentType: 'EQUITY', regularMarketPrice: 110,
  regularMarketTime: Date.parse('2026-10-01T20:00:00Z') / 1000, chartPreviousClose: 100,
} }] } });

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
