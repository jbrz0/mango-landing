import type { Intel, EconomicEvent } from '../lib/intel/schema';
import { changesSince } from '../lib/intel/compare';
import { escape as e, day, time, number, readable, isStale, notToday, timestamp, zoneName, dateKey, addDays, displayTimeZone } from '../lib/format';
import { localizeResearch } from '../lib/intel/localize';
import { refreshEquityQuotes } from './equities';
import { badge, empty, metric, sectionHeader, arrow } from './primitives';
import { chartSymbols } from './chart';
import { stockIdentity, eventCurrency } from './identities';
import { fxBiasLabel } from '../lib/intel/fx';
import { siteNavigation } from './navigation';

export const SOCIAL = { x: 'https://x.com/mangoatlas', discord: 'https://discord.gg/xUQSsm5UpV' };
const xIcon = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3L12 14.6 5.5 22H2.3l7.9-9L.8 2h6.5l4.4 6.6L18.9 2ZM17.8 20h1.7L6.2 3.9H4.4L17.8 20Z"/></svg>';
const discordIcon = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.7 5.1a18.3 18.3 0 0 0-4.5-1.4l-.6 1.2a16.9 16.9 0 0 0-5.2 0l-.6-1.2a18.3 18.3 0 0 0-4.5 1.4C1.5 9.2.7 13.2 1.1 17.2a18.6 18.6 0 0 0 5.5 2.8l1.2-1.9-1.7-.8.4-.3a13 13 0 0 0 11 0l.4.3-1.7.7 1.2 2a18.6 18.6 0 0 0 5.5-2.8c.5-4.6-.8-8.6-3.2-12.1ZM8.5 14.9c-1 0-1.7-.9-1.7-2s.8-2 1.7-2 1.7.9 1.7 2-.8 2-1.7 2Zm7 0c-1 0-1.7-.9-1.7-2s.8-2 1.7-2 1.7.9 1.7 2-.8 2-1.7 2Z"/></svg>';

export function shell(chart: string) {
  return `<a class="skip-link" href="#main">Skip to market intelligence</a>
  <header class="site-header"><div class="header-inner">
    <a class="brand" href="/" aria-label="Mango Atlas home"><img src="/logo-transparent.png" width="52" height="52" alt="Mango Atlas emblem"><span>MANGO<span class="brand-atlas">ATLAS</span><small>MARKET INTELLIGENCE</small></span></a>
    ${siteNavigation('/')}
  </div></header>
  <div class="subnav"><nav aria-label="Dashboard sections"><a class="active" href="#overview">Overview</a><a href="#nasdaq">Nasdaq</a><a href="#charts">Charts</a><a href="#fx">FX</a><a href="#intelligence">Intelligence</a></nav><div class="header-actions"><span class="desk-clock" title="${e(displayTimeZone)}"><span class="status-dot"></span>${e(zoneName.toUpperCase())} <time id="desk-clock"></time></span><a class="icon-link" href="${SOCIAL.x}" target="_blank" rel="noopener noreferrer" aria-label="Mango Atlas on X">${xIcon}</a><a class="discord-link" href="${SOCIAL.discord}" target="_blank" rel="noopener noreferrer">${discordIcon}<span>Join Discord</span>${arrow}</a></div></div>
  <main id="main" class="page-wrap"><div class="page-heading"><div><p class="eyebrow"><span class="orange">THE DAILY PICTURE</span> / MACRO · NASDAQ · FX</p><h1>Market intelligence<span class="orange">.</span></h1></div><div class="archive-control"><label for="brief-date">Briefing archive</label><div class="select-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6m10-6v6M3 11h18"/></svg><select id="brief-date" disabled><option>Loading briefings…</option></select></div></div></div>
  <div id="data-status" class="data-status" role="status">Loading the latest published intelligence…</div>
  <section id="market-strip" class="market-quotes" aria-label="Current market quotes"></section>
  <div class="dashboard-grid"><section id="overview" class="panel regime-panel" aria-labelledby="overview-title"></section><section id="catalysts" class="panel events-panel" aria-labelledby="events-title"></section><section id="nasdaq" class="panel nq-panel" aria-labelledby="nq-title"></section><section id="macro" class="panel macro-panel" aria-labelledby="macro-title"></section>${chart}<section id="themes" class="panel themes-panel" aria-labelledby="themes-title"></section><section id="fx" class="panel fx-panel" aria-labelledby="fx-title"></section><section id="intelligence" class="panel feed-panel" aria-labelledby="feed-title"></section></div>
  <section id="changes" class="changes-panel" aria-labelledby="changes-title"></section>
  </main><footer class="site-footer"><div><strong>MANGO ATLAS</strong><span>Independent trading & research desk.</span></div><p>Published research, not a live trading signal. Not investment advice.</p><nav class="footer-socials" aria-label="Community links"><a href="${SOCIAL.discord}" target="_blank" rel="noopener noreferrer">${discordIcon} Discord ↗</a><a href="${SOCIAL.x}" target="_blank" rel="noopener noreferrer">${xIcon} @mangoatlas ↗</a></nav></footer>`;
}

