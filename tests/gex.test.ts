import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregate, exposure, netAt, gammaFlips, easternTimestamp, expiryTime, analyze, snapshotSchema, freshness, type Contract } from '../src/lib/gex/model';
import { parseChain } from '../scripts/gex';

const asOf = '2026-10-23T15:00:00.000Z';
const contracts: Contract[] = [
  {strike:105,expiry:'2026-10-30',side:'C',gamma:.02,iv:.25,oi:1000},
  {strike:95,expiry:'2026-10-30',side:'P',gamma:.02,iv:.25,oi:1200},
];
test('GEX uses contract multiplier, 1% move and call-minus-put convention', () => {
  assert.equal(exposure(contracts[0],100),200000);
  const rows=aggregate(contracts,100);
  assert.equal(rows.find(r=>r.strike===105)!.net,200000);
  assert.equal(rows.find(r=>r.strike===95)!.net,-240000);
  assert.equal(rows.reduce((sum,r)=>sum+r.net,0),-40000);
  const combined=aggregate(contracts.map(c=>({...c,strike:100})),100);
  assert.equal(combined.length,1); assert.equal(combined[0].net,-40000); assert.equal(combined[0].gross,440000);
});
test('hypothetical gamma is anchored at source and the reported flip actually crosses zero', () => {
  assert.ok(Math.abs(netAt(contracts,100,100,asOf)+40000)<.00001);
  const [flip]=gammaFlips(contracts,100,asOf);
  assert.ok(flip>95 && flip<105);
  assert.ok(netAt(contracts,100,flip-.01,asOf)*netAt(contracts,100,flip+.01,asOf)<0);
  assert.deepEqual(gammaFlips([contracts[0]],100,asOf),[]);
});
test('exchange timestamps and expiry account for US DST independently of machine timezone', () => {
  assert.equal(easternTimestamp('2026-10-23 15:59:59'),'2026-10-23T19:59:59.000Z');
  assert.equal(easternTimestamp('2026-11-06 15:59:59'),'2026-11-06T20:59:59.000Z');
  assert.equal(expiryTime('2026-10-30'),+new Date('2026-10-30T20:00:00Z'));
  assert.equal(expiryTime('2026-11-06'),+new Date('2026-11-06T21:00:00Z'));
});
function provider() {
  return {symbol:'QQQ',timestamp:'2026-10-23 11:00:00',data:{current_price:100,open:99,high:101,low:98,prev_day_close:99,last_trade_time:'2026-10-23T10:59:59',options:Array.from({length:12},(_,i)=>({option:`QQQ261030${i%2?'C':'P'}${String((95+i)*1000).padStart(8,'0')}`,gamma:.02,iv:.25,open_interest:1000}))}};
}
test('provider validation rejects wrong identities, future times, duplicate and badly malformed chains', () => {
  const now=new Date('2026-10-23T16:00:00Z');
  const s=parseChain(provider(),now); assert.equal(s.contracts.length,12); assert.equal(s.spot,100);
  assert.throws(()=>parseChain({...provider(),symbol:'SPY'},now));
  assert.throws(()=>parseChain({...provider(),timestamp:'2027-01-01 11:00:00'},now));
  const bad=provider();bad.data.options[1]=bad.data.options[0];assert.throws(()=>parseChain(bad,now));
  const negative=provider();negative.data.options[0].open_interest=-1;assert.throws(()=>parseChain(negative,now));
});
test('expiry selection excludes expired contracts and returns empty windows honestly', () => {
  const s=parseChain(provider(),new Date('2026-10-23T16:00:00Z'));
  assert.equal(analyze(s,1).contracts.length,0);
  assert.equal(analyze(s,30).contracts.length,12);
  s.chainAsOf='2026-10-30T20:00:01Z'; assert.equal(analyze(s,90).contracts.length,0);
});

