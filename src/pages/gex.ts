import '../lib/analytics';
import '../styles.css';
import './labs.css';
import './gex.css';
import { wallsChart, exposureLabel, type WallsRange } from '../components/gex-walls';
import { pageShell, startClock, icon } from './shared';
import { escape as e } from '../lib/format';
import { snapshotSchema, analyze, aggregate, freshness, type Snapshot, type Book } from '../lib/gex/model';

const money = exposureLabel;
const price = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const shortDate = (iso: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
const stamp = (iso: string) => `<time datetime="${e(iso)}" title="${e(iso)}">${new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZone: 'America/New_York' }).format(new Date(iso))} ET</time>`;
const distance = (n: number, spot: number) => `${n >= spot ? '+' : '−'}${price(Math.abs(n - spot))} / ${Math.abs(n / spot - 1).toFixed(4) === '0.0000' ? '0.00' : (Math.abs(n / spot - 1) * 100).toFixed(2)}% ${n >= spot ? 'above' : 'below'} spot`;
let snapshot: Snapshot | null = null;
let book: Book | null = null;
let horizon = 30;
let view = 'heatmap';
let range = .04;
let wallsRange: WallsRange = 'levels';
let step = 2;
let renderId = 0;
let loading = false;
let updateFailed = false;

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = pageShell('GAMMA MAP · NASDAQ', `
<section class="gex-intro"><div><h1>QQQ <span>Gamma Exposure</span></h1><p>Nasdaq-100 ETF · Dollars per 1% move · Delayed snapshot</p></div><a href="#methodology">Methodology ${icon('arrow')}</a></section>
<div class="gex-status" role="status" id="gex-status">Loading the latest published snapshot…</div>
<div class="gex-controls"><div class="gex-book-controls"><span class="control-label">EXPIRY WINDOW</span><div class="gex-segments" role="group" aria-label="Expiry window">${[7,30,90].map(d => `<button data-horizon="${d}" aria-pressed="${d === horizon}">Next ${d} days</button>`).join('')}</div></div><button id="reload-gex" class="gex-reload">${icon('clock')} Check for update</button></div>
<div id="gex-content" aria-busy="true"><div class="gex-loading">Reading the latest options chain…</div></div>
<details id="methodology" class="gex-method"><summary>Methodology & sources <span>Formula, assumptions and data timing +</span></summary><div class="gex-method-grid"><section><h3>Exposure and selected book</h3><p>GEX = gamma × open interest × 100 shares × spot² × 0.01, in dollars of delta-exposure change per 1% QQQ move. Net = calls minus puts; gross = calls plus put magnitude. Green = calls / positive net; red = puts / negative net. Both profile sides share one dollar scale.</p><p>Totals use all usable series and strikes through the selected final calendar date, measured from chain time in New York. The spot-range control only changes the chart. Series count is distinct side/strike/expiry records; OI contracts sum their open interest. OI is daily, with no exact OI timestamp supplied, and misses intraday position changes.</p><p>Charts round strikes to the nearest $1, $2 or $5 bucket. Exact-strike walls are computed before bucketing. The first seven expiries have individual heatmap columns; Later combines the rest. Intensity rescales to the visible cells.</p></section><section><h3>Flip, regime and levels</h3><p>The flip is an approximation: reprice each option over ±20% of spot with constant IV/OI and a Black–Scholes gamma ratio anchored to its published gamma. Rates and dividends are assumed zero because the snapshot supplies neither. Expiry is 16:00 ET, with a one-minute time floor; early closes and American exercise are not modeled. A finite price grid finds and refines sign crossings; very narrow crossings can be missed. All detected crossings are retained and the nearest is shown first. No crossing means none found in that range, not none exists.</p><p>Regime uses the selected book's modeled net sign at spot, never position relative to a single flip. Near zero means |net| / gross &lt; 3%. Walls are the largest individual call/put exposure within ±10% of spot and can lie on either side. Market Read picks the nearest concentration above/below spot with at least 20% of the largest nearby gross strike exposure. Largest expiry is ranked by gross, with signed net reported separately.</p><p>Calls-positive / puts-negative is a positioning heuristic, not observed dealer inventory. Levels do not guarantee support/resistance, predict direction or provide buy/sell signals.</p></section><section><h3>Source and freshness</h3><p><a href="https://www.cboe.com/delayed_quotes/qqq/quote_table/" target="_blank" rel="noopener noreferrer">Cboe delayed QQQ chain ↗</a>. Quotes are approximately 15 minutes delayed before capture. Target captures: 10:00, 12:30 and 15:15 New York time on weekdays; scheduled runs can be delayed. Check for update reloads the published snapshot.</p><p>Quote time is the underlying's last trade; chain time is the provider's generation time. Capture time is our retrieval. A new capture does not make an old quote current. During regular weekday hours, source/capture age over four hours is flagged; outside hours the limit is four days. This heuristic has no exchange-holiday calendar.</p><p>These are QQQ dollar levels, with no NDX/NQ conversion. IV, OI and exposure can change between snapshots.</p></section></div></details>`, '/gex');
startClock();

function status(failed = updateFailed) {
  updateFailed = failed;
  const el = document.querySelector('#gex-status')!;
  if (!snapshot) { el.textContent = 'Snapshot unavailable. Try checking for an update shortly.'; el.classList.add('is-stale'); return; }
  const f = freshness(snapshot);
  el.classList.toggle('is-stale', failed || f.stale);
  el.innerHTML = `<span class="gex-status-label">${failed ? 'UPDATE CHECK FAILED · LAST SAVED SNAPSHOT' : f.label}</span><span>Quote ${stamp(snapshot.quoteAsOf)}</span><span>Chain ${stamp(snapshot.chainAsOf)}</span><span>Captured ${stamp(snapshot.retrievedAt)}</span>`;
  const read = document.querySelector('#gex-read-freshness');
  if (read) read.textContent = snapshotNote();
}
function snapshotNote() {
  return updateFailed ? 'Update check failed. Context uses the last saved snapshot.' : snapshot && freshness(snapshot).stale ? 'Data is older than the capture schedule. Context describes the saved snapshot, not current positioning.' : 'Snapshot context only. Daily open interest can lag current positioning.';
}
function metric(label: string, value: string, detail: string, color = '') {
  return `<div class="gex-metric ${color}"><span>${label}</span><strong>${value}</strong><small>${detail}</small></div>`;
}
function render() {
  if (!snapshot || !book) return;
  const s = snapshot, b = book;
  const content = document.querySelector('#gex-content')!;
  content.setAttribute('aria-busy', 'false');
  if (!b.contracts.length) { content.innerHTML = '<div class="gex-empty">No usable option series in this expiry window. Choose a longer window.</div>'; return; }
  const regime = b.regime === 'Balanced' ? 'Near zero' : b.regime;
  content.innerHTML = `<div class="gex-metrics">
${metric('QQQ SPOT', '$' + price(s.spot), `${s.spot >= s.previousClose ? '+' : '−'}${(Math.abs(s.spot / s.previousClose - 1) * 100).toFixed(2)}% vs previous close`, 'gex-spot')}
${metric('NET GEX / 1% MOVE', money(b.net, true), `${regime} modeled gamma`, b.regime === 'Balanced' ? '' : b.net >= 0 ? 'gex-positive' : 'gex-negative')}
${metric('CALL WALL', b.callWall ? '$' + price(b.callWall.strike) : '—', b.callWall ? distance(b.callWall.strike, s.spot) : 'No call exposure within ±10%', 'gex-positive')}
${metric('PUT WALL', b.putWall ? '$' + price(b.putWall.strike) : '—', b.putWall ? distance(b.putWall.strike, s.spot) : 'No put exposure within ±10%', 'gex-negative')}
${metric('NEAREST GAMMA FLIP', b.flips.length ? '$' + price(b.flips[0]) : 'No crossing', b.flips.length ? `${distance(b.flips[0], s.spot)}${b.flips.length > 1 ? ` · ${b.flips.length} crossings` : ''}` : 'None found within ±20% of spot', 'gex-flip')}
</div>
<section class="intel-panel gex-map-panel" aria-label="Gamma exposure map">
<div class="intel-panel-title"><h2>Gamma exposure</h2><span class="panel-meta">${b.contracts.length.toLocaleString('en-US')} OPTION SERIES · NEXT ${horizon} DAYS</span></div>
<div class="gex-chart-toolbar"><div class="gex-segments" role="group" aria-label="Chart view"><button data-view="heatmap" aria-pressed="${view === 'heatmap'}">Heatmap</button><button data-view="walls" aria-pressed="${view === 'walls'}">Walls</button><button data-view="profile" aria-pressed="${view === 'profile'}">By strike</button></div><label class="gex-range-label">Spot range <select id="gex-range" aria-label="Strike range">${view === 'walls' ? `<option value="levels" ${wallsRange === 'levels' ? 'selected' : ''}>Fit key levels</option>` : ''}${[.02,.04,.08].map(v => `<option value="${v}" ${v === (view === 'walls' ? wallsRange : range) ? 'selected' : ''}>±${v*100}%</option>`).join('')}</select></label></div>
<div class="gex-chart-key">${view !== 'heatmap' ? '<span><i class="gex-key-call"></i> CALLS + / LEFT</span><span><i class="gex-key-put"></i> PUTS − / RIGHT</span>' : '<span><i class="gex-key-positive"></i> POSITIVE NET</span><span><i class="gex-key-negative"></i> NEGATIVE NET</span>'}<span>DOLLARS PER 1% MOVE</span></div>
<div id="gex-chart"></div><div class="gex-inspector" id="gex-inspector" aria-live="polite"></div>
</section>
${marketRead(b, s)}
<div class="gex-book-summary"><span>Calls <b class="gex-positive">${money(b.call)}</b></span><span>Puts <b class="gex-negative">${money(b.put)}</b></span><span>Gross <b>${money(b.gross)}</b></span><span>|Net| / gross <b>${(Math.abs(b.net) / b.gross * 100).toFixed(1)}%</b></span><span>Open interest <b>${b.contracts.reduce((sum, c) => sum + c.oi, 0).toLocaleString('en-US')} contracts</b></span></div>
<p class="gex-bottom-note">All metrics use the full selected ${horizon}-day expiry book. Chart range only changes the view. Calls-positive / puts-negative estimates positioning, not observed dealer inventory.</p>`;
  renderChart();
}
function marketRead(b: Book, s: Snapshot) {
  const up = b.upside[0], down = b.downside[0], largest = b.largestExpiry;
  const regime = b.regime === 'Balanced' ? 'Near zero gamma' : `${b.regime} gamma`;
  const context = b.regime === 'Positive' ? 'Modeled gamma may dampen moves. Watch for rejection at concentrations; sustained acceptance beyond a level weakens the mean-reversion case.'
    : b.regime === 'Negative' ? 'Modeled gamma may amplify moves in either direction. Watch for sustained acceptance through the nearest concentration; a wall alone does not establish support or resistance.'
    : 'The selected book is near a gamma transition. Small changes in price, IV or open interest may change the modeled sign.';
  const concentration = (r: Book['levels'][number] | undefined) => r ? `<strong>$${price(r.strike)}</strong><small>${money(r.gross)} gross · ${money(r.net, true)} net</small>` : '<strong>None identified</strong><small>Within ±10% of spot</small>';
  return `<section class="gex-market-read intel-panel" aria-label="Market Read"><div class="intel-panel-title"><h2>Market Read</h2><span class="gex-regime-tag ${b.regime === 'Balanced' ? '' : b.net > 0 ? 'gex-positive' : 'gex-negative'}">${regime}</span></div>
<div class="gex-context-grid"><div><span>NEAREST MAJOR UPSIDE</span>${concentration(up)}</div><div><span>NEAREST MAJOR DOWNSIDE</span>${concentration(down)}</div><div><span>NEAREST GAMMA FLIP</span><strong class="gex-flip">${b.flips.length ? '$' + price(b.flips[0]) : 'No crossing'}</strong><small>${b.flips.length ? `${distance(b.flips[0], s.spot)}${b.flips.length > 1 ? ` · ${b.flips.length} crossings in scan` : ''}` : 'None found within ±20% of spot'}</small></div><div><span>LARGEST GAMMA EXPIRY</span><strong>${largest ? shortDate(largest.expiry) : '—'}</strong><small>${largest ? `${(largest.gross / b.gross * 100).toFixed(1)}% of gross · ${money(largest.gross)} gross · ${money(largest.net, true)} net` : 'No exposure'}</small></div></div>
<p class="gex-context-copy">${context}${b.regime === 'Negative' && down && b.downside[1] ? ` Below $${price(down.strike)}, the next major concentration is $${price(b.downside[1].strike)}.` : ''}</p>
<p class="gex-session-note">Session open $${price(s.open)} · Reported range $${price(s.low)} to $${price(s.high)} · ${s.spot >= s.open ? '+' : '−'}${(Math.abs(s.spot / s.open - 1) * 100).toFixed(2)}% from open</p>
<p id="gex-read-freshness">${snapshotNote()}</p></section>`;
}
function fitWallsChart() {
  const svg = document.querySelector<SVGElement>('.gex-walls');
  if (!svg) return;
  const compact = svg.parentElement!.clientWidth < 560;
  svg.classList.toggle('is-compact', compact);
  svg.setAttribute('viewBox', compact ? '0 0 670 610' : '0 0 846 610');
}
window.addEventListener('resize', fitWallsChart);
function renderChart() {
  if (!snapshot || !book) return;
  const s = snapshot, b = book;
  if (view === 'walls') {
    document.querySelector('#gex-chart')!.innerHTML = wallsChart(s, b, wallsRange);
    fitWallsChart();
    document.querySelector('#gex-inspector')!.textContent = 'Hover, focus or select a strike for call, put and net exposure. Dashed lines show exact prices; labels move apart when levels are close.';
    return;
  }
  step = range === .02 ? 1 : range === .04 ? 2 : 5;
  const center = Math.round(s.spot / step) * step;
  const count = Math.ceil(s.spot * range / step);
  const strikes = Array.from({length: count * 2 + 1}, (_,i) => center + (count-i)*step);
  const spotRow = center;
  const bucket = (value: number | undefined) => value === undefined ? null : Math.round(value / step) * step;
  const labels = (strike: number) => [[strike === spotRow, 'SPOT ≈', 'spot'], [bucket(b.callWall?.strike) === strike, 'CALL WALL', 'positive'], [bucket(b.putWall?.strike) === strike, 'PUT WALL', 'negative'], [b.flips.some(f => bucket(f) === strike), 'FLIP ≈', 'flip']].filter(([show]) => show).map(([, label, color]) => `<small class="gex-${color}">${label}</small>`).join('');
  const levelStrip = `<div class="gex-level-strip"><span class="gex-spot">Spot $${price(s.spot)}</span>${b.flips.map((f, i) => `<span class="gex-flip">${i === 0 ? 'Nearest flip' : 'Flip'} $${price(f)}${!strikes.includes(bucket(f)!) ? ' · outside view' : ''}</span>`).join('')}${!b.flips.length ? '<span>No flip found within ±20%</span>' : ''}</div>`;
  if (view === 'profile') {
    const levels = aggregate(b.contracts,s.spot,step);
    const max = Math.max(...levels.filter(r=>strikes.includes(r.strike)).flatMap(r=>[r.call,r.put]),1);
    document.querySelector('#gex-chart')!.innerHTML = `${levelStrip}<div class="gex-profile" role="group" aria-label="Call and put exposure by strike"><div class="gex-profile-head"><span>STRIKE</span><span>← CALLS +</span><span>PUTS − →</span><span>NET</span></div>${strikes.map(strike => { const r = levels.find(r=>r.strike===strike) ?? {call:0,put:0,net:0}; return `<div class="gex-profile-row ${strike === spotRow ? 'gex-spot-row' : ''}" tabindex="0" role="button" data-wall-strike="${strike}" data-wall-call="${r.call}" data-wall-put="${r.put}" data-wall-net="${r.net}" aria-label="$${price(strike)} bucket. Calls ${money(r.call)}, puts ${money(r.put)}, net ${money(r.net,true)}"><span>${price(strike)}${labels(strike)}</span><div class="gex-call-bar"><i style="width:${r.call/max*100}%"></i></div><div class="gex-put-bar"><i style="width:${r.put/max*100}%"></i></div><span class="${r.net>=0?'gex-positive':'gex-negative'}">${money(r.net,true)}</span></div>`; }).join('')}<div class="gex-profile-scale"><span>+${money(max)}</span><span>0</span><span>−${money(max)}</span></div></div>`;
    document.querySelector('#gex-inspector')!.textContent = `Call and put exposure by strike · $${step} buckets · each side uses the same dollar scale.`;
    return;
  }
  const expiries = [...new Set(b.contracts.map(c=>c.expiry))].sort();
  const groups = expiries.slice(0,7).map(expiry=>({label:shortDate(expiry),expiries:[expiry]}));
  if (expiries.length > 7) groups.push({label:`Later (${expiries.length-7})`,expiries:expiries.slice(7)});
  const cells = groups.map(g=>aggregate(b.contracts.filter(c=>g.expiries.includes(c.expiry)),s.spot,step));
  const max = Math.max(...cells.flat().filter(r=>strikes.includes(r.strike)).map(r=>Math.abs(r.net)),1);
  const id = ++renderId;
  document.querySelector('#gex-chart')!.innerHTML = `${levelStrip}<div class="gex-heatmap-scroll" tabindex="0" role="region" aria-label="Scrollable gamma heatmap"><table class="gex-heatmap"><caption class="sr-only">Net gamma exposure by strike bucket and expiry. All values per 1% QQQ move. Select a cell for exact call, put and net values.</caption><thead><tr><th scope="col">STRIKE ↓ / EXPIRY →</th>${groups.map(g=>`<th scope="col">${e(g.label)}</th>`).join('')}</tr></thead><tbody>${strikes.map(strike=>`<tr class="${strike===spotRow?'gex-spot-row':''}"><th scope="row">${price(strike)}${labels(strike)}</th>${groups.map((g,i)=>{const r=cells[i].find(r=>r.strike===strike); const n=r?.net??0;const strength = Math.pow(Math.abs(n)/max,.55);const bg = Math.abs(n)<1 ? '#111112' : n>0 ? `rgba(0,230,118,${.08+strength*.8})` : `rgba(255,51,85,${.08+strength*.8})`;return `<td><button data-cell="${id}:${strike}:${i}" style="background:${bg};color:${strength>.6?'#080808':'#eee8dd'}" aria-label="$${price(strike)} bucket, ${e(g.label)}, net ${money(n,true)}">${Math.abs(n)>=10e6?money(n,true).replace('$',''):Math.abs(n)>=1e6?(n>0?'+':'−')+(Math.abs(n)/1e6).toFixed(0)+'M':'·'}</button></td>`;}).join('')}</tr>`).join('')}</tbody></table></div><div class="gex-heatmap-scale"><span>$${step} STRIKE BUCKETS · ${groups.length>7?'LATER = REMAINING EXPIRIES':'ALL EXPIRIES SHOWN'}</span><div><span>+${money(max)}</span><i></i><span>−${money(max)}</span></div></div>`;
  document.querySelector('#gex-inspector')!.textContent = 'Select a cell to inspect exposure. The spot marker uses the nearest strike bucket.';
  document.querySelectorAll<HTMLButtonElement>('[data-cell]').forEach(button => button.addEventListener('click',()=>{
    const [,strike,index] = button.dataset.cell!.split(':').map(Number);
    const r = cells[index].find(r=>r.strike===strike);
    document.querySelectorAll('[data-cell][aria-pressed]').forEach(el=>el.removeAttribute('aria-pressed'));
    button.setAttribute('aria-pressed','true');
    const g = groups[index];
    document.querySelector('#gex-inspector')!.innerHTML = `<b>$${price(strike)} bucket · ${e(g.expiries.length===1?shortDate(g.expiries[0]):`${shortDate(g.expiries[0])} – ${shortDate(g.expiries.at(-1)!)}`)}</b><span>Calls ${money(r?.call??0)} / Puts ${money(r?.put??0)} / <strong>Net ${money(r?.net??0,true)}</strong></span>`;
  }));
}
async function load() {
  if (loading) return;
  loading = true;
  const button = document.querySelector<HTMLButtonElement>('#reload-gex')!;
  button.disabled = true;
  try {
    const response = await fetch('/data/gex/current.json', { cache:'no-cache', signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error('Snapshot unavailable');
    const next = snapshotSchema.parse(await response.json());
    if (+new Date(next.retrievedAt)>Date.now()+5*60_000) throw new Error('Invalid snapshot time');
    if (Math.max(+new Date(next.chainAsOf), +new Date(next.quoteAsOf)) > Date.now() + 5 * 60_000) throw new Error('Invalid source time');
    if (snapshot && next.chainAsOf < snapshot.chainAsOf) throw new Error('Snapshot regressed');
    snapshot = next; book = analyze(next,horizon); status(false); render();
  } catch {
    status(true);
    if (!snapshot) {
      document.querySelector('#gex-content')!.innerHTML = `<div class="gex-empty"><span class="control-label">NO SNAPSHOT AVAILABLE</span><h2>The map is waiting for data.</h2><p>We couldn't load a valid options snapshot. Check again shortly; modeled levels will appear when the data is available.</p></div>`;
      document.querySelector('#gex-content')!.setAttribute('aria-busy','false');
    }
  } finally { loading=false; button.disabled=false; }
}
document.addEventListener('click',event=>{
  const target = event.target as Element;
  if (target.closest('a[href="#methodology"]')) document.querySelector<HTMLDetailsElement>('#methodology')!.open = true;
  const h = target.closest<HTMLButtonElement>('[data-horizon]');
  if(h && snapshot) { horizon=Number(h.dataset.horizon); document.querySelectorAll<HTMLElement>('[data-horizon]').forEach(el=>el.setAttribute('aria-pressed',String(Number(el.dataset.horizon)===horizon))); book=analyze(snapshot,horizon); render(); }
  const v=target.closest<HTMLButtonElement>('[data-view]');
  if(v) { view=v.dataset.view!; render(); document.querySelector<HTMLButtonElement>(`[data-view="${view}"]`)?.focus({preventScroll:true}); }
});
document.addEventListener('change',event=>{
  const target=event.target as HTMLSelectElement;
  if(target.id==='gex-range') {
    if(view === 'walls') wallsRange = target.value === 'levels' ? 'levels' : Number(target.value);
    else range=Number(target.value);
    renderChart();
  }
});
function inspectWall(target: EventTarget | null) {
  if (!(target instanceof Element)) return;
  const row = target.closest<SVGElement>('[data-wall-strike]');
  if (!row) return;
  const d = row.dataset;
  document.querySelector('#gex-inspector')!.innerHTML = `<b>$${price(Number(d.wallStrike))} strike bucket</b><span>Calls ${exposureLabel(Number(d.wallCall))} / Puts ${exposureLabel(Number(d.wallPut))} / <strong>Net ${exposureLabel(Number(d.wallNet),true)}</strong></span>`;
  document.querySelectorAll('[data-wall-strike][aria-pressed]').forEach(el=>el.removeAttribute('aria-pressed'));
  row.setAttribute('aria-pressed','true');
}
const chartRoot = document.querySelector('#gex-content')!;
chartRoot.addEventListener('pointerover',event=>inspectWall(event.target));
chartRoot.addEventListener('focusin',event=>inspectWall(event.target));
chartRoot.addEventListener('click',event=>inspectWall(event.target));
chartRoot.addEventListener('keydown',event=>{
  const keyEvent = event as KeyboardEvent;
  if (keyEvent.target instanceof Element && keyEvent.target.closest('[data-wall-strike]') && ['Enter',' '].includes(keyEvent.key)) {
    keyEvent.preventDefault(); inspectWall(keyEvent.target);
  }
});
document.querySelector('#reload-gex')!.addEventListener('click',()=>void load());
setInterval(()=>{if(snapshot) status();},60_000);
void load();