function overview(data: Intel | null) {
  const info = data?.overview;
  return `${sectionHeader('overview-title', 'Market regime', '01 / THE BIG PICTURE')}
  ${info ? `<div class="regime-main"><div><span class="eyebrow">Broad market bias</span><div class="regime-bias ${info.sentiment?.includes('bearish') ? 'negative-text' : info.sentiment?.includes('bullish') ? 'positive-text' : ''}">${e(readable(info.sentiment))}<span class="bias-arrow" aria-hidden="true">${info.sentiment?.includes('bearish') ? '↘' : info.sentiment?.includes('bullish') ? '↗' : '→'}</span></div></div><div class="regime-metrics">${metric('Confidence', info.confidence)}${metric('Volatility', info.volatilityOutlook)}</div></div><p class="one-line">${e(info.oneLineTake ?? 'No market takeaway supplied for this briefing.')}</p><div class="panel-bottom"><span class="status-dot"></span>RESEARCH SNAPSHOT<span>${e(data?.provenance.source)}</span></div>` : empty('Awaiting the daily briefing', 'The broad market view will appear when research is published.')}`;
}

function eventRow(event: EconomicEvent) {
  return `<article class="event-row"><div class="event-time mono">${event.datetime ? time(event.datetime) : e(readable(event.timeLabel))}${eventCurrency(event)}</div><div class="event-body"><div><a href="${e(event.source)}" target="_blank" rel="noopener noreferrer">${e(event.title)}</a><span class="impact ${event.impact}">${event.impact === 'medium' ? 'MED' : event.impact.toUpperCase()}</span></div><small>${e(event.country)}</small><dl class="event-values"><div><dt>Forecast</dt><dd>${e(event.forecast ?? '—')}</dd></div><div><dt>Previous</dt><dd>${e(event.previous ?? '—')}</dd></div><div><dt>Actual</dt><dd>${e(event.actual ?? '—')}</dd></div></dl></div></article>`;
}

