import '../styles.css';
import './labs.css';
import './visual.css';
import { pageShell, startClock } from './shared';
import { badge } from '../components/primitives';
import { day, escape as e, number, readable, signed, timestamp } from '../lib/format';
import { changesSince } from '../lib/intel/compare';
import { fxBiasLabel } from '../lib/intel/fx';
import { loadArchive, loadDashboard } from '../lib/intel/load';
import { localizeResearch } from '../lib/intel/localize';
import type { Intel } from '../lib/intel/schema';
import { mountField, mountLevels, mountRegime, type FieldNode, type LevelMark } from './visual-scene';

type DeskNode = FieldNode & { title: string; note: string; rows: { label: string; value: string }[] };
type Point = { date: string; sentiment: number | null; nq: number | null; intel: Intel };
const SCORE: Record<string, number> = { bearish: -2, mildly_bearish: -1, neutral: 0, mildly_bullish: 1, bullish: 2 };
const score = (value: string | null | undefined) => value != null && value in SCORE ? SCORE[value]! : null;
const stripSymbols = ['NQ', 'NDX', 'US10Y', 'VIX', 'VXN', 'DXY', 'GC'];

const body = `<div class="lab-intro viz-intro"><div><div class="lab-kicker"><span class="status-dot"></span>MANGO ATLAS / VISUAL<span class="early-tag">UNLISTED</span></div><h1>See the brief.<br><span>Not the scroll.</span></h1><p class="viz-dek">Same published research as the dashboard. The move, the regime and the levels, without hunting through the writeup.</p><p id="one-line">Loading the published briefing…</p></div><div class="viz-controls"><label for="brief-date">Briefing archive</label><select id="brief-date" disabled><option>Loading briefings…</option></select><p id="brief-meta" class="mono"></p></div></div>
<div id="quote-strip" class="viz-quotes" aria-label="Published market snapshot"></div>
<section class="viz-panel" aria-labelledby="regime-title"><div class="viz-head"><h2 id="regime-title">Regime core</h2><span id="regime-meta">BIAS · CONFIDENCE · VOL</span></div><div class="regime-layout"><div class="regime-stage"><canvas id="regime-canvas" aria-label="Regime core. Color is broad bias, size is confidence, spin is the volatility outlook, and the inner sphere is Nasdaq bias."></canvas></div><div class="regime-copy" id="regime-copy"></div></div></section>
<section class="viz-panel" id="field-panel" aria-labelledby="field-title"><div class="viz-head"><h2 id="field-title">Cross-asset field</h2><div class="segmented" role="group" aria-label="Field source"><button type="button" data-field="markets" aria-pressed="true">Markets</button><button type="button" data-field="leadership" aria-pressed="false">Leadership</button></div></div><p class="viz-legend" id="field-legend">Height uses a square-root scale of the published percent change, so a tenth of a percent is still visible next to a multi-percent move. Green is up, red is down, gray means that change was not in the briefing.</p><div class="field-layout"><div class="field-stage" id="field-stage"><canvas id="field-canvas" aria-label="Three-dimensional columns of published percent changes."></canvas><p class="field-hint" id="field-hint"></p><button type="button" class="ghost-button" id="field-reset">Reset view</button></div><div class="field-side"><div id="field-readout" aria-live="polite"></div><div id="field-list" role="listbox" aria-label="Published instruments"></div></div></div></section>
<section class="viz-panel" aria-labelledby="path-title"><div class="viz-head"><h2 id="path-title">Bias path</h2><span id="path-meta">RECENT BRIEFINGS</span></div><div class="chart-key"><span><i class="broad"></i>Broad book</span><span><i class="nq"></i>Nasdaq</span></div><div id="bias-chart"></div></section>
<section class="viz-panel" aria-labelledby="shift-title"><div class="viz-head"><h2 id="shift-title">Since the previous brief</h2><span id="shift-meta"></span></div><div id="shift-body"></div></section>
<section class="viz-panel" aria-labelledby="lead-title"><div class="viz-head"><h2 id="lead-title">Leadership</h2><span>MEGA-CAPS · SEMIS</span></div><div id="leadership-body"></div></section>
<section class="viz-panel" aria-labelledby="fx-title"><div class="viz-head"><h2 id="fx-title">FX levels</h2><span>SUPPORT · PRICE · RESISTANCE</span></div><p class="viz-copy fx-pulse" id="fx-pulse"></p><div class="fx-layout"><div id="fx-list" class="fx-list"></div><div class="level-stage"><canvas id="level-canvas" aria-label="Support, snapshot price and resistance as stacked planes. Spacing is scaled to that pair's published range."></canvas><p class="level-caption" id="level-caption"></p></div></div></section>
<section class="viz-panel" aria-labelledby="event-title"><div class="viz-head"><h2 id="event-title">Catalysts</h2><span id="catalyst-meta"></span></div><div id="catalyst-chart"></div><div id="catalyst-list" class="event-scroll"></div></section>
<div class="viz-split"><section class="viz-panel" aria-labelledby="themes-title"><div class="viz-head"><h2 id="themes-title">Themes and risks</h2></div><div id="theme-body"></div></section><section class="viz-panel" aria-labelledby="wire-title"><div class="viz-head"><h2 id="wire-title">Wire</h2><span id="wire-meta"></span></div><div id="wire-body"></div></section></div>`;

