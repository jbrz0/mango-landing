import { test } from 'node:test';
import assert from 'node:assert/strict';
import { movePnl, simulatePosition } from '../src/lib/global/calculator';
import { parseGlobalQuote, parseHeadlines, createGlobalLoader } from '../server/global-data';

test('futures point and tick P&L follows CME contract multipliers and direction', () => {
  assert.equal(movePnl('MNQ', 3, 35, 'points').pnl, 210);
  assert.equal(movePnl('MNQ', 3, 140, 'ticks').pnl, 210);
  assert.equal(movePnl('NQ', 1, -35, 'points', -1).pnl, 700);
  assert.equal(movePnl('CL', 2, 0.1, 'points').pnl, 200);
  assert.equal(movePnl('MGC', 2, 10, 'ticks').pnl, 20);
  assert.throws(() => movePnl('MNQ', 0, 35, 'points'));
  assert.throws(() => movePnl('MNQ', 1.5, 35, 'points'));
  assert.throws(() => movePnl('MNQ', 1, NaN, 'points'));
});
test('adds weight average entry; reductions realize P&L and preserve cost basis', () => {
  assert.deepEqual(simulatePosition('MNQ', 5, 24500, [{ quantity: 3, price: 24420 }], 1), { quantity: 8, average: 24470, realized: 0 });
  assert.deepEqual(simulatePosition('MNQ', 5, 24500, [{ quantity: 3, price: 24420 }, { quantity: -2, price: 24520 }], 1), { quantity: 6, average: 24470, realized: 200 });
  assert.deepEqual(simulatePosition('MNQ', 5, 24500, [{ quantity: -2, price: 24450 }], -1), { quantity: 3, average: 24500, realized: 200 });
  assert.throws(() => simulatePosition('MNQ', 2, 24500, [{ quantity: -3, price: 24450 }], 1));
  assert.throws(() => simulatePosition('MNQ', 2, 24500, [{ quantity: 1.5, price: 24450 }], 1));
});
function yahoo(closes: (number | null)[] = [90, 100, 102]) {
  return { chart: { error: null, result: [{ meta: { symbol: 'BTC-USD', regularMarketPrice: 102, regularMarketTime: Date.parse('2026-10-09T12:00:00Z') / 1000, exchangeTimezoneName: 'UTC' }, timestamp: ['2026-10-07', '2026-10-08', '2026-10-09'].map(d => Date.parse(d) / 1000), indicators: { quote: [{ close: closes }] } }] } };
}
test('global quotes compare the prior daily close, including a missing current bar', () => {
  const now = Date.parse('2026-10-09T13:00:00Z');
  assert.ok(Math.abs(parseGlobalQuote(yahoo(), 'BTC-USD', now).changePct! - 2) < 1e-9);
  assert.ok(Math.abs(parseGlobalQuote(yahoo([90, 100, null]), 'BTC-USD', now).changePct! - 2) < 1e-9);
  assert.throws(() => parseGlobalQuote(yahoo(), 'ETH-USD', now));
  assert.throws(() => parseGlobalQuote(yahoo(), 'BTC-USD', now - 86400_000));
});
test('RSS only admits safe publisher links and real supplied dates', () => {
  const body = '<rss><channel><item><title>Oil &amp; rates</title><link>https://example.com/oil</link><pubDate>Fri, 09 Oct 2026 10:00:00 GMT</pubDate></item><item><title>Unsafe</title><link>javascript:alert(1)</link></item><item><title>Untimed</title><link>https://example.com/untimed</link></item></channel></rss>';
  const items = parseHeadlines(body, 'Publisher', ['Macro'], Date.parse('2026-10-09T12:00:00Z'));
  assert.equal(items.length, 2);
  assert.equal(items[0].headline, 'Oil & rates');
  assert.equal(items[0].publishedAt, '2026-10-09T10:00:00.000Z');
  assert.equal(items[1].publishedAt, null);
  assert.throws(() => parseHeadlines('<html>Unavailable</html>', 'Publisher', []));
});
test('global loader shares concurrent refreshes and exposes cold provider outages', async () => {
  let calls = 0;
  const fetcher = (async () => { calls++; return new Response('Unavailable', { status: 503 }); }) as typeof fetch;
  const load = createGlobalLoader(fetcher, () => Date.parse('2026-10-09T12:00:00Z'));
  const [a, b] = await Promise.all([load(), load()]);
  assert.equal(a, b);
  assert.equal(calls, 16);
  assert.equal(a.quotes.length, 0);
  assert.equal(a.unavailable.length, 12);
  assert.equal(a.headlines.length, 0);
  assert.equal(a.sentiment, null);
  await load(); assert.equal(calls, 16);
});