export function events(data: Intel | null, historical: boolean, scope = 'today') {
  const all = data?.events ?? [];
  const baseDate = historical && data ? dateKey(data.generatedAt) : dateKey(new Date());
  const eventDate = (event: EconomicEvent) => event.datetime ? dateKey(event.datetime) : event.date;
  const upcoming = all.filter(event => event.datetime && Date.parse(event.datetime) >= Date.now()).sort((a, b) => Date.parse(a.datetime!) - Date.parse(b.datetime!));
  const next = historical ? null : upcoming.find(event => event.impact === 'high') ?? upcoming[0];
  const visible = all.filter(event => scope === 'week' ? eventDate(event) >= baseDate && eventDate(event) <= addDays(baseDate, 6) : eventDate(event) === baseDate).sort((a,b) => eventDate(a).localeCompare(eventDate(b)) || (a.datetime ? Date.parse(a.datetime) : Infinity) - (b.datetime ? Date.parse(b.datetime) : Infinity));
  const dates = [...new Set(visible.map(eventDate))];
  return `${sectionHeader('events-title', 'Key catalysts', zoneName.toUpperCase())}
    <div class="event-toolbar"><div class="segmented" aria-label="Event date range"><button data-event-scope="today" aria-pressed="${scope === 'today'}">${historical ? 'Briefing day' : 'Today'}</button><button data-event-scope="week" aria-pressed="${scope === 'week'}">7 days</button></div><span class="muted-text mono">${visible.length} EVENTS</span></div>
    ${next ? `<div class="next-event"><span class="eyebrow">NEXT ${next.impact === 'high' ? 'HIGH-IMPACT ' : ''}EVENT</span><strong>${e(next.title)}</strong><span class="mono">${e(timestamp(next.datetime!))}</span></div>` : ''}
    ${visible.length ? `<div class="event-list">${dates.map(date => `<div class="event-date">${day(date)}</div>${visible.filter(event => eventDate(event) === date).map(eventRow).join('')}`).join('')}</div>` : empty(all.length ? 'No events in this window' : 'Calendar not yet published', all.length ? 'Switch the date range to inspect upcoming releases.' : 'Scheduled releases will appear here with impact, forecasts and results. Missing coverage does not mean a quiet session.', true)}
    <p class="section-note">Times in ${e(displayTimeZone)}. ${historical ? 'Calendar as published in this archived briefing.' : 'Events and results are published snapshots.'}${visible.some(event => !event.datetime) ? ' Untimed events retain their published calendar date.' : ''}</p>`;
}

function movers(title: string, items: NonNullable<Intel['nq']>['megaCaps']) {
  return `<details class="research-detail" name="nasdaq-research"><summary>${title}<span>${items.length ? `${items.length} symbols` : 'No coverage'}</span></summary>${items.length ? `<p class="mover-note">Latest regular-session prices · Cached 15 min · May be delayed. Independent of briefing date.</p>${items.map(item => `<div class="mover">${stockIdentity(item.symbol)}<span class="mover-quote mono" data-equity="${e(item.symbol)}">Loading price…</span><small class="mover-quote-source" data-equity-source="${e(item.symbol)}"></small><p>${e(item.context)}</p></div>`).join('')}` : '<p class="muted-text">No constituent research supplied.</p>'}</details>`;
}
function nq(data: Intel | null) {
  const info = data?.nq;
  return `${sectionHeader('nq-title', 'Nasdaq intelligence', '02 / NQ DESK')}
    <div class="nq-heading"><div><span class="instrument-label mono">NQ <span>/</span> NASDAQ 100 FUTURES</span><p>Research: NQ · Chart: NAS100 CFD</p></div><button class="text-button" data-chart="OANDA:NAS100USD">NAS100 CFD chart ${arrow}</button></div>
    ${info ? `<div class="nq-metrics">${metric('Bias', info.bias)}${metric('Conviction', info.conviction ?? data?.overview?.confidence)}<div class="metric"><span class="eyebrow">Regime</span><strong>${e(info.regime ?? 'Unavailable')}</strong></div></div><p class="research-copy">${e(info.summary ?? 'No summary supplied.')}</p><div class="catalyst-risk"><div><span class="eyebrow orange">PRIMARY CATALYST</span><p>${e(info.primaryCatalyst ?? 'Unavailable')}</p></div><div><span class="eyebrow negative-text">PRIMARY RISK</span><p>${e(info.primaryRisk ?? 'Unavailable')}</p></div></div><details class="research-detail" name="nasdaq-research"><summary>Session & positioning<span>Expand research</span></summary><dl class="research-dl">${[['Overnight', info.overnight], ['Macro', info.macro], ['Options & volatility', info.volatility], ['Short-term sentiment', readable(info.sentimentShortTerm)], ['Medium-term sentiment', readable(info.sentimentMediumTerm)]].map(([label,value]) => `<div><dt>${e(label)}</dt><dd>${e(value ?? 'Unavailable')}</dd></div>`).join('')}</dl></details>${movers('Mega-cap leadership',info.megaCaps)}${movers('Semiconductors',info.semiconductors)}${movers('Premarket movers',info.premarket)}` : `${empty('NQ briefing awaiting publication', 'No Nasdaq-specific bias or levels have been supplied. Explore the NAS100 CFD chart while awaiting research.', true)}<div class="coverage-row"><span>OVERNIGHT</span><span>MEGA-CAPS</span><span>SEMICONDUCTORS</span><span>OPTIONS</span></div>`}`;
}

