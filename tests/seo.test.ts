import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SITE_ORIGIN, PUBLIC_PATHS } from '../src/lib/site';

const files: Record<string, string> = { '/': 'index.html', '/visual': 'visual.html', '/global': 'global.html', '/gex': 'gex.html', '/tools': 'tools.html', '/tools/calculator-futures': 'tools/calculator-futures.html' };
const attr = (html: string, pattern: RegExp) => pattern.exec(html)?.[1];

for (const path of PUBLIC_PATHS) test(`${path} is indexable with canonical, OG and Twitter tags on ${SITE_ORIGIN}`, () => {
  const html = readFileSync(files[path], 'utf8');
  assert.doesNotMatch(html, /name="robots"[^>]*noindex/);
  assert.equal(attr(html, /<link rel="canonical" href="([^"]+)"/), SITE_ORIGIN + path);
  assert.equal(attr(html, /property="og:url" content="([^"]+)"/), SITE_ORIGIN + path);
  assert.equal(attr(html, /property="og:image" content="([^"]+)"/), `${SITE_ORIGIN}/logo-transparent.png`);
  for (const tag of ['og:title', 'og:description', 'og:type']) assert.ok(attr(html, new RegExp(`property="${tag}" content="([^"]+)"`)), tag);
  assert.ok(attr(html, /name="twitter:card" content="([^"]+)"/));
  assert.doesNotMatch(html, /application\/ld\+json/);
});

test('sitemap lists every public page and robots points at it on the canonical origin', () => {
  const sitemap = readFileSync('public/sitemap.xml', 'utf8');
  assert.deepEqual([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]).sort(), PUBLIC_PATHS.map(p => SITE_ORIGIN + p).sort());
  assert.match(readFileSync('public/robots.txt', 'utf8'), new RegExp(`Sitemap: ${SITE_ORIGIN.replace(/\./g, '\\.')}/sitemap\\.xml`));
});