document.querySelector('#app')!.innerHTML = pageShell('Visual', body);
startClock();

const dateSelect = document.querySelector<HTMLSelectElement>('#brief-date')!;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
document.querySelector('#field-hint')!.textContent = reduce ? 'Select a column from the list.' : 'Drag to orbit. Scroll to zoom. Select a column.';
document.querySelector('#regime-meta')!.textContent = reduce ? 'COLOR = BIAS · SIZE = CONFIDENCE' : 'COLOR = BIAS · SIZE = CONFIDENCE · SPIN = VOL';

const fieldView = mountField(document.querySelector('#field-canvas')!, document.querySelector('#field-stage')!, id => choose(id));
const regimeView = mountRegime(document.querySelector('#regime-canvas')!);
const levelView = mountLevels(document.querySelector('#level-canvas')!);
if (!fieldView) {
  document.querySelector('#field-reset')?.remove();
  document.querySelector('#field-hint')!.textContent = '3D is unavailable here. The list still has every published move.';
}
if (!regimeView) document.querySelector('#regime-canvas')!.replaceWith(Object.assign(document.createElement('p'), { className: 'viz-empty', textContent: '3D regime core is unavailable in this browser. The readouts beside it still update.' }));
if (!levelView) document.querySelector('#level-canvas')!.replaceWith(Object.assign(document.createElement('p'), { className: 'viz-empty', textContent: '3D levels are unavailable. The rails and numbers are the precise view.' }));

const disposers = [fieldView?.destroy, regimeView?.destroy, levelView?.destroy].filter((fn): fn is () => void => Boolean(fn));
if (import.meta.hot) import.meta.hot.dispose(() => disposers.forEach(fn => fn()));

let dates: string[] = [];
let latestDate = '';
let viewing: Intel | null = null;
let mode: 'markets' | 'leadership' = 'markets';
let nodes: DeskNode[] = [];
let selectedId: string | null = null;
let fxSymbol: string | null = null;
let wireTag = 'All';
let request = 0;
let historyState: 'loading' | 'ready' = 'loading';
let series: Point[] = [];
const byDate = new Map<string, Intel>();
let restoreChartFocus = false;

function familyOf(symbol: string, instrumentType: string) {
  if (symbol === 'GC' || symbol === 'SI' || symbol === 'XAUUSD') return 'Metals';
  if (symbol === 'DXY' || instrumentType === 'fx') return 'FX';
  if (instrumentType === 'yield') return 'Rates';
  if (instrumentType === 'volatility_index') return 'Volatility';
  return 'Index';
}
function levelDigits(value: number) {
  const abs = Math.abs(value);
  if (abs >= 100) return 2;
  if (abs >= 20) return 3;
  return 5;
}
function priceText(value: number | null, unit: string) {
  if (value == null) return '—';
  const digits = unit === 'percent' ? 3 : unit === 'rate' ? 5 : levelDigits(value);
  return `${number(value, digits)}${unit === 'percent' ? '%' : ''}`;
}
function quoteFor(data: Intel, symbol: string) {
  return data.markets.find(market => market.symbol === symbol) ?? null;
}
function changeText(change: number | null) {
  return change == null ? '—' : signed(change);
}
function toneClass(change: number | null) {
  if (change == null || change === 0) return '';
  return change > 0 ? 'positive-text' : 'negative-text';
}

