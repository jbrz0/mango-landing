import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildLens } from '../src/pages/visual-data';
import { layoutFxLevels } from '../src/pages/visual-layout';
import type { Intel } from '../src/lib/intel/schema';

const fixture = JSON.parse(await readFile(new URL('../data/intel/example.json', import.meta.url), 'utf8')) as Intel;

test('leaders merge repeated symbols, preserve research, and exclude Nasdaq benchmarks', () => {
  const data = structuredClone(fixture);
  data.nq!.megaCaps = [{ symbol: 'AAPL', changePct: 1, context: 'Regular session.', source: 'Close source', updatedAt: '2026-01-15T00:00:00Z' }];
  data.nq!.premarket = [
    { symbol: 'AAPL', changePct: null, context: 'Watch before the open.', source: 'Research source', updatedAt: null },
    { symbol: 'NQ', changePct: null, context: 'Index research.', source: 'Research source', updatedAt: null },
  ];
  const before = structuredClone(data);
  const leaders = buildLens(data, [], 'leadership');
  assert.deepEqual(leaders.nodes.map(node => node.label), ['AAPL', 'NVDA']);
  assert.deepEqual([...new Set(leaders.nodes.map(node => node.group))], ['Leaders']);
  assert.equal(leaders.nodes[0]!.metric, 1);
  assert.match(leaders.nodes[0]!.note, /Regular session\.[\s\S]*Watch before the open\./);
  assert.equal(leaders.nodes[0]!.details.find(row => row.label === 'Source')!.value, 'Close source');
  assert.deepEqual(data, before);
  data.nq!.premarket[0] = { ...data.nq!.premarket[0]!, changePct: -0.5, updatedAt: '2026-01-15T01:00:00Z' };
  const updated = buildLens(data, [], 'leadership').nodes.find(node => node.label === 'AAPL')!;
  assert.equal(updated.metric, -0.5);
  assert.equal(updated.details.find(row => row.label === 'Source')!.value, 'Research source');
});

test('FX planes increase with price and retain proportional distances and exact values', () => {
  const marks = [{ kind: 'support', value: 100 }, { kind: 'price', value: 110 }, { kind: 'resistance', value: 140 }] as const;
  const planes = layoutFxLevels([...marks]);
  assert.deepEqual(planes.map(plane => plane.value), [100, 110, 140]);
  const [support, quote, resistance] = planes;
  assert.ok(support!.y < quote!.y && quote!.y < resistance!.y);
  assert.ok(Math.abs((quote!.y - support!.y) / (resistance!.y - support!.y) - 0.25) < 1e-12);
  // A quote outside the research range must remain outside, without clamping.
  const outside = layoutFxLevels([{ kind: 'support', value: 100 }, { kind: 'price', value: 150 }, { kind: 'resistance', value: 140 }]);
  assert.ok(outside[1]!.y > outside[2]!.y);
});

test('missing FX bounds and quotes use explicit outlines with no invented prices', () => {
  for (const levels of [[], [{ kind: 'support' as const, value: 4155 }], [{ kind: 'support' as const, value: 4155 }, { kind: 'price' as const, value: 4179.1 }]]) {
    const planes = layoutFxLevels(levels);
    assert.equal(planes.length, 3);
    assert.ok(planes.every(plane => Number.isFinite(plane.y)));
    for (const plane of planes.filter(plane => plane.value === null)) assert.match(plane.label, /not supplied/);
    assert.equal(planes.find(plane => plane.kind === 'resistance')!.value, null);
  }
});

test('XAUUSD prefers a spot quote and explicitly identifies a GC fallback', () => {
  const data = structuredClone(fixture);
  data.fx!.instruments = [{ ...data.fx!.instruments[0]!, symbol: 'XAUUSD', support: [4155], resistance: [] }];
  data.markets = [{ ...data.markets[0]!, symbol: 'GC', label: 'Gold futures', price: 4179.1, unit: 'USD' }];
  const gold = buildLens(data, [], 'levels').nodes[0]!;
  assert.equal(gold.levels!.find(mark => mark.kind === 'price')!.label, 'GC futures proxy');
  assert.match(gold.details.find(row => row.label === 'Snapshot price')!.value, /GC futures proxy/);
  assert.equal(gold.details.find(row => row.label === 'Resistance')!.value, 'Not supplied');
  data.markets.push({ ...data.markets[0]!, symbol: 'XAUUSD', instrumentType: 'spot', label: 'Spot gold', price: 4160 });
  const spot = buildLens(data, [], 'levels').nodes[0]!;
  assert.equal(spot.levels!.find(mark => mark.kind === 'price')!.value, 4160);
  assert.equal(spot.levels!.find(mark => mark.kind === 'price')!.label, undefined);
});
