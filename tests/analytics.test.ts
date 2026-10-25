import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { shouldTrack } from '../src/lib/analytics';
import { pageInputs } from '../vite.config';

test('Vercel Web Analytics only tracks production hostnames', () => {
  assert.equal(shouldTrack('mangoatlas.xyz'), true);
  assert.equal(shouldTrack('www.mangoatlas.xyz'), true);
  assert.equal(shouldTrack('localhost'), false);
  assert.equal(shouldTrack('mango-landing-git-main-jbrz0.vercel.app'), false);
});

test('every HTML entry loads a script that imports Vercel Web Analytics', async () => {
  for (const html of Object.values(pageInputs)) {
    const source = await readFile(html, 'utf8');
    const entry = /<script type="module" src="\/([^"]+)"/.exec(source)?.[1];
    assert.ok(entry, `${html} has no module entry`);
    const code = await readFile(entry, 'utf8');
    assert.match(code, /^import '\.{1,2}\/lib\/analytics';/m, `${entry} does not import analytics`);
  }
});
