import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregate, exposure, netAt, gammaFlips, easternTimestamp, expiryTime, analyze, type Contract } from '../src/lib/gex/model';
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
