import { test } from 'node:test';
import assert from 'node:assert/strict';
import snapshot from '../public/data/gex/current.json' with { type: 'json' };
import { analyze, snapshotSchema } from '../src/lib/gex/model';
import { wallsGeometry } from '../src/components/gex-walls';

const s = snapshotSchema.parse(snapshot);
const book = analyze(s,30);
test('fit levels includes every marker and uses one maximum for both sides', () => {
  const g = wallsGeometry(s,book,'levels');
  assert.equal(g.markers.length,4);
  for (const m of g.markers) assert.ok(m.value > g.low && m.value < g.high);
  assert.equal(g.max,Math.max(...g.rows.flatMap(r=>[r.call,r.put])));
  for (const a of g.annotations) assert.equal(a.y,g.y(a.value));
});
test('nearby levels retain exact line positions while labels remain separated', () => {
  const b = {...book, callWall:{...book.callWall!,strike:s.spot+.01},putWall:{...book.putWall!,strike:s.spot-.01},flips:[s.spot+.02]};
  const g = wallsGeometry(s,b,'levels');
  for(let i=1;i<g.annotations.length;i++) assert.ok(g.annotations[i].labelY-g.annotations[i-1].labelY>=29.99);
  for(const a of g.annotations) { assert.equal(a.y,g.y(a.value)); assert.ok(a.labelY>=g.top+14 && a.labelY<=g.bottom-14); }
});
test('fixed ranges keep out-of-view levels in the key without plotting a false boundary line', () => {
  const b = {...book,flips:[s.spot*1.15]};
  const g = wallsGeometry(s,b,.02);
  assert.equal(g.markers.filter(m=>m.kind==='flip').length,1);
  assert.equal(g.annotations.filter(m=>m.kind==='flip').length,0);
  assert.equal(g.low,s.spot*.98); assert.equal(g.high,s.spot*1.02);
  assert.equal(wallsGeometry(s,{...book,callWall:null,putWall:null,flips:[]},'levels').markers.length,1);
});
