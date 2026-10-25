import '../styles.css';
import './labs.css';
import './gex.css';
import { wallsChart, exposureLabel, type WallsRange } from '../components/gex-walls';
import { pageShell, startClock, panelTitle, icon } from './shared';
import { escape as e } from '../lib/format';
import { snapshotSchema, analyze, aggregate, type Snapshot, type Book } from '../lib/gex/model';

const money = (n: number, signed = false) => `${signed && n > 0 ? '+' : n < 0 ? '−' : ''}$${Math.abs(n) >= 1e9 ? (Math.abs(n) / 1e9).toFixed(2) + 'B' : (Math.abs(n) / 1e6).toFixed(1) + 'M'}`;
const price = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const shortDate = (iso: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
const stamp = (iso: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/New_York' }).format(new Date(iso)) + ' ET';
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

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = pageShell('GAMMA MAP · NASDAQ', `
<section class="gex-intro"><div><div class="lab-kicker"><span class="status-dot"></span> THE POSITIONING DESK <span class="early-tag">EARLY ACCESS</span></div><h1>Nasdaq.<br><span>Under the surface.</span></h1><p>Map the options positioning behind the move.<br>Gamma concentrations. Key levels. A clearer read on price.</p></div><div class="gex-identity"><span class="gex-symbol">QQQ <small>NASDAQ-100 ETF</small></span><p>One market. One focused map.</p><a href="#methodology">How to read this ${icon('arrow')}</a></div></section>
<div class="gex-status" role="status" id="gex-status">Loading the latest published snapshot…</div>
<div class="gex-controls"><div class="gex-book-controls"><span class="control-label">EXPIRY WINDOW</span><div class="gex-segments" role="group" aria-label="Expiry window">${[7,30,90].map(d => `<button data-horizon="${d}" aria-pressed="${d === horizon}">Next ${d} days</button>`).join('')}</div></div><button id="reload-gex" class="gex-reload">${icon('clock')} Check for update</button></div>
<div id="gex-content" aria-busy="true"><div class="gex-loading">Reading the latest options chain…</div></div>
<details id="methodology" class="gex-method"><summary>THE MODEL, WITHOUT THE MYSTERY <span>Methodology & sources +</span></summary><div class="gex-method-grid"><section><h3>What the colours mean</h3><p>Amber: positive net exposure. Violet: negative net exposure. Intensity shows magnitude on a shared scale for the visible cells. Each cell combines calls (+) and puts (−) at a strike bucket and expiry. Values are dollars of delta exposure change for a 1% move in QQQ.</p><p>GEX = gamma × open interest × 100 shares × spot² × 0.01. Open interest is a daily measure; it does not capture today's opening and closing trades.</p></section><section><h3>Estimates, with boundaries</h3><p>Calls-positive / puts-negative is a positioning convention, not a measurement of dealer inventory. Positive gamma can be consistent with dampened moves; negative gamma can be consistent with amplification. Neither predicts direction.</p><p>The nearest gamma flip reprices the selected book over ±20% of spot, holding IV and open interest fixed. Gamma is anchored to the source at spot with a Black–Scholes ratio and zero carry. No crossing means no flip is reported. Walls are the largest call and put exposures within ±10% of spot, not guaranteed support or resistance.</p></section><section><h3>Snapshots, not a live feed</h3><p>Source: <a href="https://www.cboe.com/delayed_quotes/qqq/quote_table/" target="_blank" rel="noopener noreferrer">Cboe delayed QQQ chain ↗</a>. Quotes are approximately 15 minutes delayed before our scheduled capture. Target updates: 10:00, 12:30 and 15:15 New York time, weekdays. Scheduled runs can be delayed. Quote time and chain time are shown separately.</p><p>QQQ is a Nasdaq-100 ETF proxy. These are QQQ dollar levels, not NDX or NQ futures levels. Prices, IV and exposure can change between captures. Educational market context; no tested entries, stops or performance claims.</p></section></div></details>`, '/gex');
startClock();

function freshness(s: Snapshot) {
  const now = Date.now(), age = now - +new Date(s.retrievedAt);
  const local = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now));
  const part = (type: string) => local.find(p => p.type === type)?.value ?? '';
  const minutes = Number(part('hour')) * 60 + Number(part('minute'));
  const session = !['Sat','Sun'].includes(part('weekday')) && minutes >= 570 && minutes < 960;
  const oldQuote = now - +new Date(s.quoteAsOf) > 4 * 3600_000;
  if (age > 4 * 86400_000 || (session && (age > 4 * 3600_000 || oldQuote))) return { label: 'STALE SNAPSHOT', stale: true };
  return { label: session ? 'SCHEDULED SNAPSHOT' : 'OUTSIDE REGULAR HOURS', stale: false };
}
function status(failed = false) {
  const el = document.querySelector('#gex-status')!;
  if (!snapshot) { el.textContent = 'Snapshot unavailable. Try checking for an update shortly.'; el.classList.add('is-stale'); return; }
  const f = freshness(snapshot);
  el.classList.toggle('is-stale', f.stale || failed);
  el.innerHTML = `<span class="gex-status-label">${failed ? 'UPDATE CHECK FAILED · LAST SAVED SNAPSHOT' : f.label}</span><span>Quote ${e(stamp(snapshot.quoteAsOf))}</span><span>Chain ${e(stamp(snapshot.chainAsOf))}</span><span>Captured ${e(stamp(snapshot.retrievedAt))} · delayed data</span>`;
}
function metric(label: string, value: string, detail: string, color = '') {
  return `<div class="gex-metric ${color}"><span>${label}</span><strong>${value}</strong><small>${detail}</small></div>`;
}
function render() {
  if (!snapshot || !book) return;
  const s = snapshot, b = book;
  const content = document.querySelector('#gex-content')!;
  content.setAttribute('aria-busy', 'false');
  if (!b.contracts.length) { content.innerHTML = '<div class="gex-empty">No usable contracts in this expiry window. Choose a longer window.</div>'; return; }
  content.innerHTML = `<div class="gex-metrics">
${metric('QQQ SNAPSHOT SPOT', '$' + price(s.spot), `${((s.spot / s.previousClose - 1) * 100).toFixed(2)}% vs previous close`)}
${metric('NET GAMMA / 1% MOVE', money(b.net, true), `${b.regime} modeled gamma`, b.net >= 0 ? 'gex-positive' : 'gex-negative')}
${metric('CALL WALL', b.callWall ? '$' + price(b.callWall.strike) : '—', b.callWall ? distance(b.callWall.strike, s.spot) : 'No call exposure in range', 'gex-positive')}
${metric('PUT WALL', b.putWall ? '$' + price(b.putWall.strike) : '—', b.putWall ? distance(b.putWall.strike, s.spot) : 'No put exposure in range', 'gex-negative')}
${metric('NEAREST GAMMA FLIP', b.flips.length ? '$' + price(b.flips[0]) : 'No crossing', b.flips.length ? `${distance(b.flips[0], s.spot)}${b.flips.length > 1 ? ' · multiple flips' : ''}` : 'None found within ±20% of spot')}
</div>
<div class="gex-main-grid"><section class="intel-panel gex-map-panel" aria-label="Gamma exposure map">${panelTitle('01', 'The gamma map', `${b.contracts.length.toLocaleString()} CONTRACTS · NEXT ${horizon} DAYS`)}<div class="gex-chart-toolbar"><div class="gex-segments" role="group" aria-label="Chart view"><button data-view="heatmap" aria-pressed="${view === 'heatmap'}">Heatmap</button><button data-view="walls" aria-pressed="${view === 'walls'}">Walls</button><button data-view="profile" aria-pressed="${view === 'profile'}">By strike</button></div><label class="gex-range-label">Spot range <select id="gex-range" aria-label="Strike range">${view === 'walls' ? `<option value="levels" ${wallsRange === 'levels' ? 'selected' : ''}>Fit key levels</option>` : ''}${[.02,.04,.08].map(v => `<option value="${v}" ${v === (view === 'walls' ? wallsRange : range) ? 'selected' : ''}>±${v*100}%</option>`).join('')}</select></label></div><div class="gex-chart-key"><span><i class="gex-key-negative"></i> PUTS − / NEGATIVE NET</span><span><i class="gex-key-positive"></i> CALLS + / POSITIVE NET</span><span>PER 1% MOVE</span></div><div id="gex-chart"></div><div class="gex-inspector" id="gex-inspector" aria-live="polite">Select a cell to inspect exposure. The spot marker uses the nearest strike bucket.</div></section>
<aside class="gex-read intel-panel">${panelTitle('02', 'The Atlas read', 'MODELED CONTEXT')}<div class="gex-regime ${b.regime === 'Negative' ? 'gex-negative' : 'gex-positive'}"><span>${b.regime.toUpperCase()} GAMMA</span><h2>${b.regime === 'Positive' ? 'A tendency to<br>absorb the move.' : b.regime === 'Negative' ? 'More room for<br>moves to travel.' : 'A finely balanced<br>options book.'}</h2><p>${b.regime === 'Positive' ? 'Under the sign convention, hedging may lean against price moves. Watch for rejection around concentrated levels.' : b.regime === 'Negative' ? 'Under the sign convention, hedging may reinforce price moves. A break can extend; a wall alone is no reason to fade it.' : 'Calls and puts largely offset. Small changes in spot or positioning could change the modeled sign.'}</p></div>
<ol class="gex-observations"><li><span>01 / THE PIVOT</span><p>${b.flips.length ? `The nearest modeled flip is <b>$${price(b.flips[0])}</b>, ${e(distance(b.flips[0], s.spot))}. A crossing changes the modeled regime; it is not a trade trigger.` : 'The model has no gamma crossing within ±20% of spot. There is no reliable flip level to display for this book.'}</p></li><li><span>02 / THE CONCENTRATION</span><p>${b.callWall && b.putWall ? `Largest nearby concentrations: calls at <b>$${price(b.callWall.strike)}</b> and puts at <b>$${price(b.putWall.strike)}</b>. ${s.spot >= Math.min(b.callWall.strike,b.putWall.strike) && s.spot <= Math.max(b.callWall.strike,b.putWall.strike) ? 'Spot sits between them.' : 'Spot is outside the two wall levels.'}` : 'Nearby concentrations are limited in this window.'}</p></li><li><span>03 / WHAT CAN CHANGE</span><p><b>${(b.expiryShare*100).toFixed(1)}%</b> of gross exposure expires ${b.nearestExpiry ? e(shortDate(b.nearestExpiry)) : 'next'}. Expiry, fresh open interest and a change in IV can redraw this map.</p></li></ol><div class="gex-balance"><div><span>CALLS ${money(b.call)}</span><span>PUTS ${money(b.put)}</span></div><div class="gex-balance-track"><i style="width:${b.call / b.gross * 100}%"></i></div><small>Gross ${money(b.gross)} · net / gross ${(Math.abs(b.net) / b.gross * 100).toFixed(1)}%</small></div></aside></div>
<div class="gex-lower"><section class="intel-panel gex-session">${panelTitle('03', 'Price, in context', e(stamp(s.quoteAsOf)))}<div class="gex-session-inner"><div><span class="control-label">FROM SESSION OPEN</span><strong class="${s.spot >= s.open ? 'positive-text' : 'negative-text'}">${s.spot >= s.open ? '+' : '−'}${(Math.abs(s.spot / s.open - 1)*100).toFixed(2)}%</strong><p>${s.spot >= s.open ? 'Above' : 'Below'} the $${price(s.open)} open. ${s.high > s.low ? `${Math.round((s.spot-s.low)/(s.high-s.low)*100)}% of the way up the reported session range.` : 'No session range available.'}</p></div><div class="gex-session-range"><span class="control-label">REPORTED SESSION RANGE</span><div class="gex-price-track"><i style="left:${Math.max(0,Math.min(100,(s.spot-s.low)/(s.high-s.low || 1)*100))}%"><span>$${price(s.spot)}</span></i></div><div class="gex-price-labels"><span>LOW $${price(s.low)}</span><span>HIGH $${price(s.high)}</span></div><p>A range snapshot, not an intraday chart. Confirm rejection or acceptance on your price chart.</p></div></div></section><section class="intel-panel gex-watch">${panelTitle('04', 'Levels to watch', 'CONDITIONAL, NOT SIGNALS')}<div class="gex-watch-inner">${watchLevels(b,s)}</div></section></div>
<p class="gex-bottom-note">QQQ levels only · All metrics use the selected ${horizon}-day book across all strikes. The chart shows a narrower range. Exposure is an estimate, not observed dealer inventory.</p>`;
  renderChart();
}
function watchLevels(b: Book, s: Snapshot) {
  const above = b.levels.filter(r => r.strike > s.spot && r.strike <= s.spot * 1.1).sort((a,b) => b.gross-a.gross)[0];
  const below = b.levels.filter(r => r.strike < s.spot && r.strike >= s.spot * .9).sort((a,b) => b.gross-a.gross)[0];
  return [above, below].map((r,i) => r ? `<div class="gex-watch-row"><span class="gex-watch-price">$${price(r.strike)}<small>${i === 0 ? 'ABOVE' : 'BELOW'} SPOT</small></span><p><b>${i === 0 ? 'If price pushes higher' : 'If price moves lower'}</b>${b.regime === 'Positive' ? 'Watch whether price rejects this concentration or holds beyond it. Acceptance weakens the local pinning idea.' : 'Watch for acceptance through this concentration. Negative gamma can amplify movement in either direction.'}<small>${money(r.gross)} gross exposure · ${money(r.net, true)} net</small></p></div>` : '').join('');
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
  const labels = (strike: number) => [strike === spotRow ? 'SPOT ≈' : '', bucket(b.callWall?.strike) === strike ? 'CALL WALL' : '', bucket(b.putWall?.strike) === strike ? 'PUT WALL' : '', bucket(b.flips[0]) === strike ? 'FLIP ≈' : ''].filter(Boolean).map(label => `<small>${label}</small>`).join('');
  if (view === 'profile') {
    const levels = aggregate(b.contracts,s.spot,step);
    const max = Math.max(...levels.filter(r=>strikes.includes(r.strike)).flatMap(r=>[r.call,r.put]),1);
    document.querySelector('#gex-chart')!.innerHTML = `<div class="gex-profile"><div class="gex-profile-head"><span>STRIKE</span><span>PUT EXPOSURE</span><span>CALL EXPOSURE</span><span>NET</span></div>${strikes.map(strike => { const r = levels.find(r=>r.strike===strike) ?? {call:0,put:0,net:0}; return `<div class="gex-profile-row ${strike === spotRow ? 'gex-spot-row' : ''}"><span>${price(strike)}${labels(strike)}</span><div class="gex-put-bar"><i style="width:${r.put/max*100}%"></i></div><div class="gex-call-bar"><i style="width:${r.call/max*100}%"></i></div><span class="${r.net>=0?'gex-positive':'gex-negative'}">${money(r.net,true)}</span></div>`; }).join('')}<div class="gex-profile-scale"><span>−${money(max)}</span><span>0</span><span>+${money(max)}</span></div></div>`;
    document.querySelector('#gex-inspector')!.textContent = `Call and put exposure by strike · $${step} buckets · each side uses the same dollar scale.`;
    return;
  }
  const expiries = [...new Set(b.contracts.map(c=>c.expiry))].sort();
  const groups = expiries.slice(0,7).map(expiry=>({label:shortDate(expiry),expiries:[expiry]}));
  if (expiries.length > 7) groups.push({label:`Later (${expiries.length-7})`,expiries:expiries.slice(7)});
  const cells = groups.map(g=>aggregate(b.contracts.filter(c=>g.expiries.includes(c.expiry)),s.spot,step));
  const max = Math.max(...cells.flat().filter(r=>strikes.includes(r.strike)).map(r=>Math.abs(r.net)),1);
  const id = ++renderId;
  document.querySelector('#gex-chart')!.innerHTML = `<div class="gex-heatmap-scroll" tabindex="0" role="region" aria-label="Scrollable gamma heatmap"><table class="gex-heatmap"><caption class="sr-only">Net gamma exposure by strike bucket and expiry. All values per 1% QQQ move. Select a cell for exact call, put and net values.</caption><thead><tr><th scope="col">STRIKE ↓ / EXPIRY →</th>${groups.map(g=>`<th scope="col">${e(g.label)}</th>`).join('')}</tr></thead><tbody>${strikes.map(strike=>`<tr class="${strike===spotRow?'gex-spot-row':''}"><th scope="row">${price(strike)}${labels(strike)}</th>${groups.map((g,i)=>{const r=cells[i].find(r=>r.strike===strike); const n=r?.net??0;const strength = Math.pow(Math.abs(n)/max,.55);const bg = Math.abs(n)<1 ? '#111112' : n>0 ? `rgba(255,153,10,${.08+strength*.8})` : `rgba(155,119,238,${.08+strength*.8})`;return `<td><button data-cell="${id}:${strike}:${i}" style="background:${bg};color:${strength>.6?'#080808':'#d8d0c0'}" aria-label="$${price(strike)} bucket, ${e(g.label)}, net ${money(n,true)}">${Math.abs(n)>=10e6?money(n,true).replace('$',''):Math.abs(n)>=1e6?(n/1e6).toFixed(0)+'M':'·'}</button></td>`;}).join('')}</tr>`).join('')}</tbody></table></div><div class="gex-heatmap-scale"><span>$${step} STRIKE BUCKETS · ${groups.length>7?'LATER = REMAINING EXPIRIES':'ALL EXPIRIES SHOWN'}</span><div><span>−${money(max)}</span><i></i><span>+${money(max)}</span></div></div>`;
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
    snapshot = next; book = analyze(next,horizon); status(); render();
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
