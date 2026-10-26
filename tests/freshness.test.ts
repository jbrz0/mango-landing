import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expectedBriefDate, isStale, sourceDate } from '../src/lib/format';

// Times are Bangkok wall clock (UTC+7). 2026-10-23 is a Friday; 2026-10-26 is a Monday.
const bkk = (local: string) => Date.parse(`${local}+07:00`);

test('a brief is due after 10:30 BKK on weekdays only', () => {
  assert.equal(expectedBriefDate(bkk('2026-10-26T10:29:00')), '2026-10-23');
  assert.equal(expectedBriefDate(bkk('2026-10-26T10:30:00')), '2026-10-26');
  assert.equal(expectedBriefDate(bkk('2026-10-24T12:00:00')), '2026-10-23');
  assert.equal(expectedBriefDate(bkk('2026-10-25T23:59:00')), '2026-10-23');
  assert.equal(expectedBriefDate(bkk('2026-10-27T00:30:00')), '2026-10-26');
});

test('weekend and pre-publish Monday visitors are not treated as stale', () => {
  assert.equal(isStale('2026-10-23', bkk('2026-10-25T20:00:00')), false);
  assert.equal(isStale('2026-10-23', bkk('2026-10-26T08:00:00')), false);
});

test('a missed weekday publish is stale once the due time passes', () => {
  assert.equal(isStale('2026-10-23', bkk('2026-10-26T11:00:00')), true);
  assert.equal(isStale('2026-10-26', bkk('2026-10-27T10:31:00')), true);
  assert.equal(isStale('2026-10-26', bkk('2026-10-26T11:00:00')), false);
});

test('untimed stories can take a neutral date from the publisher URL', () => {
  assert.equal(sourceDate('https://www.bloomberg.com/news/articles/2026-10-22/us-midterm-elections'), '2026-10-22');
  assert.equal(sourceDate('https://example.com/story'), null);
});