function marketNodes(data: Intel): DeskNode[] {
  return data.markets.map(market => ({
    id: market.symbol,
    symbol: market.symbol,
    family: familyOf(market.symbol, market.instrumentType),
    change: market.changePct,
    title: market.label,
    note: `${market.label}. ${readable(market.status)} snapshot${market.source ? `, ${market.source}` : ''}.`,
    rows: [
      { label: 'Price', value: priceText(market.price, market.unit) },
      { label: 'Change', value: changeText(market.changePct) },
      ...(market.updatedAt ? [{ label: 'As of', value: timestamp(market.updatedAt) }] : []),
      { label: 'Unit', value: market.unit },
    ],
  }));
}
function leadershipNodes(data: Intel): DeskNode[] {
  const groups = [['Mega-caps', data.nq?.megaCaps ?? []], ['Semiconductors', data.nq?.semiconductors ?? []]] as const;
  const seen = new Set<string>();
  const list: DeskNode[] = [];
  for (const [family, items] of groups) {
    for (const item of items) {
      if (item.changePct == null || seen.has(item.symbol)) continue;
      seen.add(item.symbol);
      list.push({
        id: item.symbol, symbol: item.symbol, family, change: item.changePct, title: item.symbol, note: item.context,
        rows: [{ label: 'Session change', value: changeText(item.changePct) }, ...(item.updatedAt ? [{ label: 'As of', value: timestamp(item.updatedAt) }] : [])],
      });
    }
  }
  return list;
}

