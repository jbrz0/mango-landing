// Lean public health check for mangoatlas.xyz. No credentials; read-only GET requests.
// Usage: npm run health -- [baseUrl] [--json]
// Exit 0: no failures (warnings may be present). Exit 1: at least one failure.
import { parseIntel, validationError } from '../src/lib/intel/schema';
import { expectedBriefDate, isStale } from '../src/lib/format';
import { macroResponseSchema, dailyStatus } from '../src/lib/markets/schema';
import { equityResponseSchema } from '../src/lib/markets/equities';
import { globalSchema } from '../src/lib/global/schema';
import { snapshotSchema } from '../src/lib/gex/model';

type Level = 'ok' | 'warn' | 'fail';
type Result = { check: string; level: Level; detail: string };
const args = process.argv.slice(2);
const json = args.includes('--json');
const base = (args.find(arg => !arg.startsWith('--')) ?? process.env.HEALTH_BASE_URL ?? 'https://www.mangoatlas.xyz').replace(/\/$/, '');
const now = Date.now();
const results: Result[] = [];
const add = (check: string, level: Level, detail: string): void => { results.push({ check, level, detail }); };
const hours = (iso: string) => ((now - Date.parse(iso)) / 3600_000).toFixed(1);

async function get(path: string, redirect: RequestRedirect = 'follow') {
  const started = Date.now();
  const response = await fetch(base + path, { redirect, signal: AbortSignal.timeout(20_000), headers: { 'user-agent': 'mango-atlas-health-check' } });
  return { response, ms: Date.now() - started };
}
async function check(name: string, run: () => Promise<unknown>) {
  try { await run(); } catch (error) { add(name, 'fail', error instanceof Error ? error.message.split('\n')[0]! : String(error)); }
}

for (const path of ['/', '/gex', '/global', '/tools', '/visual', '/tools/calculator-futures']) {
  await check(`page ${path}`, async () => {
    const { response, ms } = await get(path);
    const body = await response.text();
    if (response.status !== 200) return add(`page ${path}`, 'fail', `HTTP ${response.status}`);
    if (!/<title>[^<]+<\/title>/.test(body) || !body.includes('id="app"')) return add(`page ${path}`, 'fail', 'HTML shell missing title or #app');
    add(`page ${path}`, ms > 5000 ? 'warn' : 'ok', `HTTP 200 in ${ms} ms`);
  });
}
await check('redirect /daily', async () => {
  const { response } = await get('/daily', 'manual');
  const location = response.headers.get('location') ?? '';
  add('redirect /daily', [301, 302, 307, 308].includes(response.status) && new URL(location, base).pathname === '/' ? 'ok' : 'fail', `HTTP ${response.status} → ${location || 'none'}`);
});

await check('intel current.json', async () => {
  const { response } = await get('/data/intel/current.json');
  if (response.status !== 200) return add('intel current.json', 'fail', `HTTP ${response.status}`);
  let intel;
  try { intel = parseIntel(await response.json(), true, now); } catch (error) { return add('intel current.json', 'fail', `invalid: ${validationError(error)}`); }
  const expected = expectedBriefDate(now);
  add('intel current.json', isStale(intel.asOfDate, now) ? 'fail' : 'ok', `asOfDate ${intel.asOfDate}, generatedAt ${intel.generatedAt}, expected ≥ ${expected}${isStale(intel.asOfDate, now) ? ' (site shows STALE)' : ''}`);
  const undated = intel.intelligence.filter(item => !item.publishedAt).length;
  if (intel.intelligence.length && undated === intel.intelligence.length) add('intel wire timestamps', 'warn', `${undated}/${undated} stories have no publishedAt (may be a previous issue)`);
  const manifest = await (await get('/data/intel/manifest.json')).response.json() as { dates?: string[] };
  add('intel manifest.json', manifest.dates?.includes(intel.asOfDate) ? 'ok' : 'fail', `${manifest.dates?.length ?? 0} dates, latest ${manifest.dates?.[0] ?? 'none'}`);
});