test('calendar windows include the whole final expiry date and exclude the next date', () => {
  const s = parseChain(provider(), new Date('2026-10-23T16:00:00Z'));
  s.contracts.push({ ...s.contracts[0], expiry: '2026-10-31' });
  assert.equal(analyze(s, 7).contracts.length, 12);
  assert.equal(analyze(s, 8).contracts.length, 13);
  s.chainAsOf = '2026-10-30T19:59:59Z';
  assert.equal(analyze(s, 0).contracts.length, 12);
  s.chainAsOf = '2026-10-30T20:00:00Z';
  assert.equal(analyze(s, 0).contracts.length, 0);
});

test('walls use exact strikes while chart buckets preserve totals', () => {
  const s = parseChain(provider(), new Date('2026-10-23T16:00:00Z'));
  s.contracts = [
    { ...contracts[0], strike: 100.1, oi: 600 },
    { ...contracts[0], strike: 100.4, oi: 600 },
    { ...contracts[0], strike: 101, oi: 1000 },
    { ...contracts[1], strike: 99.5 },
    { ...contracts[0], strike: 150, oi: 100000 },
  ];
  const b = analyze(s, 30);
  assert.equal(b.callWall?.strike, 101);
  assert.equal(b.putWall?.strike, 99.5);
  assert.equal(b.levels.length, 5);
  assert.equal(b.net, b.contracts.reduce((v, c) => v + (c.side === 'C' ? 1 : -1) * exposure(c, s.spot), 0));
  for (const step of [1, 2, 5]) {
    const rows = aggregate(b.contracts, s.spot, step);
    assert.equal(rows.reduce((v, r) => v + r.net, 0), b.net);
    assert.equal(rows.reduce((v, r) => v + r.gross, 0), b.gross);
  }
});

test('expiry contributions reconcile to full-book gross and signed net; largest need not be nearest', () => {
  const s = parseChain(provider(), new Date('2026-10-23T16:00:00Z'));
  s.contracts.push({ ...contracts[1], expiry: '2026-11-06', oi: 100000 });
  const b = analyze(s, 30);
  assert.equal(b.nearestExpiry, '2026-10-30');
  assert.equal(b.largestExpiry?.expiry, '2026-11-06');
  assert.ok(b.largestExpiry!.net < 0);
  assert.equal(b.expiries.reduce((sum, r) => sum + r.gross, 0), b.gross);
  assert.equal(b.expiries.reduce((sum, r) => sum + r.net, 0), b.net);
});

test('flip scan detects an exact grid zero and multiple non-monotonic crossings', () => {
  const symmetric = contracts.map(c => ({ ...c, oi: 1000 }));
  assert.equal(netAt(symmetric, 100, 100, asOf), 0);
  assert.ok(gammaFlips(symmetric, 100, asOf).some(f => Math.abs(f - 100) < 1e-6));
  const multi: Contract[] = [
    { ...contracts[0], strike: 100, gamma: .08, oi: 1000, iv: .15 },
    { ...contracts[1], strike: 95, gamma: .02, oi: 1000, iv: .15 },
    { ...contracts[1], strike: 105, gamma: .02, oi: 1000, iv: .15 },
  ];
  const flips = gammaFlips(multi, 100, asOf);
  assert.equal(flips.length, 2);
  assert.ok(flips.some(f => f < 100) && flips.some(f => f > 100));
  for (const f of flips) assert.ok(netAt(multi, 100, f - .001, asOf) * netAt(multi, 100, f + .001, asOf) < 0);
  const s = parseChain(provider(), new Date('2026-10-23T16:00:00Z'));
  s.contracts = multi;
  assert.equal(analyze(s, 30).regime, 'Positive');
  assert.deepEqual(gammaFlips([], 100, asOf), []);
  assert.deepEqual(gammaFlips([symmetric[0], { ...symmetric[0], side: 'P' }], 100, asOf), []);
  assert.deepEqual(gammaFlips([{ ...symmetric[0], oi: 1 }, { ...symmetric[1], oi: 1e12 }], 100, asOf), []);
});