function renderReadout(node: DeskNode | undefined) {
  const host = document.querySelector('#field-readout')!;
  if (!node) { host.innerHTML = '<p class="viz-empty">Nothing published for this view.</p>'; return; }
  host.innerHTML = `<span class="eyebrow">${e(node.family)}</span><strong>${e(node.symbol)}</strong><p>${e(node.note)}</p><dl>${node.rows.map(row => `<div><dt>${e(row.label)}</dt><dd class="mono">${e(row.value)}</dd></div>`).join('')}</dl>`;
}
function renderList() {
  const host = document.querySelector('#field-list')!;
  const families = [...new Set(nodes.map(node => node.family))];
  host.innerHTML = families.map(family => `<div class="lane"><span class="lane-label">${e(family.toUpperCase())}</span>${nodes.filter(node => node.family === family).map(node => `<button type="button" class="field-option" data-node="${e(node.id)}" role="option" aria-selected="${node.id === selectedId}"><span><b class="mono">${e(node.symbol)}</b><small>${e(mode === 'markets' ? node.title : node.note)}</small></span><em class="${toneClass(node.change)}">${e(changeText(node.change))}</em></button>`).join('')}</div>`).join('');
}
function choose(id: string) {
  selectedId = id;
  fieldView?.highlight(id);
  renderReadout(nodes.find(node => node.id === id));
  document.querySelectorAll<HTMLButtonElement>('[data-node]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.node === id)));
}
function applyField(prefer?: string) {
  if (!viewing) return;
  nodes = mode === 'markets' ? marketNodes(viewing) : leadershipNodes(viewing);
  fieldView?.setNodes(nodes);
  const next = prefer && nodes.some(node => node.id === prefer) ? prefer : nodes.some(node => node.id === selectedId) ? selectedId : nodes[0]?.id ?? null;
  selectedId = next;
  renderList();
  if (next) choose(next);
  else { fieldView?.highlight(null); renderReadout(undefined); }
  document.querySelectorAll<HTMLButtonElement>('[data-field]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.field === mode)));
}

function renderQuotes(data: Intel) {
  const cards = stripSymbols.flatMap(symbol => {
    const market = quoteFor(data, symbol);
    if (!market) return [];
    return [`<article class="viz-quote" title="${e(market.label)}"><span>${e(market.symbol)}</span><strong>${e(priceText(market.price, market.unit))}</strong><em class="${toneClass(market.changePct)}">${e(changeText(market.changePct))}</em><small>${e(readable(market.status).toUpperCase())}</small></article>`];
  });
  document.querySelector('#quote-strip')!.innerHTML = cards.join('') || '<article class="viz-quote"><span>SNAPSHOT</span><strong>—</strong><small>No market block in this briefing</small></article>';
}
function renderRegime(data: Intel) {
  const view = localizeResearch(data);
  regimeView?.setState({ sentiment: view.overview?.sentiment ?? null, confidence: view.overview?.confidence ?? null, volatility: view.overview?.volatilityOutlook ?? null, nqBias: view.nq?.bias ?? null });
  const nq = view.nq;
  document.querySelector('#regime-copy')!.innerHTML = `<div class="regime-metrics">${badge(view.overview?.sentiment)}${badge(view.overview?.confidence)}${badge(view.overview?.volatilityOutlook)}${nq ? badge(nq.bias, nq.bias ? `NQ ${readable(nq.bias)}` : undefined) : ''}</div>${nq?.regime ? `<p class="nq-line">${e(nq.regime)}</p>` : ''}<div class="regime-call"><div><span class="eyebrow orange">CATALYST</span><p>${e(nq?.primaryCatalyst ?? 'No primary catalyst supplied.')}</p></div><div><span class="eyebrow negative-text">RISK</span><p>${e(nq?.primaryRisk ?? 'No primary risk supplied.')}</p></div></div>${nq?.summary ? `<details class="research-detail"><summary>Nasdaq note<span>Briefing text</span></summary><p class="viz-copy">${e(nq.summary)}</p>${nq.overnight ? `<p class="viz-copy">${e(nq.overnight)}</p>` : ''}${nq.volatility ? `<p class="viz-copy">${e(nq.volatility)}</p>` : ''}</details>` : ''}`;
}
function renderLeadership(data: Intel) {
  const rows = leadershipNodes(localizeResearch(data));
  const max = Math.max(0.5, ...rows.map(row => Math.abs(row.change ?? 0)));
  document.querySelector('#leadership-body')!.innerHTML = rows.length ? `<div class="bar-list">${rows.map(row => {
    const width = Math.abs(row.change ?? 0) / max * 50;
    const box = row.change == null ? '' : `<i class="bar-fill ${row.change > 0 ? 'up' : 'down'}" style="${row.change >= 0 ? 'left:50%' : 'right:50%'};width:${width}%"></i>`;
    return `<button type="button" class="bar-row" data-leader="${e(row.id)}"><span class="bar-top"><b class="mono">${e(row.symbol)}</b><span class="bar-track"><i class="bar-zero"></i>${box}</span><em class="bar-value ${toneClass(row.change)}">${e(signed(row.change))}</em></span><span class="bar-note">${e(row.note)}</span></button>`;
  }).join('')}</div>` : '<p class="viz-empty" style="padding:16px 18px">No mega-cap or semiconductor percent changes in this briefing.</p>';
}

function rail(support: number[], resistance: number[], price: number | null) {
  const nums = [...support, ...resistance, ...(price == null ? [] : [price])];
  if (!nums.length) return '';
  const low = Math.min(...nums);
  const high = Math.max(...nums);
  const span = high - low || Math.abs(high) * 0.02 || 1;
  const pad = span * 0.08;
  const pos = (value: number) => ((value - (low - pad)) / (span + pad * 2)) * 100;
  const tick = (value: number, kind: string) => `<i class="${kind}" style="left:${pos(value).toFixed(2)}%"></i>`;
  return `<span class="rail" aria-hidden="true">${support.map(value => tick(value, 'sup')).join('')}${resistance.map(value => tick(value, 'res')).join('')}${price == null ? '' : tick(price, 'px')}</span>`;
}
function renderFx(data: Intel) {
  const view = localizeResearch(data);
  const instruments = view.fx?.instruments ?? [];
  document.querySelector('#fx-pulse')!.textContent = view.fx?.macroPulse ?? '';
  if (!instruments.length) {
    fxSymbol = null;
    levelView?.setMarks([]);
    document.querySelector('#fx-list')!.innerHTML = '<p class="viz-empty">No FX instruments in this briefing.</p>';
    document.querySelector('#level-caption')!.textContent = '';
    return;
  }
  if (!fxSymbol || !instruments.some(item => item.symbol === fxSymbol)) fxSymbol = instruments[0]!.symbol;
  document.querySelector('#fx-list')!.innerHTML = instruments.map(item => {
    const quote = quoteFor(data, item.symbol);
    const price = quote?.price ?? null;
    return `<button type="button" class="fx-pick" data-fx="${e(item.symbol)}" aria-pressed="${item.symbol === fxSymbol}"><span class="fx-pick-top"><b class="mono">${e(item.symbol)}</b>${badge(item.bias, fxBiasLabel(item))}</span><span class="fx-posture">${e(item.posture ?? item.driver ?? 'No posture published.')}</span>${rail(item.support, item.resistance, price)}</button>`;
  }).join('');
  const selected = instruments.find(item => item.symbol === fxSymbol) ?? instruments[0]!;
  const quote = quoteFor(data, selected.symbol);
  const marks: LevelMark[] = [
    ...selected.support.map(value => ({ kind: 'support' as const, value })),
    ...selected.resistance.map(value => ({ kind: 'resistance' as const, value })),
    ...(quote?.price == null ? [] : [{ kind: 'price' as const, value: quote.price }]),
  ];
  levelView?.setMarks(marks);
  const fmt = (values: number[]) => values.length ? values.map(value => number(value, levelDigits(value))).join(' / ') : 'not published';
  document.querySelector('#level-caption')!.textContent = `${selected.symbol}. Support ${fmt(selected.support)}. ${quote?.price == null ? 'No snapshot price for this symbol.' : `Snapshot ${priceText(quote.price, quote.unit)}.`} Resistance ${fmt(selected.resistance)}. Planes are scaled to this printed range, not to a fixed increment.`;
}

function renderCatalysts(data: Intel) {
  const events = [...data.events].sort((a, b) => a.date.localeCompare(b.date) || ((a.datetime ? Date.parse(a.datetime) : Infinity) - (b.datetime ? Date.parse(b.datetime) : Infinity)));
  const days = [...new Set(events.map(event => event.date))];
  document.querySelector('#catalyst-meta')!.textContent = `${events.length} PUBLISHED`;
  document.querySelector('#catalyst-chart')!.innerHTML = days.length ? `<div class="day-cols">${days.map(date => {
    const group = events.filter(event => event.date === date);
    const high = group.filter(event => event.impact === 'high').length;
    const med = group.filter(event => event.impact === 'medium').length;
    const low = group.length - high - med;
    return `<div class="day-col"><span class="stack"><i class="high" style="height:${high * 14}px"></i><i class="med" style="height:${(med + low) * 8}px"></i></span><span>${e(day(date).replace(/ \d{4}$/, ''))}</span><b>${group.length}</b></div>`;
  }).join('')}</div><p class="viz-legend">Red is high impact. Amber is everything else. Counts are what this briefing published, not a live calendar.</p>` : '';
  document.querySelector('#catalyst-list')!.innerHTML = events.length ? events.map(event => `<article class="event-row"><div class="event-time mono">${event.datetime ? e(timestamp(event.datetime).split(' · ').at(-1) ?? '') : e(readable(event.timeLabel))}<span>${e(event.currency)}</span></div><div class="event-body"><div><a href="${e(event.source)}" target="_blank" rel="noopener noreferrer">${e(event.title)}</a><span class="impact ${event.impact}">${event.impact === 'medium' ? 'MED' : event.impact.toUpperCase()}</span></div><small>${e(event.country)} · ${e(day(event.date))}</small><dl class="event-values"><div><dt>Forecast</dt><dd>${e(event.forecast ?? '—')}</dd></div><div><dt>Previous</dt><dd>${e(event.previous ?? '—')}</dd></div><div><dt>Actual</dt><dd>${e(event.actual ?? '—')}</dd></div></dl></div></article>`).join('') : '<p class="viz-empty">No events in this briefing.</p>';
}
function renderThemes(data: Intel) {
  const view = localizeResearch(data);
  const themes = view.overview?.themes ?? [];
  const risks = view.overview?.risks ?? [];
  const list = (items: string[], risk = false) => items.length ? `<ol class="theme-list${risk ? ' risk-list' : ''}">${items.map((item, index) => `<li><span class="theme-index mono">${String(index + 1).padStart(2, '0')}</span><p>${e(item)}</p></li>`).join('')}</ol>` : '<p class="viz-empty">None published.</p>';
  document.querySelector('#theme-body')!.innerHTML = `<div class="viz-themes">${list(themes)}</div><details class="research-detail risk-detail" open><summary>Risks to watch<span>${risks.length}</span></summary><div class="viz-risks">${list(risks, true)}</div></details>`;
}
function renderWire(data: Intel) {
  const view = localizeResearch(data);
  const items = view.intelligence;
  const tags = ['All', ...new Set(items.flatMap(item => item.tags))];
  if (!tags.includes(wireTag)) wireTag = 'All';
  const visible = wireTag === 'All' ? items : items.filter(item => item.tags.includes(wireTag));
  document.querySelector('#wire-meta')!.textContent = `${visible.length} / ${items.length}`;
  document.querySelector('#wire-body')!.innerHTML = items.length ? `<div class="tag-row" role="group" aria-label="Filter the wire">${tags.map(tag => {
    const count = tag === 'All' ? items.length : items.filter(item => item.tags.includes(tag)).length;
    return `<button type="button" data-wire="${e(tag)}" aria-pressed="${tag === wireTag}">${e(tag)}<span>${count}</span></button>`;
  }).join('')}</div><div class="viz-stories">${visible.map(item => `<article class="viz-story"><div class="story-meta"><span>${e(item.source)}</span><time>${item.publishedAt ? e(timestamp(item.publishedAt)) : 'Time not supplied'}</time></div><h3><a href="${e(item.url)}" target="_blank" rel="noopener noreferrer">${e(item.headline)}</a></h3><p>${e(item.summary)}</p><div class="story-tags">${item.tags.map(tag => `<span>${e(tag)}</span>`).join('')}${item.symbols.map(symbol => `<span>${e(symbol)}</span>`).join('')}</div></article>`).join('')}</div>` : '<p class="viz-empty" style="padding:16px">No wire items in this briefing.</p>';
}

function line(points: Point[], key: 'sentiment' | 'nq', xAt: (index: number) => number, yAt: (value: number) => number) {
  let path = '';
  let open = false;
  points.forEach((point, index) => {
    const value = point[key];
    if (value == null) { open = false; return; }
    path += `${open ? 'L' : 'M'}${xAt(index).toFixed(1)},${yAt(value).toFixed(1)}`;
    open = true;
  });
  return path;
}
function renderPath() {
  const host = document.querySelector('#bias-chart')!;
  const meta = document.querySelector('#path-meta')!;
  if (historyState === 'loading') { meta.textContent = 'LOADING ARCHIVE'; host.innerHTML = '<p class="viz-empty" style="padding:8px 18px 18px">Drawing the path from recent briefings…</p>'; return; }
  meta.textContent = `${series.length} SESSIONS · −2 BEARISH TO +2 BULLISH`;
  if (series.length < 2) { host.innerHTML = '<p class="viz-empty" style="padding:8px 18px 18px">At least two briefings are needed to draw a path.</p>'; return; }
  const width = 960;
  const height = 300;
  const pad = { l: 96, r: 16, t: 16, b: 36 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const xAt = (index: number) => pad.l + (index / (series.length - 1)) * innerW;
  const yAt = (value: number) => pad.t + ((2 - value) / 4) * innerH;
  const labels = [[2, 'Bullish'], [1, 'Mild bull'], [0, 'Neutral'], [-1, 'Mild bear'], [-2, 'Bearish']] as const;
  const selected = series.findIndex(point => point.date === viewing?.asOfDate);
  const step = innerW / (series.length - 1);
  host.innerHTML = `<svg viewBox="0 0 ${width} ${height}" tabindex="0" role="group" aria-label="Bias path from recent briefings. Orange is the broad book, blue is Nasdaq. Activate a session to load it.">${labels.map(([value, label]) => `<line x1="${pad.l}" x2="${width - pad.r}" y1="${yAt(value)}" y2="${yAt(value)}" stroke="${value === 0 ? '#ffffff22' : '#ffffff10'}"></line><text x="8" y="${yAt(value) + 4}" fill="#8d8d8d" font-size="11" font-family="ui-monospace, monospace">${label}</text>`).join('')}${selected >= 0 ? `<line x1="${xAt(selected)}" x2="${xAt(selected)}" y1="${pad.t}" y2="${height - pad.b}" stroke="#ff990a55"></line>` : ''}<path d="${line(series, 'sentiment', xAt, yAt)}" fill="none" stroke="#ff990a" stroke-width="2"></path><path d="${line(series, 'nq', xAt, yAt)}" fill="none" stroke="#8eb4d4" stroke-width="2"></path>${series.map((point, index) => `<rect data-i="${index}" x="${(xAt(index) - step / 2).toFixed(1)}" y="${pad.t}" width="${step.toFixed(1)}" height="${innerH}" fill="transparent"></rect>${point.sentiment == null ? '' : `<circle cx="${xAt(index)}" cy="${yAt(point.sentiment)}" r="${point.date === viewing?.asOfDate ? 5 : 3}" fill="#ff990a"></circle>`}${point.nq == null ? '' : `<circle cx="${xAt(index)}" cy="${yAt(point.nq)}" r="${point.date === viewing?.asOfDate ? 5 : 3}" fill="#8eb4d4"></circle>`}<text x="${xAt(index)}" y="${height - 12}" text-anchor="middle" fill="#7d7d7d" font-size="10" font-family="ui-monospace, monospace">${index % Math.ceil(series.length / 6) === 0 ? e(day(point.date).replace(/ \d{4}$/, '')) : ''}</text>`).join('')}</svg><table class="sr-only"><caption>Bias scores, −2 bearish to +2 bullish</caption><thead><tr><th>Date</th><th>Broad</th><th>Nasdaq</th></tr></thead><tbody>${series.map(point => `<tr><td>${e(point.date)}</td><td>${point.sentiment ?? '—'}</td><td>${point.nq ?? '—'}</td></tr>`).join('')}</tbody></table>`;
  const svg = host.querySelector('svg')!;
  const open = (index: number) => {
    const point = series[index];
    if (!point || point.date === viewing?.asOfDate) return;
    restoreChartFocus = document.activeElement === svg;
    dateSelect.value = point.date;
    void show(point.date);
  };
  svg.addEventListener('click', event => {
    const hit = (event.target as Element).closest<SVGGraphicsElement>('[data-i]');
    if (hit?.dataset.i) open(Number(hit.dataset.i));
  });
  svg.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const current = Math.max(0, series.findIndex(point => point.date === viewing?.asOfDate));
    open(Math.min(series.length - 1, Math.max(0, current + (event.key === 'ArrowRight' ? 1 : -1))));
  });
  if (restoreChartFocus) { restoreChartFocus = false; svg.focus(); }
}

function renderShift(current: Intel, previous: Intel | null) {
  const host = document.querySelector('#shift-body')!;
  const meta = document.querySelector('#shift-meta')!;
  if (historyState === 'loading') { meta.textContent = 'LOADING'; host.innerHTML = '<p class="viz-empty shift-note">Comparing this brief with earlier sessions…</p>'; return; }
  if (!previous) { meta.textContent = 'START OF WINDOW'; host.innerHTML = '<p class="viz-empty shift-note">No earlier briefing in this window.</p>'; return; }
  meta.textContent = `${day(previous.asOfDate).toUpperCase()} → ${day(current.asOfDate).toUpperCase()}`;
  const changes = changesSince(current, previous);
  const prior = new Map(previous.markets.map(market => [market.symbol, market]));
  const prices = current.markets.flatMap(market => {
    const before = prior.get(market.symbol);
    if (!before || market.price == null || before.price == null || before.price === 0) return [];
    return [{ symbol: market.symbol, unit: market.unit, from: before.price, to: market.price, pct: (market.price - before.price) / before.price * 100 }];
  }).sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, 8);
  host.innerHTML = `${changes.length ? `<div class="shift-changes">${changes.map(change => `<div><span>${e(change.label)}</span><span>${e(readable(change.before))} → ${e(readable(change.after))}</span>${badge(change.after)}</div>`).join('')}</div>` : '<p class="viz-empty shift-note">No change in sentiment, confidence, Nasdaq bias, regime or volatility.</p>'}<div class="shift-prices">${prices.map(price => `<div><span class="mono">${e(price.symbol)}</span><span class="mono">${e(priceText(price.from, price.unit))} → ${e(priceText(price.to, price.unit))}</span><b class="${toneClass(price.pct)}">${e(signed(price.pct))}</b></div>`).join('')}</div>`;
}