await check('gex current.json', async () => {
  const { response } = await get('/data/gex/current.json');
  if (response.status !== 200) return add('gex current.json', 'fail', `HTTP ${response.status}`);
  const snapshot = snapshotSchema.parse(await response.json());
  const age = now - Date.parse(snapshot.retrievedAt);
  const et = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const part = (type: string) => et.find(p => p.type === type)?.value ?? '';
  const minutes = Number(part('hour')) * 60 + Number(part('minute'));
  const today = `${part('year')}-${part('month')}-${part('day')}`;
  const capturedDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(snapshot.retrievedAt));
  const missedToday = !['Sat', 'Sun'].includes(part('weekday')) && minutes >= 11 * 60 && capturedDay !== today;
  const level: Level = age > 4 * 86400_000 ? 'fail' : missedToday ? 'warn' : 'ok';
  add('gex current.json', level, `captured ${snapshot.retrievedAt} (${hours(snapshot.retrievedAt)} h ago), quote ${snapshot.quoteAsOf}${missedToday ? ', no capture yet today (10:00 ET target)' : ''}`);
});

await check('api /api/macro', async () => {
  const { response, ms } = await get('/api/macro');
  if (response.status !== 200) return add('api /api/macro', 'fail', `HTTP ${response.status}`);
  const data = macroResponseSchema.parse(await response.json());
  const notes = data.series.map(s => `${s.symbol} ${s.points.at(-1)!.date}: ${dailyStatus(s, now)}`);
  const degraded = data.unavailable.length > 0 || data.series.some(s => dailyStatus(s, now) !== 'Daily observation');
  add('api /api/macro', degraded ? 'warn' : 'ok', `${ms} ms; ${notes.join('; ')}${data.unavailable.length ? `; unavailable ${data.unavailable.join(',')}` : ''}`);
});

await check('api /api/equities', async () => {
  const { response, ms } = await get('/api/equities');
  if (response.status !== 200) return add('api /api/equities', 'fail', `HTTP ${response.status}`);
  const data = equityResponseSchema.parse(await response.json());
  const failed = data.quotes.filter(q => q.refreshFailed).map(q => q.symbol);
  const newest = data.quotes.map(q => q.updatedAt).sort().at(-1);
  add('api /api/equities', data.unavailable.length || failed.length ? 'warn' : 'ok', `${ms} ms; ${data.quotes.length} quotes, newest ${newest}${data.unavailable.length ? `; unavailable ${data.unavailable.join(',')}` : ''}${failed.length ? `; refresh failed ${failed.join(',')}` : ''}`);
});

await check('api /api/global', async () => {
  const { response, ms } = await get('/api/global');
  if (response.status !== 200) return add('api /api/global', 'fail', `HTTP ${response.status}`);
  const data = globalSchema.parse(await response.json());
  const issues = [
    data.unavailable.length && `assets unavailable ${data.unavailable.join(',')}`,
    data.quotes.some(q => q.refreshFailed) && `refresh failed ${data.quotes.filter(q => q.refreshFailed).map(q => q.symbol).join(',')}`,
    data.newsUnavailable.length && `news unavailable ${data.newsUnavailable.join(',')}`,
    !data.sentiment && 'sentiment unavailable',
    data.sentiment && now - Date.parse(data.sentiment.updatedAt) > 48 * 3600_000 && `sentiment stale (${hours(data.sentiment.updatedAt)} h)`,
  ].filter(Boolean);
  // The endpoint returns 200 even when partly degraded, so inspect the body.
  add('api /api/global', !data.quotes.length && !data.headlines.length ? 'fail' : issues.length ? 'warn' : 'ok', `${ms} ms; ${data.quotes.length} quotes, ${data.headlines.length} headlines${issues.length ? `; ${issues.join('; ')}` : ''}`);
});

const summary = { base, checkedAt: new Date(now).toISOString(), ok: !results.some(r => r.level === 'fail'), failures: results.filter(r => r.level === 'fail').length, warnings: results.filter(r => r.level === 'warn').length, results };
if (json) console.log(JSON.stringify(summary, null, 2));
else {
  for (const r of results) console.log(`${r.level.toUpperCase().padEnd(4)} ${r.check.padEnd(26)} ${r.detail}`);
  console.log(`\n${summary.ok ? 'HEALTHY' : 'UNHEALTHY'} · ${summary.failures} failure(s), ${summary.warnings} warning(s) · ${base} · ${summary.checkedAt}`);
}
process.exitCode = summary.ok ? 0 : 1;
