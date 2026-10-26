import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { intelSchema, parseIntel, bangkokDate } from '../src/lib/intel/schema';
import { changesSince } from '../src/lib/intel/compare';
import { isStale, escape } from '../src/lib/format';
import { updateSnapshot, atomicWrite, recoverSnapshot } from '../scripts/update';
import { readRepository, serialize } from '../scripts/data';

const example = JSON.parse(await readFile(resolve('data/intel/example.json'), 'utf8'));
const fixture = () => ({ ...structuredClone(example), kind: 'briefing' });
async function sandbox(run: (root: string, input: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'mango-intel-test-'));
  try {
    await mkdir(join(root, 'data/intel/archive'), { recursive: true });
    const baseline = fixture();
    const bytes = serialize(parseIntel(baseline));
    await writeFile(join(root, 'data/intel/current.json'), bytes);
    await writeFile(join(root, 'data/intel/archive/2026-01-15.json'), bytes);
    const input = join(root, 'candidate.json');
    await writeFile(input, JSON.stringify({ ...baseline, generatedAt: '2026-01-16T08:00:00+07:00', asOfDate: '2026-01-16' }));
    await run(root, input);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('complete documentation fixture validates but cannot be published', () => {
  assert.equal(intelSchema.parse(example).schemaVersion, 1);
  assert.throws(() => parseIntel(example), /Example fixtures/);
});
test('normalizes whitespace and symbol case without inventing fields', () => {
  const value = fixture(); value.markets[0].symbol = ' nq '; value.overview.oneLineTake = '  Research  ';
  const result = parseIntel(value);
  assert.equal(result.markets[0]!.symbol, 'NQ'); assert.equal(result.overview?.oneLineTake, 'Research');
});
test('rejects schema drift, invalid enums, missing timestamps and malformed collections', () => {
  for (const alter of [
    (v: any) => { v.schemaVersion = 2; }, (v: any) => { v.extra = true; },
    (v: any) => { v.overview.sentiment = 'strong_buy'; }, (v: any) => { delete v.generatedAt; },
    (v: any) => { v.events = {}; }, (v: any) => { v.nq.megaCaps = ['NVDA']; },
    (v: any) => { v.markets[0].source = null; }, (v: any) => { v.markets[0].price = null; },
    (v: any) => { v.markets[0].status = 'unavailable'; }, (v: any) => { v.markets.push(v.markets[0]); },
    (v: any) => { v.events[0].datetime = '2026-01-15T19:30:00'; },
    (v: any) => { v.events[0].date = '2026-02-30'; }, (v: any) => { v.events[0].date = '2026-01-16'; },
    (v: any) => { v.events[1].timeLabel = null; }, (v: any) => { v.timezone = 'UTC'; },
    (v: any) => { v.asOfDate = '2026-01-16'; }, (v: any) => { v.intelligence[0].url = 'javascript:alert(1)'; },
    (v: any) => { v.intelligence[0].url = 'https://user:pass@example.com'; },
    (v: any) => { v.markets[0].updatedAt = '2026-01-16T00:00:00Z'; },
    (v: any) => { v.intelligence[0].publishedAt = '2026-01-16T00:00:00Z'; },
    (v: any) => { v.markets[0].instrumentType = 'cfd'; },
    (v: any) => { v.markets[1].unit = 'points'; },
  ]) { const value = fixture(); alter(value); assert.throws(() => parseIntel(value)); }
});
test('rejects future generation time and handles Bangkok date boundaries', () => {
  assert.throws(() => parseIntel(fixture(), true, Date.parse('2026-01-14T00:00:00Z')), /future/);
  assert.equal(bangkokDate('2026-01-14T18:00:00Z'), '2026-01-15');
  assert.equal(isStale('2026-01-15', Date.parse('2026-01-17T00:00:00Z')), true);
});
test('only compares known values and safely escapes research text', () => {
  const before = parseIntel(fixture()); const after = structuredClone(before);
  after.overview!.sentiment = 'bearish'; after.nq!.bias = null;
  assert.deepEqual(changesSince(after, before).map(c => c.label), ['Sentiment']);
  assert.deepEqual(changesSince(after, null), []);
  assert.equal(escape('<script>"&'), '&lt;script&gt;&quot;&amp;');
});
test('malformed JSON and schema errors leave current and archives byte-for-byte unchanged', async () => sandbox(async (root, input) => {
  const path = join(root, 'data/intel/current.json'); const before = await readFile(path, 'utf8');
  for (const bad of ['{', JSON.stringify({ schemaVersion: 99 }), JSON.stringify(example)]) {
    await writeFile(input, bad);
    await assert.rejects(updateSnapshot(input, { root, verify: async () => assert.fail('must not build invalid input') }));
    assert.equal(await readFile(path, 'utf8'), before);
    assert.deepEqual(await readdir(join(root, 'data/intel/archive')), ['2026-01-15.json']);
  }
}));
test('build failure leaves previous current and archives intact', async () => sandbox(async (root, input) => {
  const before = await readFile(join(root, 'data/intel/current.json'), 'utf8');
  await assert.rejects(updateSnapshot(input, { root, verify: async () => { throw new Error('Simulated production build failure'); } }), /build failure/);
  assert.equal(await readFile(join(root, 'data/intel/current.json'), 'utf8'), before);
  assert.deepEqual(await readdir(join(root, 'data/intel/archive')), ['2026-01-15.json']);
}));
test('successful staged update writes matching archive, preserves history and supports rollback', async () => sandbox(async (root, input) => {
  const before = await readFile(join(root, 'data/intel/current.json'), 'utf8');
  const result = await updateSnapshot(input, { root, verify: async stage => { assert.equal((await readRepository(stage)).current.asOfDate, '2026-01-16'); assert.equal(await readFile(join(root, 'data/intel/current.json'), 'utf8'), before); } });
  const repo = await readRepository(join(root, 'data/intel'));
  assert.equal(repo.current.asOfDate, '2026-01-16'); assert.equal(repo.dates.length, 2);
  await result.rollback(); assert.equal(await readFile(join(root, 'data/intel/current.json'), 'utf8'), before);
  assert.equal((await readRepository(join(root, 'data/intel'))).dates.length, 1);
}));
test('failed current-file rename rolls back the already-written archive', async () => sandbox(async (root, input) => {
  const before = await readFile(join(root, 'data/intel/current.json'), 'utf8');
  await assert.rejects(updateSnapshot(input, { root, verify: async () => {}, replace: async (path, bytes) => { if (path.endsWith('current.json')) throw new Error('Simulated disk failure'); await atomicWrite(path, bytes); } }), /disk failure/);
  assert.equal(await readFile(join(root, 'data/intel/current.json'), 'utf8'), before);
  assert.deepEqual(await readdir(join(root, 'data/intel/archive')), ['2026-01-15.json']);
}));
test('repeated payload is a no-op and timestamp rollback is refused', async () => sandbox(async (root, input) => {
  await writeFile(input, serialize(parseIntel(fixture())));
  assert.equal((await updateSnapshot(input, { root, verify: async () => assert.fail('no-op must not build') })).changed, false);
  const old = fixture(); old.generatedAt = '2026-01-15T07:59:00+07:00';
  await writeFile(input, JSON.stringify(old));
  await assert.rejects(updateSnapshot(input, { root }), /backwards/);
}));
test('recovery journal restores an interrupted promotion', async () => sandbox(async (root) => {
  const current = await readFile(join(root, 'data/intel/current.json'), 'utf8');
  await mkdir(join(root, '.intel-work'));
  await writeFile(join(root, '.intel-work/recovery.json'), JSON.stringify({ current, archive: null, date: '2026-01-16' }));
  await writeFile(join(root, '.intel-work/update.lock'), '');
  await writeFile(join(root, 'data/intel/archive/2026-01-16.json'), current);
  await recoverSnapshot(root);
  assert.equal((await readRepository(join(root, 'data/intel'))).dates.length, 1);
}));
test('repository rejects damaged archives and current/archive mismatches', async () => sandbox(async (root) => {
  await writeFile(join(root, 'data/intel/archive/2026-01-15.json'), '{}');
  await assert.rejects(readRepository(join(root, 'data/intel')));
}));
test('same-day update replaces just that date and rejects changed data at the same timestamp', async () => sandbox(async (root, input) => {
  const changed = fixture(); changed.overview.oneLineTake = 'A changed research view';
  await writeFile(input, JSON.stringify(changed));
  await assert.rejects(updateSnapshot(input, { root }), /newer generatedAt/);
  changed.generatedAt = '2026-01-15T09:00:00+07:00';
  await writeFile(input, JSON.stringify(changed));
  const result = await updateSnapshot(input, { root, verify: async () => {} });
  const repo = await readRepository(join(root, 'data/intel'));
  assert.equal(repo.dates.length, 1); assert.equal(repo.current.overview!.oneLineTake, changed.overview.oneLineTake);
  await result.rollback(); assert.equal((await readRepository(join(root, 'data/intel'))).current.generatedAt, fixture().generatedAt);
}));
test('oversized inputs and concurrent writers fail closed', async () => sandbox(async (root, input) => {
  await writeFile(input, ' '.repeat(1_048_577));
  await assert.rejects(updateSnapshot(input, { root }), /exceeds 1 MiB/);
  await writeFile(join(root, '.intel-work/update.lock'), '');
  await assert.rejects(updateSnapshot(input, { root }), /Another update/);
  await rm(join(root, '.intel-work/update.lock'));
  await writeFile(join(root, '.intel-work/publish.lock'), '');
  await assert.rejects(updateSnapshot(input, { root }), /publish is already/);
}));