function renderBrief(raw: Intel) {
  viewing = raw;
  const view = localizeResearch(raw);
  const historical = raw.asOfDate !== latestDate;
  document.querySelector('#one-line')!.textContent = view.overview?.oneLineTake ?? 'No market takeaway supplied for this briefing.';
  document.querySelector('#brief-meta')!.textContent = `${historical ? 'Archive' : 'Latest'} · ${timestamp(raw.generatedAt)} · ${raw.provenance.source}`;
  renderQuotes(raw);
  renderRegime(raw);
  applyField();
  renderLeadership(raw);
  renderFx(raw);
  renderCatalysts(raw);
  renderThemes(raw);
  renderWire(raw);
  renderPath();
  renderShift(raw, historyState === 'ready' ? series[series.findIndex(point => point.date === raw.asOfDate) - 1]?.intel ?? null : null);
}

async function intelFor(date: string) {
  const cached = byDate.get(date);
  if (cached) return cached;
  const data = await loadArchive(date);
  byDate.set(date, data);
  return data;
}
async function show(date: string) {
  const ticket = ++request;
  dateSelect.setAttribute('aria-busy', 'true');
  try {
    const data = await intelFor(date);
    if (ticket !== request) return;
    renderBrief(data);
  } catch {
    if (ticket !== request) return;
    document.querySelector('#brief-meta')!.textContent = 'That archive could not be loaded. The previous selection is still displayed.';
    if (viewing) dateSelect.value = viewing.asOfDate;
  } finally { if (ticket === request) dateSelect.removeAttribute('aria-busy'); }
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const out = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      out[index] = await fn(items[index]!);
    }
  }));
  return out;
}

