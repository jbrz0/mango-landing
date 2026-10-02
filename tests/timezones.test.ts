import test from 'node:test';
import assert from 'node:assert/strict';
import { detectTimeZone, dateKey, day, time, zoneLabel } from '../src/lib/format';
import { localizeClockReferences } from '../src/lib/intel/localize';

test('browser timezone detection falls back only when missing, invalid or inaccessible', () => {
  assert.equal(detectTimeZone(() => 'America/New_York'), 'America/New_York');
  assert.equal(detectTimeZone(() => 'UTC'), 'UTC');
  for (const resolve of [() => '', () => 'invalid', () => { throw Error('blocked'); }]) assert.equal(detectTimeZone(resolve), 'Asia/Bangkok');
});

test('timestamp conversion handles midnight and DST without shifting date-only observations', () => {
  const iso = '2026-10-02T06:30:00+07:00';
  assert.equal(dateKey(iso, 'America/New_York'), '2026-10-01');
  assert.equal(time(iso, 'America/New_York'), '7:30 PM');
  assert.equal(day('2026-10-02', false, 'America/Los_Angeles'), '02 Oct 2026');
  assert.equal(zoneLabel('2026-01-15T12:00:00Z', 'America/New_York'), 'EST');
  assert.equal(zoneLabel('2026-07-15T12:00:00Z', 'America/New_York'), 'EDT');
  assert.equal(time('2026-03-08T06:30:00Z', 'America/New_York'), '1:30 AM');
  assert.equal(time('2026-03-08T07:30:00Z', 'America/New_York'), '3:30 AM');
});

test('research clock references convert alongside catalysts, preserve explicit other zones and non-times', () => {
  for (const text of ['NFP 7:30 PM BKK', 'NFP 7:30p BKK', 'NFP 7:30p', 'NFP 19:30 ICT']) assert.equal(localizeClockReferences(text, '2026-10-02', 'America/New_York'), 'NFP 8:30 AM EDT');
  assert.equal(localizeClockReferences('CPI 6:30 AM BKK', '2026-10-02', 'America/New_York'), 'CPI 7:30 PM EDT (01 Oct 2026)');
  assert.equal(localizeClockReferences('Release 8:30 AM ET, ratio 12:30', '2026-10-02', 'Europe/London'), 'Release 8:30 AM ET, ratio 12:30');
});
