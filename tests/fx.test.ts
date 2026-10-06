import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fxBiasLabel } from '../src/lib/intel/fx';
import type { Intel } from '../src/lib/intel/schema';

type Instrument = NonNullable<Intel['fx']>['instruments'][number];
const instrument = (values: Partial<Instrument> = {}): Instrument => ({
  symbol: 'XAUUSD', bias: null, driver: null, posture: null,
  support: [], resistance: [], comments: null, ...values,
});

test('missing FX bias reflects explicit watch-only research without inventing a direction', () => {
  assert.equal(fxBiasLabel(instrument({ posture: 'Watch only above 4,120. Only a close above 4,170 turns it bullish.' })), 'Watch only');
  assert.equal(fxBiasLabel(instrument({ posture: 'Stand aside into NFP. Soft jobs: buy dips; hot jobs: sell.' })), 'Watch only');
  assert.equal(fxBiasLabel(instrument({ comments: 'Watch only / chop.' })), 'Watch only');
  assert.equal(fxBiasLabel(instrument({ driver: 'Bullish dollar pressures gold.' })), 'Bias not supplied');
  assert.equal(fxBiasLabel(instrument({ posture: 'Sell rallies, but stand aside if support breaks.' })), 'Bias not supplied');
  assert.equal(fxBiasLabel(instrument()), 'Bias not supplied');
});

test('explicit published FX bias wins over a watch-only posture', () => {
  assert.equal(fxBiasLabel(instrument({ bias: 'mildly_bullish', posture: 'Watch only in this range.' })), undefined);
  assert.equal(fxBiasLabel(instrument({ bias: 'neutral' })), undefined);
});