function themes(data: Intel | null) {
  const themes = data?.overview?.themes ?? [];
  const risks = data?.overview?.risks ?? [];
  const list = (items: string[], risk = false) => items.length ? `<ol class="theme-list${risk ? ' risk-list' : ''}">${items.map((item,i) => `<li><span class="theme-index mono">${String(i+1).padStart(2,'0')}</span><p>${e(item)}</p></li>`).join('')}</ol>` : '<p class="section-note">No research supplied.</p>';
  return `${sectionHeader('themes-title', 'On the radar', 'THEMES & RISKS')}${list(themes.slice(0, 3))}${themes.length > 3 ? `<details class="research-detail"><summary>More themes<span>+${themes.length - 3}</span></summary>${list(themes.slice(3))}</details>` : ''}<details class="research-detail risk-detail" open><summary>Risks to watch<span>${risks.length ? `${risks.length} identified` : 'Awaiting research'}</span></summary>${list(risks, true)}</details>`;
}

function fx(data: Intel | null) {
  const info = data?.fx;
  return `${sectionHeader('fx-title', 'FX intelligence', '03 / CURRENCY DESK')}${info?.macroPulse ? `<p class="research-copy fx-pulse">${e(info.macroPulse)}</p>` : ''}${info?.instruments.length ? `<div class="fx-list">${info.instruments.map(item => { const chart = chartSymbols.find(chart => chart.id.endsWith(`:${item.symbol}`) || chart.short === item.symbol); const biasLabel = fxBiasLabel(item); return `<details class="fx-instrument"><summary><strong class="mono">${e(item.symbol)}</strong>${badge(item.bias, biasLabel, biasLabel ? `No directional bias was published.${biasLabel === 'Watch only' ? ' The current briefing explicitly calls for watching or standing aside.' : ' See the current commentary and levels for available research.'}` : undefined)}<span class="fx-posture">${e(item.posture ?? 'No posture')}</span><span class="expand-icon" aria-hidden="true">+</span></summary><div class="fx-content"><p>${e(item.driver ?? 'No driver supplied.')}</p><div class="levels"><div><span class="eyebrow">SUPPORT</span><strong class="mono">${item.support.length ? item.support.map(n => number(n, 5)).join(' / ') : 'Unavailable'}</strong></div><div><span class="eyebrow">RESISTANCE</span><strong class="mono">${item.resistance.length ? item.resistance.map(n => number(n, 5)).join(' / ') : 'Unavailable'}</strong></div></div>${item.comments ? `<p>${e(item.comments)}</p>` : ''}${chart ? `<button class="text-button" data-chart="${chart.id}">Open ${e(item.symbol)} chart ${arrow}</button>` : ''}</div></details>`; }).join('')}</div>` : empty('Currency research awaiting publication', 'Directional bias, macro drivers and key levels will appear with the next FX briefing.')}
  <div class="fx-shortcuts"><span class="eyebrow">EXPLORE FX</span>${['EURUSD','GBPUSD','USDJPY','AUDUSD'].map(symbol => `<button class="symbol-button mono" data-chart="OANDA:${symbol}">${symbol} ↗</button>`).join('')}</div>`;
}

