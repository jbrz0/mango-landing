import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMarketLoader, parseCboe, parseTreasury } from '../server/market-data';
import { dailyStatus, macroResponseSchema, treasuryYieldUrl } from '../src/lib/markets/schema';

const csv = 'DATE,OPEN,HIGH,LOW,CLOSE\n09/29/2026,16,17,15,16.04\n09/30/2026,16,17,15,16.34\n';
function treasury(rows: Array<[string, string | null]>) {
  return `<?xml version="1.0"?><feed xmlns:d="d" xmlns:m="m">${rows.map(([date, value]) => `<entry><content><m:properties><d:NEW_DATE m:type="Edm.DateTime">${date}T00:00:00</d:NEW_DATE>${value === null ? '<d:BC_10YEAR m:null="true"/>' : `<d:BC_10YEAR m:type="Edm.Double">${value}</d:BC_10YEAR>`}</m:properties></content></entry>`).join('')}</feed>`;
}
const xml = treasury([['2026-09-29', '5.26'], ['2026-09-30', '5.29']]);

test('official feeds preserve observation dates, decimal yields and closes', () => {
  assert.deepEqual(parseCboe(csv, '2026-10-01').at(-1), { date: '2026-09-30', value: 16.34 });
  assert.deepEqual(parseTreasury(xml, '2026-10-01').at(-1), { date: '2026-09-30', value: 5.29 });
  assert.equal(parseTreasury(treasury([['2026-09-29', null], ['2026-09-30', '5.29']]), '2026-10-01').length, 1);
});

test('rejects unexpected HTML, malformed, non-finite and future prices without fabricating zero', () => {
  assert.throws(() => parseCboe('<html>blocked</html>', '2026-10-01'));
  assert.throws(() => parseCboe(csv.replace('16.34', ''), '2026-10-01'));
  assert.throws(() => parseCboe(csv.replace('16.34', 'NaN'), '2026-10-01'));
  assert.throws(() => parseCboe(csv.replace('09/30/2026', '02/30/2026'), '2026-10-01'));
  assert.throws(() => parseCboe(csv, '2026-09-29'));
  assert.throws(() => parseTreasury('<html>blocked</html>', '2026-10-01'));
  assert.throws(() => parseTreasury(xml.replace('5.29', 'N/A'), '2026-10-01'));
});

test('deduplicates concurrent requests, caches results, and preserves dated last success on partial failure', async () => {
  let calls = 0; let failed = false; let time = Date.parse('2026-10-01T05:00:00Z');
  const fetcher: typeof fetch = async input => {
    calls++;
    if (failed && String(input).includes('/VIX_')) throw new Error('upstream down');
    return new Response(String(input).includes('treasury') ? xml : csv);
  };
  const load = createMarketLoader(fetcher, () => time);
  const [a, b] = await Promise.all([load(), load()]);
  assert.equal(calls, 4); assert.deepEqual(a, b); macroResponseSchema.parse(a);
  await load(); assert.equal(calls, 4);
  time += 16 * 60_000; failed = true;
  const next = await load(); const retained = next.series.find(s => s.symbol === 'VIX')!;
  assert.equal(calls, 8); assert.equal(retained.refreshFailed, true);
  assert.equal(retained.retrievedAt, a.series[0].retrievedAt);
  assert.deepEqual(retained.points, a.series[0].points);
  assert.equal(next.series.find(s => s.symbol === 'VXN')?.refreshFailed, false);
});

test('cold provider failure is explicit and does not block the other source', async () => {
  const load = createMarketLoader(async input => {
    if (String(input).includes('treasury')) return new Response(xml);
    return new Response('unavailable', { status: 503 });
  }, () => Date.parse('2026-10-01T05:00:00Z'));
  const data = await load(); macroResponseSchema.parse(data);
  assert.deepEqual(data.unavailable, ['VIX', 'VXN']);
  assert.equal(data.series[0].symbol, 'US10Y');
});

test('Treasury year rollover accepts an empty year or its first observation', async () => {
  for (const current of ['<feed/>', treasury([['2027-01-04', '4.00']])]) {
    const load = createMarketLoader(async input => new Response(String(input).includes('treasury') ? String(input).endsWith('2027') ? current : xml : csv), () => Date.parse('2027-01-05T12:00:00Z'));
    const data = await load();
    assert.equal(data.unavailable.length, 0);
    assert.ok(data.series.find(s => s.symbol === 'US10Y')!.points.length >= 2);
  }
});

test('daily age allows weekends while flagging old or failed observations', () => {
  const data = { symbol: 'VIX' as const, points: parseCboe(csv, '2026-10-01'), retrievedAt: '2026-10-01T00:00:00Z', refreshFailed: false };
  assert.equal(dailyStatus(data, Date.parse('2026-10-04T12:00:00Z')), 'Daily observation');
  assert.equal(dailyStatus(data, Date.parse('2026-10-08T12:00:00Z')), 'Last published observation');
  assert.equal(dailyStatus({ ...data, refreshFailed: true }), 'Refresh failed · Last known');
});

test('the US10Y source link opens the current-year Treasury par yield table', () => {
  assert.equal(treasuryYieldUrl(new Date('2026-10-26T00:00:00Z')), 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_yield_curve&field_tdr_date_value=2026');
});