document.querySelector('#field-reset')?.addEventListener('click', () => fieldView?.reset());
document.querySelector('#field-panel')!.addEventListener('click', event => {
  const target = event.target as Element;
  const source = target.closest<HTMLButtonElement>('[data-field]');
  if (source?.dataset.field === 'markets' || source?.dataset.field === 'leadership') { mode = source.dataset.field; applyField(); }
  const node = target.closest<HTMLButtonElement>('[data-node]');
  if (node?.dataset.node) choose(node.dataset.node);
});
document.querySelector<HTMLElement>('#field-list')!.addEventListener('keydown', event => {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  event.preventDefault();
  const index = nodes.findIndex(node => node.id === selectedId);
  const next = nodes[index + (event.key === 'ArrowDown' ? 1 : -1)];
  if (!next) return;
  choose(next.id);
  document.querySelector<HTMLButtonElement>(`[data-node="${CSS.escape(next.id)}"]`)?.focus();
});
document.querySelector('#leadership-body')!.addEventListener('click', event => {
  const row = (event.target as Element).closest<HTMLButtonElement>('[data-leader]');
  if (!row?.dataset.leader) return;
  mode = 'leadership';
  applyField(row.dataset.leader);
  document.querySelector('#field-panel')!.scrollIntoView({ block: 'nearest' });
});
document.querySelector('#fx-list')!.addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLButtonElement>('[data-fx]');
  if (!button?.dataset.fx || !viewing) return;
  fxSymbol = button.dataset.fx;
  renderFx(viewing);
});
document.querySelector('#wire-body')!.addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLButtonElement>('[data-wire]');
  if (!button?.dataset.wire || !viewing) return;
  wireTag = button.dataset.wire;
  renderWire(viewing);
});
dateSelect.addEventListener('change', () => { void show(dateSelect.value); });