test('anchored scenario agrees with independent Black-Scholes gamma ratios', () => {
  const gamma = (c: Contract, spot: number) => {
    const t = (expiryTime(c.expiry) - +new Date(asOf)) / (365.25 * 86400_000);
    const d1 = (Math.log(spot / c.strike) + .5 * c.iv ** 2 * t) / (c.iv * Math.sqrt(t));
    return Math.exp(-.5 * d1 ** 2) / (Math.sqrt(2 * Math.PI) * spot * c.iv * Math.sqrt(t));
  };
  for (const spot of [80, 95, 100, 105, 120]) {
    const expected = contracts.reduce((sum, c) => sum + (c.side === 'C' ? 1 : -1) * exposure(c, spot) * gamma(c, spot) / gamma(c, 100), 0);
    assert.ok(Math.abs(netAt(contracts, 100, spot, asOf) - expected) < Math.max(1e-6, Math.abs(expected) * 1e-10));
  }
});

test('snapshot validation rejects fractional OI, invalid dates, duplicate series and inconsistent source time', () => {
  const s = parseChain(provider(), new Date('2026-10-23T16:00:00Z'));
  assert.equal(snapshotSchema.safeParse({ ...s, contracts: [...s.contracts, s.contracts[0]] }).success, false);
  for (const change of [{ oi: .5 }, { expiry: '2026-02-30' }]) {
    assert.equal(snapshotSchema.safeParse({ ...s, contracts: s.contracts.map((c, i) => i ? c : { ...c, ...change }) }).success, false);
  }
  assert.equal(snapshotSchema.safeParse({ ...s, quoteAsOf: '2026-10-24T16:00:00Z' }).success, false);
});

test('log-space repricing retains finite exposure when the intermediate gamma ratio would overflow', () => {
  const c = { ...contracts[0], gamma: 1e-300, iv: .008 };
  const t = (expiryTime(c.expiry) - +new Date(asOf)) / (365.25 * 86400_000);
  const d0 = (Math.log(100 / c.strike) + c.iv * c.iv * t / 2) / (c.iv * Math.sqrt(t));
  const d1 = (Math.log(105 / c.strike) + c.iv * c.iv * t / 2) / (c.iv * Math.sqrt(t));
  assert.ok((d0*d0-d1*d1)/2 > 709);
  const expected = Math.exp(Math.log(exposure(c, 105)) + Math.log(100 / 105) + (d0*d0-d1*d1)/2);
  const actual = netAt([c], 100, 105, asOf);
  assert.ok(Number.isFinite(actual) && actual > 1e100);
  assert.ok(Math.abs(actual / expected - 1) < 1e-10);
});

test('freshness considers chain and quote age even if the capture is new', () => {
  const s = parseChain(provider(), new Date('2026-10-23T16:00:00Z'));
  const now = +new Date('2026-10-26T15:00:00Z');
  const fresh = { ...s, retrievedAt: new Date(now).toISOString(), chainAsOf: '2026-10-26T14:45:00Z', quoteAsOf: '2026-10-26T14:30:00Z' };
  assert.equal(freshness(fresh, now).stale, false);
  assert.equal(freshness({ ...fresh, chainAsOf: s.chainAsOf }, now).stale, true);
  assert.equal(freshness({ ...fresh, quoteAsOf: s.quoteAsOf }, now).stale, true);
  assert.equal(freshness(s, +new Date('2026-10-24T15:00:00Z')).stale, false);
  assert.equal(freshness(s, +new Date('2026-10-31T15:00:00Z')).stale, true);
  const empty = analyze({ ...s, contracts: [] }, 30);
  assert.equal(empty.gross, 0); assert.equal(empty.net, 0); assert.equal(empty.largestExpiry, null);
  assert.deepEqual(empty.flips, []); assert.deepEqual(empty.upside, []); assert.deepEqual(empty.downside, []);
});
