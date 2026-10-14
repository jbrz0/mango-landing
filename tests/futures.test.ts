import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateFutures, contractFromUrl, parseFuturesNumber } from '../src/lib/futures';
import type { Contract } from '../src/lib/global/calculator';

test('all ten CME contracts calculate dollar P&L and required points in both directions', () => {
  const pointValues: Record<Contract, number> = { NQ: 20, ES: 50, MNQ: 2, MES: 5, GC: 100, MGC: 10, CL: 1000, MCL: 100, BTC: 5, MBT: 0.1 };
  for (const [symbol, point] of Object.entries(pointValues)) {
    assert.deepEqual(calculateFutures(symbol as Contract, 10, 'points', 150), { points: 150, money: 1500 * point });
    assert.deepEqual(calculateFutures(symbol as Contract, 10, 'money', 3000), { points: 300 / point, money: 3000 });
  }
  assert.equal(calculateFutures('CL', 2, 'points', 0.1).money, 200);
  assert.deepEqual(calculateFutures('MNQ', 10, 'money', -3000), { points: -150, money: -3000 });
  assert.deepEqual(calculateFutures('MNQ', 10, 'points', 0), { points: 0, money: 0 });
  assert.ok(Math.abs(calculateFutures('MNQ', 3, 'money', 100).points - 16.666666666666668) < 1e-12);
});

test('blank, invalid, fractional and excessive quantities cannot produce misleading results', () => {
  for (const quantity of [0, -1, 1.5, NaN, Infinity, 100001]) assert.throws(() => calculateFutures('MNQ', quantity, 'money', 3000));
  for (const value of [NaN, Infinity, -Infinity, Number.MAX_VALUE]) assert.throws(() => calculateFutures('MNQ', 10, 'points', value));
  assert.equal(parseFuturesNumber(''), null);
  assert.equal(parseFuturesNumber('   '), null);
  assert.equal(parseFuturesNumber('-0.25'), -0.25);
  assert.equal(parseFuturesNumber('.25'), 0.25);
  assert.equal(parseFuturesNumber('$3,000.50', true), 3000.5);
  assert.equal(parseFuturesNumber('100,000'), 100000);
  for (const input of ['-', '.', 'abc', '1,5', '1,00', '3.4.5', 'Infinity', '1e100', '<script>']) assert.equal(parseFuturesNumber(input), null);
});

test('contract deep links accept supported symbols and safely fall back on unknown links', () => {
  const url = (suffix: string) => new URL(`https://mangoatlas.xyz/tools/calculator-futures${suffix}`);
  assert.equal(contractFromUrl(url('#mnq')), 'MNQ');
  assert.equal(contractFromUrl(url('#MBT')), 'MBT');
  assert.equal(contractFromUrl(url('?contract=gc')), 'GC');
  assert.equal(contractFromUrl(url('?contract=GC#es')), 'ES');
  assert.equal(contractFromUrl(url('?contract=CL#unknown')), 'CL');
  assert.equal(contractFromUrl(url('#%3Cscript%3E')), 'MNQ');
});
