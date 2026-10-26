import '../lib/analytics';
import '../styles.css';
import './labs.css';
import { geoGraticule10, geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import { pageShell, startClock, panelTitle, blank, icon } from './shared';
import { escape as e, readable, day, timestamp, signed, time, isStale } from '../lib/format';
import { loadDashboard } from '../lib/intel/load';
import { localizeResearch } from '../lib/intel/localize';
import type { Intel } from '../lib/intel/schema';
import { globalSchema, assets, type GlobalData, type Headline } from '../lib/global/schema';
import { macroResponseSchema, dailyStatus, type MacroResponse } from '../lib/markets/schema';

let briefing: Intel | null = null;
let globalData: GlobalData | null = null;
let macro: MacroResponse | null = null;
let activeRegion = 'World';
let activeTopic = 'All';
let assetGroup = 'All assets';
let feedLimit = 8;
let globalRefreshFailed = false;
const regions = [
  { name: 'Americas', coords: [-95, 38], code: '01', match: /\b(us|usa|u\.s\.|american|canada|fed|wall street|trump|united states|nasdaq|s&p|brazil)\b/i, description: 'Rates, US data and the equity risk complex.', watch: 'USD · NQ / ES · Treasuries' },
  { name: 'Europe', coords: [14, 49], code: '02', match: /\b(europe|european|france|french|germany|german|britain|british|uk|ecb|boe|russia|ukraine)\b/i, description: 'Sovereign credit, central banks and regional growth.', watch: 'EUR / GBP · European equities' },
  { name: 'Middle East', coords: [48, 28], code: '03', match: /\b(iran|israel|gaza|lebanon|hormuz|saudi|opec|middle east|oil|brent)\b/i, description: 'Energy supply, shipping routes and geopolitical risk.', watch: 'WTI / Brent · Gold · USD' },
  { name: 'Asia Pacific', coords: [124, 31], code: '04', match: /\b(asia|china|chinese|japan|japanese|korea|taiwan|tsmc|samsung|boj|yuan|australia|australian)\b/i, description: 'Semiconductors, China demand and currency policy.', watch: 'JPY / AUD · Semis · China' },
];
const topicMatch: Record<string, RegExp> = { Markets: /equities|stocks?|earnings|semis|banks|nasdaq|s&p|gold|oil|rates/i, Macro: /macro|economy|economic|consumer|rates|fed|inflation|central bank|employment|credit|growth/i, Geopolitics: /geopolitics|war|iran|israel|ukraine|russia|shipping|tariff|sanction/i, Crypto: /crypto|bitcoin|ethereum|blockchain|btc|eth/i };

function allHeadlines(): (Headline & { summary?: string })[] {
  const research = (briefing?.intelligence ?? []).map(h => ({ ...h }));
  const news = globalData?.headlines ?? [];
  const seen = new Set<string>();
  return [...research.slice(0, 4), ...news, ...research.slice(4)].filter(h => { if (seen.has(h.url)) return false; seen.add(h.url); return true; });
}
function regionMatches(h: Headline) { const region = regions.find(r => r.name === activeRegion); return !region || region.match.test(`${h.headline} ${h.tags.join(' ')} ${'summary' in h ? h.summary : ''}`); }
function matchingHeadlines() { return allHeadlines().filter(h => regionMatches(h) && (activeTopic === 'All' || topicMatch[activeTopic]?.test(`${h.headline} ${h.tags.join(' ')} ${h.summary ?? ''}`))); }
function sparkline(values: number[], className = '') {
  if (values.length < 2) return '<span class="no-history">History unavailable</span>';
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const points = values.map((v, i) => `${(i / (values.length - 1) * 180).toFixed(1)},${(45 - (v - min) / span * 38).toFixed(1)}`).join(' ');
  return `<svg class="sparkline ${className}" viewBox="0 0 180 52" preserveAspectRatio="none" aria-hidden="true"><path d="M0 49h180" class="spark-baseline"/><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>`;
}
function meter(label: string, value: string, detail: string, position: number | null, tone = 'orange') {
  return `<article class="signal-card ${tone}"><span class="signal-label">${label}</span><div class="signal-value">${value}</div><div class="signal-track" aria-hidden="true">${position !== null ? `<i style="left:${Math.max(0, Math.min(100, position))}%"></i>` : ''}</div><span class="signal-detail">${detail}</span></article>`;
}
function renderSignals() {
  const vix = macro?.series.find(s => s.symbol === 'VIX');
  const yield10 = macro?.series.find(s => s.symbol === 'US10Y');
  const sentiment = globalData?.sentiment;
  const v = vix?.points.at(-1);
  const y = yield10?.points.at(-1);
  document.querySelector('#signal-strip')!.innerHTML =
    meter('01 / MARKET REGIME', e(readable(briefing?.overview?.sentiment)), briefing ? `${e(readable(briefing.overview?.confidence))} confidence · Research view` : 'Published briefing unavailable', briefing?.overview?.sentiment ? ({ bearish: 10, mildly_bearish: 30, neutral: 50, mildly_bullish: 70, bullish: 90 }[briefing.overview.sentiment]) : null) +
    meter('02 / EQUITY VOLATILITY', v ? `${v.value.toFixed(2)} <small>VIX</small>` : '—', v ? `Cboe · ${day(v.date)} · ${dailyStatus(vix!)}` : 'Official daily close unavailable', v ? v.value / 50 * 100 : null, 'cream') +
    meter('03 / COST OF MONEY', y ? `${y.value.toFixed(2)}<small>% US10Y</small>` : '—', y ? `US Treasury · ${day(y.date)} · ${dailyStatus(yield10!)}` : 'Official daily yield unavailable', y ? y.value / 8 * 100 : null, 'cream') +
    meter('04 / CRYPTO SENTIMENT', sentiment ? `${sentiment.value}<small>/ 100</small>` : '—', sentiment ? `${e(sentiment.label)} · Alternative.me · ${day(sentiment.updatedAt)}` : 'Fear & Greed index unavailable', sentiment?.value ?? null);
}

const body = `<div class="lab-intro"><div><div class="lab-kicker"><span class="status-dot"></span>MANGO ATLAS / GLOBAL INTEL</div><h1>Global <span>Intel</span></h1><p>Connect the macro forces. Find the market context.</p></div><div class="intro-coordinate mono"><span>GLOBAL OBSERVATION DESK</span><span id="brief-status">Loading published briefing…</span><button id="refresh-global" class="refresh-button">Refresh feeds ${icon('activity')}</button></div></div>
<div class="signal-strip" id="signal-strip"></div>
<section class="world-panel" aria-labelledby="world-title"><div class="world-toolbar"><h2 id="world-title">${icon('globe')} Global risk radar</h2><span class="mono">REGIONAL NEWS / MACRO CONTEXT</span></div><div class="world-layout"><div class="map-viewport"><div id="world-map" class="world-map"></div><div class="map-crosshair" aria-hidden="true"><span>90° N</span><span>180° W</span><span>180° E</span><span>90° S</span></div><div class="map-caption"><span class="status-dot"></span>NEWS COVERAGE · SELECT A REGION<span>Natural Earth / D3</span></div></div><aside class="region-context" id="region-context"></aside></div><div class="region-buttons" role="group" aria-label="Filter intelligence by region"><button data-region="World" aria-pressed="true">${icon('radar')} All regions</button>${regions.map(r => `<button data-region="${r.name}" aria-pressed="false"><span>${r.code}</span>${r.name}<b data-region-count="${r.name}">—</b></button>`).join('')}</div></section>
<section class="intel-panel asset-panel" aria-labelledby="asset-title">${panelTitle('01', 'Cross-asset pulse', 'LATEST PROVIDER OBSERVATION · DAILY CHANGE')}<div class="asset-toolbar"><p>One glance across the risk complex.</p><div class="lab-tabs" role="group" aria-label="Asset class">${['All assets', 'Equities', 'Commodities', 'FX', 'Crypto'].map((s, i) => `<button data-asset-group="${s}" aria-pressed="${!i}">${s}</button>`).join('')}</div></div><div class="asset-grid" id="asset-grid"></div><div class="data-footnote">Yahoo Finance · May be delayed · Changes vs preceding daily close · Sparklines: 21 daily observations, each on its own scale · ETF proxies labeled · Futures rolls can affect changes. <span id="quote-status">Connecting…</span></div></section>
<div class="intel-columns"><section class="intel-panel news-panel" aria-labelledby="news-title">${panelTitle('02', 'Intelligence wire', 'RESEARCH + PUBLISHER FEEDS')}<div class="wire-toolbar"><div class="lab-tabs" role="group" aria-label="News topic">${['All', 'Markets', 'Macro', 'Geopolitics', 'Crypto'].map((t, i) => `<button data-topic="${t}" aria-pressed="${!i}">${t}</button>`).join('')}</div><span id="news-count" class="mono"></span></div><div id="news-feed" aria-live="polite"></div><button class="load-more" id="load-more">Show more intelligence +</button><div class="data-footnote" id="news-status">Connecting publisher feeds…</div></section><div class="intel-side-column"><section class="intel-panel" aria-labelledby="session-title">${panelTitle('03', 'Session clock', 'CASH MARKET HOURS')}<div id="session-clock"></div><div class="data-footnote">Typical weekday hours in each market’s local time. Holidays and Tokyo’s lunch break aren’t modeled. Crypto trades 24/7.</div></section><section class="intel-panel" aria-labelledby="events-title">${panelTitle('04', 'Catalyst watch', 'PUBLISHED CALENDAR')}<div id="event-watch"></div></section><section class="intel-panel" aria-labelledby="desk-title">${panelTitle('05', 'On the desk', 'RESEARCH CONTEXT')}<div id="desk-context"></div></section></div></div>
<section class="intel-panel macro-history" aria-labelledby="macro-title">${panelTitle('06', 'The pressure behind the move', 'OFFICIAL DAILY OBSERVATIONS')}<div id="macro-history" class="macro-history-grid"></div><div class="data-footnote">Each line uses its own scale. Last 30 observations · Sources: Cboe and US Treasury · Daily data, separate from intraday market feeds.</div></section>`;
document.querySelector('#app')!.innerHTML = pageShell('Global Intel', body, '/global');
startClock();
renderSignals();

function renderAssets() {
  document.querySelector('#asset-grid')!.innerHTML = assets.filter(a => assetGroup === 'All assets' || a.group === assetGroup).map(asset => {
    const quote = globalData?.quotes.find(q => q.symbol === asset.symbol);
    const change = quote?.changePct ?? null;
    const tone = change === null ? '' : change >= 0 ? 'up' : 'down';
    return `<article class="asset-tile ${tone}"><div class="asset-top"><span>${e(asset.label)}</span><span>${asset.group === 'Crypto' ? '◈' : asset.group === 'Commodities' ? '◇' : '+'}</span></div><strong class="asset-change">${change === null ? '—' : signed(change)}</strong><div class="asset-price mono">${quote ? new Intl.NumberFormat('en-US', { maximumFractionDigits: asset.group === 'FX' ? 4 : 2 }).format(quote.price) : 'Data unavailable'}</div>${quote ? sparkline(quote.history) : '<div class="spark-placeholder" aria-hidden="true"></div>'}<span class="asset-kind">${e(asset.type)}</span><span class="asset-date">${quote ? `${e(timestamp(quote.updatedAt))}${quote.refreshFailed ? ' · Refresh failed / Last known' : ''}` : 'Waiting for provider'}</span></article>`;
  }).join('');
  document.querySelector('#quote-status')!.textContent = globalData ? `${globalData.quotes.length} / ${assets.length} feeds available · Retrieved ${time(globalData.retrievedAt)}${globalRefreshFailed ? ' · Refresh failed / Last known' : ''}` : 'Market feeds unavailable';
}
function renderRegion() {
  const region = regions.find(r => r.name === activeRegion);
  const h = allHeadlines().filter(regionMatches);
  document.querySelector('#region-context')!.innerHTML = `<div class="region-eyebrow mono">${region ? `REGION / ${region.code}` : 'THE BIG PICTURE'}</div><h3>${e(activeRegion === 'World' ? 'Global overview' : activeRegion)}</h3><p class="region-description">${e(region?.description ?? 'Follow the stories moving capital across borders and asset classes.')}</p><div class="region-count"><strong>${h.length.toString().padStart(2, '0')}</strong><span>covered stories<br><small>from connected sources</small></span></div><div class="region-watch"><span class="mono">TRANSMISSION CHANNELS</span><p>${e(region?.watch ?? 'Rates → FX → Equities → Commodities')}</p></div>${h[0] ? `<a class="region-lead" href="${e(h[0].url)}" target="_blank" rel="noopener noreferrer"><span class="mono">${e(h[0].source)}</span><h4>${e(h[0].headline)}</h4>${icon('arrow')}</a>` : '<p class="lab-empty">No regional headlines in the current sources.</p>'}`;
  document.querySelectorAll<HTMLButtonElement>('[data-region]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.region === activeRegion)));
  regions.forEach(r => { const count = allHeadlines().filter(h => r.match.test(`${h.headline} ${h.tags.join(' ')} ${h.summary ?? ''}`)).length; document.querySelector(`[data-region-count="${r.name}"]`)!.textContent = String(count); });
  document.querySelectorAll('[data-map-region]').forEach(g => g.classList.toggle('selected', g.getAttribute('data-map-region') === activeRegion));
}
function renderNews() {
  const headlines = matchingHeadlines();
  document.querySelector('#news-count')!.textContent = `${headlines.length} STORIES`;
  document.querySelector('#news-feed')!.innerHTML = headlines.length ? headlines.slice(0, feedLimit).map((h, i) => `<article class="wire-story"><span class="wire-number mono">${String(i + 1).padStart(2, '0')}</span><div><div class="wire-meta mono"><span>${e(h.source)}</span><span>${h.publishedAt ? e(timestamp(h.publishedAt)) : 'Publication time unavailable'}</span></div><a href="${e(h.url)}" target="_blank" rel="noopener noreferrer">${e(h.headline)} ${icon('arrow')}</a>${h.summary ? `<p>${e(h.summary)}</p>` : ''}<div class="wire-tags">${h.tags.slice(0, 3).map(t => `<span>${e(t)}</span>`).join('')}</div></div></article>`).join('') : blank(`No ${activeTopic === 'All' ? '' : activeTopic.toLowerCase() + ' '}stories for ${activeRegion === 'World' ? 'the current sources' : activeRegion}. Choose another region or topic.`);
  document.querySelector<HTMLButtonElement>('#load-more')!.hidden = headlines.length <= feedLimit;
  document.querySelector('#news-status')!.textContent = globalData ? `${globalRefreshFailed ? 'Refresh failed / Last known publisher headlines. ' : 'Publisher headlines refresh every 15 minutes. '}${globalData.newsUnavailable.length ? `Unavailable: ${globalData.newsUnavailable.join(', ')}. ` : ''}Research summaries retain the briefing’s coverage; publication time is shown only when supplied.` : 'Publisher feeds unavailable. Showing published research where available.';
}
function renderEvents() {
  const items = [...(briefing?.events ?? [])].sort((a, b) => (a.datetime ?? a.date).localeCompare(b.datetime ?? b.date));
  document.querySelector('#event-watch')!.innerHTML = items.length ? items.slice(0, 5).map(item => { const passed = item.datetime && Date.parse(item.datetime) < Date.now(); return `<a class="watch-event" href="${e(item.source)}" target="_blank" rel="noopener noreferrer"><div><span class="event-currency mono">${e(item.currency)}</span><span class="event-impact ${item.impact}">${item.impact} impact</span></div><strong>${e(item.title)}</strong><span>${item.datetime ? e(timestamp(item.datetime)) : `${day(item.date)} · ${readable(item.timeLabel)}`}</span><small>${passed ? (item.actual ? `Actual: ${e(item.actual)}` : 'Scheduled time passed · Result not supplied') : 'Upcoming scheduled release'}${item.forecast ? ` · Forecast ${e(item.forecast)}` : ''}</small></a>`; }).join('') : blank('No catalysts supplied in the latest briefing.');
  document.querySelector('#desk-context')!.innerHTML = briefing?.overview ? `<div class="desk-research"><span class="mono">VOLATILITY / ${e(readable(briefing.overview.volatilityOutlook))}</span><p>${e(briefing.overview.oneLineTake)}</p>${briefing.overview.risks.slice(0, 2).map(r => `<div class="desk-risk"><span>!</span><p>${e(r)}</p></div>`).join('')}<div class="data-footnote">Published research · ${day(briefing.asOfDate)} · Prop firm news restrictions vary; check your firm’s rules.</div></div>` : blank('Desk context unavailable.');
}
function renderSessions() {
  const now = new Date();
  const sessions = [{ city: 'Tokyo', zone: 'Asia/Tokyo', start: 9 * 60, end: 15 * 60 + 30 }, { city: 'London', zone: 'Europe/London', start: 8 * 60, end: 16 * 60 + 30 }, { city: 'New York', zone: 'America/New_York', start: 9 * 60 + 30, end: 16 * 60 }];
  document.querySelector('#session-clock')!.innerHTML = sessions.map(s => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: s.zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(now);
    const get = (key: string) => parts.find(p => p.type === key)!.value;
    const mins = Number(get('hour')) * 60 + Number(get('minute'));
    const open = !['Sat', 'Sun'].includes(get('weekday')) && mins >= s.start && mins < s.end;
    const percent = mins / 1440 * 100;
    return `<div class="session-row"><div><strong>${s.city}</strong><span class="session-state ${open ? 'open' : ''}">${open ? 'IN SESSION' : 'OUT OF SESSION'}</span></div><div class="session-time mono">${time(now.toISOString(), s.zone)}</div><div class="session-track" aria-hidden="true"><span style="left:${s.start / 1440 * 100}%;width:${(s.end - s.start) / 1440 * 100}%"></span><i style="left:${percent}%"></i></div></div>`;
  }).join('');
}
function renderMacro() {
  document.querySelector('#macro-history')!.innerHTML = ['VIX', 'VXN', 'US10Y'].map(symbol => {
    const series = macro?.series.find(s => s.symbol === symbol);
    const values = series?.points.slice(-30) ?? [];
    const last = values.at(-1), prior = values.at(-2);
    const diff = last && prior ? last.value - prior.value : null;
    return `<article class="macro-visual"><div><span class="mono">${symbol === 'US10Y' ? 'US 10Y YIELD' : symbol === 'VXN' ? 'NASDAQ VOLATILITY' : 'S&P 500 VOLATILITY'}</span><strong>${last ? `${last.value.toFixed(2)}${symbol === 'US10Y' ? '%' : ''}` : '—'}</strong></div>${sparkline(values.map(p => p.value))}<p>${diff === null ? 'Data unavailable' : `${diff > 0 ? '+' : ''}${(symbol === 'US10Y' ? diff * 100 : diff).toFixed(2)} ${symbol === 'US10Y' ? 'bp' : 'pts'} vs prior close`}</p><small>${last ? `${day(last.date)} · ${e(dailyStatus(series!))}` : 'Waiting for official source'}</small></article>`;
  }).join('');
}
async function renderMap() {
  try {
    const response = await fetch('/maps/countries-110m.json');
    if (!response.ok) throw new Error('Map unavailable');
    const topology = await response.json() as Topology<{ countries: GeometryCollection }>;
    const countries = feature(topology, topology.objects.countries);
    const projection = geoNaturalEarth1().fitExtent([[32, 24], [968, 462]], { type: 'Sphere' });
    const path = geoPath(projection);
    const markers = regions.map(r => {
      const [x, y] = projection(r.coords as [number, number])!;
      return `<g data-map-region="${r.name}" class="map-node" style="--delay:${Number(r.code) * .7}s" transform="translate(${x},${y})" role="button" tabindex="0" aria-label="Show ${r.name} intelligence"><circle class="map-node-hit" r="28"/><circle class="map-pulse" r="18"/><circle class="map-node-ring" r="10"/><circle class="map-node-dot" r="3.5"/><text x="17" y="-13">${r.name.toUpperCase()}</text></g>`;
    }).join('');
    const ny = projection(regions[0].coords as [number, number])!;
    const routes = regions.slice(1).map(r => { const p = projection(r.coords as [number, number])!; return `<path class="map-route" d="M${ny[0]} ${ny[1]} Q${(ny[0] + p[0]) / 2} ${Math.min(ny[1], p[1]) - 100} ${p[0]} ${p[1]}"/>`; }).join('');
    document.querySelector('#world-map')!.innerHTML = `<svg viewBox="0 0 1000 490" class="world-svg" aria-label="Interactive regional coverage map"><defs><pattern id="map-grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" fill="#ff990a" opacity=".18"/></pattern></defs><rect width="1000" height="490" fill="url(#map-grid)"/><path class="map-graticule" d="${path(geoGraticule10())}"/><path class="map-land" d="${path(countries)}"/>${routes}${markers}</svg>`;
    renderRegion();
  } catch { document.querySelector('#world-map')!.innerHTML = blank('Map unavailable. Regional filters below remain available.'); }
}
async function refresh() {
  const button = document.querySelector<HTMLButtonElement>('#refresh-global')!;
  button.disabled = true; button.innerHTML = `Refreshing ${icon('activity')}`;
  await Promise.allSettled([
    loadDashboard().then(result => {
      briefing = result.current ? localizeResearch(result.current) : null;
      if (briefing && isStale(briefing.asOfDate)) console.warn(`[mango-atlas] brief ${briefing.asOfDate} is older than the scheduled brief; showing last good data`);
      document.querySelector('#brief-status')!.textContent = briefing ? `${result.fallback ? 'Recovered briefing' : 'Research'} / ${day(briefing.asOfDate)}` : 'Published briefing unavailable';
      renderSignals(); renderEvents(); renderRegion(); renderNews();
    }),
    fetch('/api/global', { signal: AbortSignal.timeout(18_000) }).then(async r => { if (!r.ok) throw new Error('Feed unavailable'); globalData = globalSchema.parse(await r.json()); globalRefreshFailed = false; }).catch(() => { globalRefreshFailed = true; }).finally(() => { renderSignals(); renderAssets(); renderRegion(); renderNews(); }),
    fetch('/api/macro', { signal: AbortSignal.timeout(18_000) }).then(async r => { if (!r.ok) throw new Error('Macro unavailable'); macro = macroResponseSchema.parse(await r.json()); }).catch(() => { if (macro) macro = { ...macro, series: macro.series.map(s => ({ ...s, refreshFailed: true })) }; }).finally(() => { renderSignals(); renderMacro(); }),
  ]);
  button.disabled = false; button.innerHTML = `Refresh feeds ${icon('activity')}`;
}
function selectRegion(name: string) { activeRegion = name; feedLimit = 8; renderRegion(); renderNews(); }
document.addEventListener('click', event => {
  const target = event.target as Element;
  const region = target.closest<HTMLElement>('[data-region], [data-map-region]');
  if (region) selectRegion(region.dataset.region ?? region.dataset.mapRegion!);
  const topic = target.closest<HTMLButtonElement>('[data-topic]');
  if (topic) { activeTopic = topic.dataset.topic!; feedLimit = 8; document.querySelectorAll<HTMLButtonElement>('[data-topic]').forEach(b => b.setAttribute('aria-pressed', String(b === topic))); renderNews(); }
  const group = target.closest<HTMLButtonElement>('[data-asset-group]');
  if (group) { assetGroup = group.dataset.assetGroup!; document.querySelectorAll<HTMLButtonElement>('[data-asset-group]').forEach(b => b.setAttribute('aria-pressed', String(b === group))); renderAssets(); }
});
document.addEventListener('keydown', event => { const marker = (event.target as Element).closest<HTMLElement>('[data-map-region]'); if (marker && ['Enter', ' '].includes(event.key)) { event.preventDefault(); selectRegion(marker.dataset.mapRegion!); } });
document.querySelector('#load-more')!.addEventListener('click', () => { feedLimit += 8; renderNews(); });
document.querySelector('#refresh-global')!.addEventListener('click', () => void refresh());
renderAssets(); renderRegion(); renderNews(); renderEvents(); renderSessions(); renderMacro();
void renderMap(); void refresh();
setInterval(renderSessions, 30_000);
setInterval(() => { if (!document.hidden) void refresh(); }, 15 * 60_000);