export function feed(data: Intel | null, filter = 'All') {
  const all = data?.intelligence ?? [];
  const tags = ['All', ...new Set(all.flatMap(item => item.tags))];
  const stocks = new Set([...(data?.nq?.megaCaps ?? []), ...(data?.nq?.semiconductors ?? []), ...(data?.nq?.premarket ?? [])].map(item => item.symbol));
  const visible = filter === 'All' ? all : all.filter(item => item.tags.includes(filter));
  return `${sectionHeader('feed-title', 'Intelligence wire', '04 / CONTEXT THAT MATTERS')}
  ${all.length ? `<div class="feed-filters" role="group" aria-label="Filter intelligence">${tags.map(tag => `<button data-feed-filter="${e(tag)}" aria-pressed="${filter === tag}">${e(tag)}</button>`).join('')}</div><div class="stories">${visible.map(item => `<article class="story"><div class="story-meta"><span>${e(item.source)}</span><time${item.publishedAt ? ` datetime="${e(item.publishedAt)}"` : ''}>${item.publishedAt ? `${e(timestamp(item.publishedAt))}` : 'Time not supplied'}</time></div><h3><a href="${e(item.url)}" target="_blank" rel="noopener noreferrer">${e(item.headline)} ${arrow}</a></h3><p>${e(item.summary)}</p><div class="story-tags">${item.tags.map(tag => `<span>${e(tag)}</span>`).join('')}${item.symbols.map(symbol => `<span>${stocks.has(symbol) ? stockIdentity(symbol) : e(symbol)}</span>`).join('')}</div></article>`).join('')}</div>` : empty('The wire is quiet for now', 'Short, sourced story summaries will appear here when published. Original articles stay with their publishers.')}
  <p class="section-note">Mango Atlas summaries. Links open the original reporting.</p>`;
}

export function renderData(data: Intel | null, historical: boolean, fallback = false) {
  data = data ? localizeResearch(data) : null;
  document.querySelector('#overview')!.innerHTML = overview(data);
  document.querySelector('#catalysts')!.innerHTML = events(data, historical);
  document.querySelector('#nasdaq')!.innerHTML = nq(data);
  document.querySelector('#themes')!.innerHTML = themes(data);
  document.querySelector('#fx')!.innerHTML = fx(data);
  document.querySelector('#intelligence')!.innerHTML = feed(data);
  if (data?.nq) void refreshEquityQuotes();
  const status = document.querySelector('#data-status')!;
  status.classList.toggle('stale', !!data && !historical && isStale(data.generatedAt));
  status.innerHTML = data ? `<div><span class="status-label">${historical ? 'ARCHIVE' : isStale(data.generatedAt) ? 'STALE' : notToday(data.generatedAt) ? 'PREVIOUS BRIEF' : 'LATEST BRIEF'}</span><span>${historical ? 'Published' : 'Last updated'} <time datetime="${e(data.generatedAt)}">${e(timestamp(data.generatedAt))}</time>${fallback ? ' · Recovered from a valid archive' : ''}</span></div><span class="data-note">${historical ? 'Historical research · Quotes and charts remain current' : 'Daily research · Market feeds update independently'}</span>` : '<span class="status-label">UNAVAILABLE</span><span>Research could not be loaded. Public charts remain available.</span><button class="text-button" id="retry-data">Retry</button>';
  document.querySelector('#retry-data')?.addEventListener('click', () => location.reload());
}

export function renderChanges(data: Intel | null, previous: Intel | null) {
  const items = data ? changesSince(data, previous) : [];
  document.querySelector('#changes')!.innerHTML = `${sectionHeader('changes-title', 'Since the previous brief', previous ? `${day(previous.asOfDate).toUpperCase()} → ${day(data!.asOfDate).toUpperCase()}` : 'PUBLISHED COMPARISONS')}${items.length ? `<div class="changes-list">${items.map(item => `<div><span>${e(item.label)}</span><span>${e(readable(item.before))}</span><b aria-hidden="true">→</b>${badge(item.after)}</div>`).join('')}</div>` : `<p>${previous ? 'No changes in the comparable sentiment, confidence, NQ bias, regime or volatility fields.' : 'A previous valid briefing is needed to compare the market view.'}</p>`}`;
}
