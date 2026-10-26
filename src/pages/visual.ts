import '../lib/analytics';
import './visual.css';
import { day, escape as e, isStale, timestamp, zoneName } from '../lib/format';
import { loadArchive, loadDashboard } from '../lib/intel/load';
import type { Intel } from '../lib/intel/schema';
import { buildLens, buildShiftLens, LENSES, type LensId, type VisualLens, type VisualNode } from './visual-data';
import { mountAtlas } from './visual-scene';
import { FX_LEVEL_COLORS } from './visual-layout';
import { siteNavigation } from '../components/navigation';

const paths: Record<string, string> = {
  overview: '<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="10" ry="5" transform="rotate(-35 12 12)"/>',
  markets: '<path d="M4 20V12h4v8m3 0V4h4v16m3 0V8h4v12M2 20h22"/>',
  leadership: '<path d="m3 17 6-6 5 3 7-10M15 4h6v6M3 21h18"/>',
  levels: '<path d="m3 7 9-4 9 4-9 4-9-4Zm0 5 9 4 9-4M3 17l9 4 9-4"/>',
  history: '<path d="M3 3v18h18M5 15l5-6 5 4 6-8"/>',
  catalysts: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2"/>',
  themes: '<circle cx="12" cy="12" r="3"/><circle cx="4" cy="4" r="2"/><circle cx="20" cy="6" r="2"/><circle cx="5" cy="21" r="2"/><path d="m6 6 4 4m5 0 3-3M6 19l4-4"/>',
  wire: '<circle cx="5" cy="12" r="3"/><circle cx="18" cy="5" r="2"/><circle cx="18" cy="19" r="2"/><path d="m8 11 8-5m-8 7 8 5"/>',
  back: '<path d="m14 6-6 6 6 6M8 12h13"/>', reset: '<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>',
  rotate: '<ellipse cx="12" cy="12" rx="10" ry="5"/><path d="m8 4 4-2 4 2m-4-2v20"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3v1"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>',
};
const icon = (name: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.overview}</svg>`;
document.querySelector('#app')!.innerHTML = `
<a class="skip-link" href="#item-picker">Skip to data explorer</a><div class="atlas-shell">
<header class="atlas-header"><a class="atlas-brand" href="/" aria-label="Mango Atlas dashboard"><img src="/logo-transparent.png" width="35" height="35" alt=""><span>MANGO <b>ATLAS</b></span></a><div class="header-tools"><label class="date-control"><span>BRIEFING</span><select id="brief-date" aria-label="Briefing date" disabled><option>Loading…</option></select></label></div>${siteNavigation('/visual')}</header>
<main class="atlas-world" id="main" aria-label="Interactive market atlas"><div class="world-grain" aria-hidden="true"></div>
<div class="lens-heading"><div class="lens-kicker"><span class="signal-dot"></span><span id="lens-kicker">DAILY INTELLIGENCE, IN SPACE</span></div><h1 id="lens-title">The market.<br><em>In another dimension.</em></h1><p id="lens-description">Connecting the dots in your daily briefing.</p><div class="lens-legend" id="lens-legend"></div><div id="history-controls" class="history-controls" aria-label="History visualization" hidden><button type="button" data-history="bias" aria-pressed="true">Bias path</button><button type="button" data-history="changes" aria-pressed="false">Snapshot changes</button></div></div><div class="world-stats" id="world-stats"></div>
<div id="scene-stage" class="scene-stage"><canvas id="atlas-canvas" aria-label="Interactive three-dimensional market data. Drag to orbit, pinch or scroll to zoom. Use the data explorer for keyboard access."></canvas><div id="atlas-labels" class="atlas-labels"></div><div id="scene-message" class="scene-message" role="status"><span class="loading-orbit"></span><p>Building your atlas…</p></div></div>
<aside class="atlas-inspector" aria-label="Data explorer"><div class="inspector-top"><span><i class="signal-dot"></i> UNDER THE SURFACE</span><span id="item-position">— / —</span></div><label class="item-picker-label" for="item-picker">Explore a data point</label><select id="item-picker" disabled><option>Loading data…</option></select><div id="selected-content" aria-live="polite" aria-atomic="true"><div class="inspector-loading">The day's signals are on their way.</div></div><div class="inspector-actions"><button type="button" id="previous-item" aria-label="Previous data point">${icon('chevron')}</button><button type="button" id="read-note" disabled>Open research ${icon('chevron')}</button><button type="button" id="next-item" aria-label="Next data point">${icon('chevron')}</button></div></aside>
<div class="scene-bottom"><div class="scene-instructions"><span class="mouse-icon" aria-hidden="true"></span><span id="scene-hint">DRAG TO ORBIT <i>·</i> SCROLL TO ZOOM <i>·</i> SELECT TO EXPLORE</span></div><div class="scene-tools"><button id="auto-rotate" type="button" aria-label="Auto rotate" aria-pressed="false" title="Auto rotate">${icon('rotate')}</button><button id="reset-view" type="button" aria-label="Reset camera" title="Reset camera">${icon('reset')}</button><button id="fullscreen" type="button" aria-label="Full screen" title="Full screen">${icon('expand')}</button><button id="help" type="button" aria-label="How to explore" title="How to explore">${icon('help')}</button></div></div></main>
<nav class="lens-nav" aria-label="Visualization views"><div class="nav-intro"><span>CHANGE YOUR</span><b>PERSPECTIVE</b></div>${LENSES.map((lens, index) => `<button type="button" class="lens-button" data-lens="${lens.id}" aria-pressed="${index === 0}"><span class="lens-icon">${icon(lens.id)}</span><span class="lens-name">${e(lens.label)}</span><span class="lens-number">0${index + 1}</span></button>`).join('')}</nav>
<footer class="atlas-footer"><span id="brief-meta">PUBLISHED SNAPSHOT · LOADING</span><span class="footer-right"><span class="signal-dot"></span> CURATED BY MANGO ATLAS</span></footer></div>
<dialog id="research-dialog" class="atlas-dialog"><div class="dialog-head"><span id="dialog-kicker">RESEARCH</span><button id="close-dialog" type="button" aria-label="Close research">${icon('close')}</button></div><div class="dialog-body" id="dialog-body"></div></dialog>`;

const query = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const dateSelect = query<HTMLSelectElement>('#brief-date');
const picker = query<HTMLSelectElement>('#item-picker');
const dialog = query<HTMLDialogElement>('#research-dialog');
const sceneMessage = query('#scene-message');
let current: Intel | null = null;
let latestDate = '';
let history: Intel[] = [];
let active: LensId = 'overview';
let historyMode: 'bias' | 'changes' = 'bias';
let lens: VisualLens | null = null;
let selected: VisualNode | null = null;
let loadingHistory = true;
let request = 0;
let autoRotate = false;
const cached = new Map<string, Intel>();
const scene = mountAtlas(query<HTMLCanvasElement>('#atlas-canvas'), query('#atlas-labels'), id => selectNode(id));
if (!scene) {
  query('.atlas-world').classList.add('no-webgl');
  sceneMessage.innerHTML = '<div class="fallback-orbit" aria-hidden="true"></div><p>Spatial view is unavailable here.</p><small>Explore every published value using the data picker.</small>';
  query('#auto-rotate').setAttribute('disabled', ''); query('#reset-view').setAttribute('disabled', '');
}
if (matchMedia('(pointer: coarse)').matches) query('#scene-hint').textContent = 'DRAG TO ORBIT · PINCH TO ZOOM · TAP TO EXPLORE';
if (!document.fullscreenEnabled) query('#fullscreen').hidden = true;

function miniChart(node: VisualNode) {
  if (node.levels?.length) {
    const lo = Math.min(...node.levels.map(mark => mark.value)), hi = Math.max(...node.levels.map(mark => mark.value));
    const x = (value: number) => 12 + (value - lo) / (hi - lo || 1) * 236;
    return `<svg class="detail-chart" viewBox="0 0 260 44" role="img" aria-label="Published support, snapshot or labeled proxy, and resistance across this pair's range"><path d="M12 22H248" stroke="#35403c"/>${node.levels.map(mark => `<path d="M${x(mark.value)} ${mark.kind === 'price' ? 7 : 14}v${mark.kind === 'price' ? 30 : 16}" stroke="${FX_LEVEL_COLORS[mark.kind]}" stroke-width="${mark.kind === 'price' ? 3 : 2}"/>`).join('')}</svg>`;
  }
  if (node.metric != null && (active === 'markets' || active === 'leadership' || lens?.id === 'markets')) {
    const max = Math.max(.01, ...lens!.nodes.map(item => Math.abs(item.metric ?? 0))), width = Math.abs(node.metric) / max * 112;
    return `<svg class="detail-chart" viewBox="0 0 260 44" role="img" aria-label="${e(node.value)} relative to the largest published move"><path d="M12 22H248M130 9v26" stroke="#35403c"/><rect x="${node.metric < 0 ? 130 - width : 130}" y="16" width="${width}" height="12" fill="${e(node.color)}"/><circle cx="130" cy="22" r="2" fill="#8d9691"/></svg>`;
  }
  const values = ['bearish', 'mildly bearish', 'neutral', 'mildly bullish', 'bullish'];
  const index = values.indexOf(node.value.toLowerCase().replace('nq ', ''));
  if (index >= 0) return `<div class="bias-meter" role="img" aria-label="${e(node.value)} on the five-step published bias scale">${values.map((_, i) => `<i class="${i === index ? 'active' : ''}" style="--tick-color:${i < 2 ? '#fa817e' : i > 2 ? '#b8e986' : '#ffad45'}"></i>`).join('')}<span>BEARISH</span><span>BULLISH</span></div>`;
  return `<div class="detail-signal" aria-hidden="true"><i style="--node-color:${e(node.color)}"></i><span>${active === 'wire' ? 'CONNECTED INTELLIGENCE' : active === 'catalysts' ? 'ON THE HORIZON' : 'PUBLISHED SIGNAL'}</span><b>↗</b></div>`;
}
function selectNode(id: string) {
  if (!lens) return;
  const node = lens.nodes.find(item => item.id === id); if (!node) return;
  selected = node; scene?.highlight(id); picker.value = id;
  query('#item-position').textContent = `${String(lens.nodes.indexOf(node) + 1).padStart(2, '0')} / ${String(lens.nodes.length).padStart(2, '0')}`;
  const priorities = active === 'markets' ? ['Snapshot price', 'Published change', 'Observed', 'Source'] : active === 'levels' ? ['Snapshot price', 'Support', 'Resistance', 'Bias'] : active === 'catalysts' ? ['Impact', 'Forecast', 'Previous', 'Actual'] : [];
  const details = priorities.length ? priorities.flatMap(label => node.details.filter(row => row.label === label)) : node.details.filter(row => row.value.length < 100).slice(0, 4);
  const displayValue = active === 'markets' ? node.details.find(row => row.label === 'Snapshot price')?.value ?? node.value : node.value;
  query('#selected-content').innerHTML = `<div class="selected-group" style="--node-color:${e(node.color)}"><span></span>${e(node.group)}${active === 'markets' ? ' / SNAPSHOT' : ''}</div><h2 class="selected-name">${e(node.label)}</h2><p class="selected-value${displayValue.length > 30 ? ' long-value' : ''}" style="color:${e(active === 'markets' ? '#e8e9df' : node.color)}">${e(displayValue)}</p>${active === 'markets' ? `<p class="selected-change" style="color:${e(node.color)}">${e(node.value)} <span>SESSION MOVE</span></p>` : ''}${miniChart(node)}<p class="selected-note">${e(node.note || 'Select Open research for the published details.')}</p><dl class="selected-details">${details.map(row => `<div><dt>${e(row.label)}</dt><dd>${e(row.value)}</dd></div>`).join('')}</dl>${active === 'history' && node.date ? `<button type="button" class="load-session" data-date="${e(node.date)}">Open this briefing ${icon('chevron')}</button>` : ''}`;
  query<HTMLButtonElement>('#read-note').disabled = false;
  ['#previous-item', '#next-item'].forEach(selector => query<HTMLButtonElement>(selector).disabled = lens!.nodes.length < 2);
  document.querySelectorAll<HTMLButtonElement>('.fallback-node').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.node === id)));
}
function changeLens(id: LensId, preserveSelection = false) {
  active = id;
  document.querySelectorAll('[data-lens]').forEach(button => button.setAttribute('aria-pressed', String((button as HTMLElement).dataset.lens === id)));
  if (!current) return;
  const prior = preserveSelection ? selected?.id : null;
  lens = id === 'history' && historyMode === 'changes' ? buildShiftLens(current, history) : buildLens(current, history, id);
  query('#history-controls').hidden = id !== 'history';
  query('.atlas-world').setAttribute('data-mode', id);
  query('#lens-kicker').textContent = lens.kicker;
  query('#lens-title').innerHTML = id === 'overview' ? 'The market.<br><em>In another dimension.</em>' : e(lens.title);
  query('#lens-description').textContent = lens.description;
  query('#lens-legend').innerHTML = lens.legend.map(item => `<span><i style="background:${e(item.color)}"></i>${e(item.label)}</span>`).join('');
  query('#world-stats').innerHTML = lens.stats.slice(0, 3).map(stat => `<div><span>${e(stat.label)}</span><b>${e(stat.value)}</b></div>`).join('');
  scene?.setLens(lens);
  if (scene) {
    sceneMessage.hidden = lens.nodes.length > 0;
    if (!lens.nodes.length) sceneMessage.innerHTML = `<p>${e(id === 'history' && loadingHistory ? 'Mapping recent briefings…' : lens.empty ?? 'No data published in this view.')}</p>`;
  } else query('#atlas-labels').innerHTML = `<div class="fallback-grid">${lens.nodes.slice(0, 16).map(node => `<button type="button" class="fallback-node" data-node="${e(node.id)}" style="--node-color:${e(node.color)}"><span>${e(node.label)}</span><b>${e(node.value)}</b></button>`).join('')}</div>`;
  picker.disabled = !lens.nodes.length;
  picker.innerHTML = lens.nodes.length ? lens.nodes.map(node => `<option value="${e(node.id)}">${e(node.label)} · ${e(node.value)}</option>`).join('') : '<option>No published data</option>';
  if (lens.nodes.length) selectNode(prior && lens.nodes.some(node => node.id === prior) ? prior : lens.nodes[0]!.id);
  else {
    selected = null; query('#selected-content').innerHTML = `<p class="inspector-loading">${e(lens.empty ?? 'No data published in this view.')}</p>`;
    query('#item-position').textContent = '00 / 00';
    ['#read-note', '#previous-item', '#next-item'].forEach(selector => query<HTMLButtonElement>(selector).disabled = true);
  }
}
function renderBrief(data: Intel) {
  current = data; cached.set(data.asOfDate, data); dateSelect.value = data.asOfDate;
  query('#brief-meta').textContent = `${data.asOfDate !== latestDate ? 'ARCHIVED BRIEF' : isStale(data.asOfDate) ? 'STALE BRIEF' : 'PUBLISHED SNAPSHOT'} · ${timestamp(data.generatedAt)}${loadingHistory ? ' · MAPPING ARCHIVE' : ''}`;
  changeLens(active, true);
}
async function showBrief(date: string) {
  const ticket = ++request; dateSelect.setAttribute('aria-busy', 'true');
  try { const data = cached.get(date) ?? await loadArchive(date); if (ticket === request) renderBrief(data); }
  catch { if (ticket !== request) return; if (current) dateSelect.value = current.asOfDate; query('#brief-meta').textContent = 'ARCHIVE UNAVAILABLE · PREVIOUS BRIEF STILL DISPLAYED'; }
  finally { if (ticket === request) dateSelect.removeAttribute('aria-busy'); }
}
function stepNode(direction: number) {
  if (!lens?.nodes.length || !selected) return;
  selectNode(lens.nodes[(lens.nodes.indexOf(selected) + direction + lens.nodes.length) % lens.nodes.length]!.id);
}
function openResearch() {
  if (!selected) return;
  query('#dialog-kicker').textContent = `${selected.group.toUpperCase()} · ${current?.asOfDate ?? ''}`;
  query('#dialog-body').innerHTML = `<h2>${e(selected.label)}</h2><p class="dialog-value" style="color:${e(selected.color)}">${e(selected.value)}</p><p class="dialog-note">${e(selected.note)}</p><dl class="dialog-details">${selected.details.map(row => `<div><dt>${e(row.label)}</dt><dd>${e(row.value)}</dd></div>`).join('')}</dl>${selected.url ? `<a class="source-link" href="${e(selected.url)}" target="_blank" rel="noopener noreferrer">Open published source ↗</a>` : ''}<p class="dialog-provenance">From the ${e(current?.asOfDate)} Mango Atlas briefing. ${e(current?.provenance.source)}.</p>`;
  dialog.showModal();
}
query('.lens-nav').addEventListener('click', event => { const button = (event.target as Element).closest<HTMLButtonElement>('[data-lens]'); if (button && LENSES.some(item => item.id === button.dataset.lens)) changeLens(button.dataset.lens as LensId); });
query('#history-controls').addEventListener('click', event => { const button = (event.target as Element).closest<HTMLElement>('[data-history]'); if (button?.dataset.history === 'bias' || button?.dataset.history === 'changes') { historyMode = button.dataset.history; query('#history-controls').querySelectorAll<HTMLElement>('button').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.history === historyMode))); changeLens('history'); } });
query('#atlas-labels').addEventListener('click', event => { const node = (event.target as Element).closest<HTMLElement>('[data-node]'); if (node?.dataset.node) selectNode(node.dataset.node); });
picker.addEventListener('change', () => selectNode(picker.value));
dateSelect.addEventListener('change', () => void showBrief(dateSelect.value));
query('#previous-item').addEventListener('click', () => stepNode(-1)); query('#next-item').addEventListener('click', () => stepNode(1));
query('#read-note').addEventListener('click', openResearch);
query('#selected-content').addEventListener('click', event => { const button = (event.target as Element).closest<HTMLElement>('[data-date]'); if (button?.dataset.date) void showBrief(button.dataset.date); });
query('#reset-view').addEventListener('click', () => scene?.reset());
query('#auto-rotate').addEventListener('click', () => { autoRotate = !autoRotate; scene?.setAutoRotate(autoRotate); query('#auto-rotate').setAttribute('aria-pressed', String(autoRotate)); });
query('#fullscreen').addEventListener('click', () => { const operation = document.fullscreenElement ? document.exitFullscreen() : query('.atlas-shell').requestFullscreen(); void operation.catch(() => { query('#scene-hint').textContent = 'FULL SCREEN UNAVAILABLE · DRAG TO ORBIT'; }); });
document.addEventListener('fullscreenchange', () => query('#fullscreen').setAttribute('aria-label', document.fullscreenElement ? 'Exit full screen' : 'Full screen'));
query('#help').addEventListener('click', () => {
  query('#dialog-kicker').textContent = 'A DIFFERENT PERSPECTIVE';
  query('#dialog-body').innerHTML = `<h2>Explore the briefing.</h2><p class="dialog-note">Choose a perspective along the bottom. Drag the scene to orbit, scroll or pinch to zoom, and select any labeled point to see its published data.</p><dl class="dialog-details"><div><dt>Every point is accessible</dt><dd>The data picker and previous / next controls reach every item, including points hidden behind the scene. Arrow keys change the selected point when the canvas is focused.</dd></div><div><dt>Snapshots, with context</dt><dd>Prices and moves come from the selected published briefing. They are snapshots, not streaming quotes. Gray markers mean a value wasn't supplied. Research stays attached to each point.</dd></div><div><dt>Eight ways to look</dt><dd>Pulse shows the regime. Markets and Leaders compare signed moves on a linear scale. FX planes use each pair's printed range. History follows categorical bias. Calendar uses ordinal impact. Themes have equal weight. Wire connects stories to their actual tags.</dd></div><div><dt>Your time zone</dt><dd>Timed events and publication times display in ${e(zoneName)}. Briefing dates retain their Bangkok publication date.</dd></div></dl>`;
  dialog.showModal();
});
query('#close-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); } });
query<HTMLCanvasElement>('#atlas-canvas').tabIndex = 0;
query('#atlas-canvas').addEventListener('keydown', event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); stepNode(event.key === 'ArrowLeft' ? -1 : 1); } if (event.key === 'Enter') openResearch(); if (event.key.toLowerCase() === 'r') scene?.reset(); });

loadDashboard().then(async result => {
  if (!result.current) throw new Error('No published briefing');
  latestDate = result.current.asOfDate; const dates = result.dates.length ? result.dates : [latestDate]; history = [result.current];
  dateSelect.innerHTML = dates.map(date => `<option value="${date}">${e(day(date))}${date === latestDate ? ' · Latest' : ''}</option>`).join(''); dateSelect.disabled = false; renderBrief(result.current);
  let index = 0; const found: Intel[] = [];
  await Promise.all(Array.from({ length: Math.min(4, dates.length) }, async () => { while (index < dates.length) { const date = dates[index++]!; const data = date === latestDate ? result.current : await loadArchive(date).catch(() => null); if (data) { found.push(data); cached.set(date, data); } } }));
  history = found.sort((a, b) => a.asOfDate.localeCompare(b.asOfDate)); loadingHistory = false; if (current) renderBrief(current);
}).catch(() => {
  sceneMessage.hidden = false; sceneMessage.innerHTML = '<p>The briefing could not be loaded.</p><small>Check your connection, then <button type="button" id="retry-data">reload the atlas</button>.</small>';
  query('#brief-meta').textContent = 'BRIEFING UNAVAILABLE'; query('#selected-content').innerHTML = '<p class="inspector-loading">No briefing is available. Reload to try again.</p>'; query('#retry-data').addEventListener('click', () => location.reload());
});
if (import.meta.hot) import.meta.hot.dispose(() => scene?.destroy());