loadDashboard().then(async result => {
  if (!result.current) throw new Error('No briefing');
  latestDate = result.current.asOfDate;
  dates = result.dates.length ? result.dates : [latestDate];
  byDate.set(latestDate, result.current);
  dateSelect.innerHTML = dates.map(date => `<option value="${date}">${e(day(date))}${date === latestDate ? ' · Latest' : ''}</option>`).join('');
  dateSelect.disabled = false;
  dateSelect.value = latestDate;
  renderBrief(result.current);
  const loaded = await mapPool(dates, 4, async date => date === latestDate ? result.current : loadArchive(date).catch(() => null));
  series = loaded.flatMap(item => item ? [{ date: item.asOfDate, sentiment: score(item.overview?.sentiment), nq: score(item.nq?.bias), intel: item }] : []).sort((a, b) => a.date.localeCompare(b.date));
  for (const point of series) byDate.set(point.date, point.intel);
  historyState = 'ready';
  if (viewing) { renderPath(); renderShift(viewing, series[series.findIndex(point => point.date === viewing!.asOfDate) - 1]?.intel ?? null); }
}).catch(() => {
  document.querySelector('#one-line')!.textContent = 'The briefing could not be loaded.';
  document.querySelector('#brief-meta')!.textContent = 'Check the connection and reload.';
});
