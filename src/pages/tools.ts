import '../styles.css';
import './labs.css';
import { pageShell, startClock, icon, blank } from './shared';
import { escape as e } from '../lib/format';
import { contracts, movePnl, simulatePosition, type Contract } from '../lib/global/calculator';

type Product = { id: string; name: string; category: string; format: string; status: string; description: string; features: string[]; note: string; url?: string; art: string; tags: string[] };
const products: Product[] = [
  { id: 'futures-calculator', name: 'Futures Position Calculator', category: 'Utilities', format: 'WEB TOOL', status: 'Free', description: 'Turn contracts and points into dollars. Size risk and simulate your next add or reduction.', features: ['Points / ticks to dollar P&L', 'Weighted average entry with adds and reductions', 'Target P&L, stop risk and risk-based sizing', 'MNQ, NQ, MES, ES, MGC, GC, MCL and CL'], note: 'Free to use here. No account required. Calculations exclude commissions and slippage.', art: 'calculator', tags: ['Futures', 'Risk', 'No signup'] },
  { id: 'market-regime', name: 'Market Regime HUD', category: 'Indicators', format: 'TRADINGVIEW', status: 'Invite-only', description: 'Trend, range, chop or transition. A compact terminal view of the market’s current regime.', features: ['Regime classification', 'EMA / VWAP context', 'ADX strength and ATR volatility', 'Compact and full display modes'], note: 'Published on TradingView as an invite-only script. Opening the listing does not grant access; pricing and access are still being finalized.', url: 'https://www.tradingview.com/script/xQLgC1fS-Mango-Atlas-Market-Regime-HUD/', art: 'regime', tags: ['Regime', 'VWAP', 'Pine'] },
  { id: 'prop-trader', name: 'Prop Trader OS', category: 'Templates', format: 'NOTION TEMPLATE', status: 'In development', description: 'Your evaluations, funded accounts, drawdown rules and payouts. One organized trading desk.', features: ['Firm and account databases', 'Daily / trailing drawdown tracking', 'Payout eligibility and history', 'Billing dates, rules and performance views'], note: 'Planned paid Notion template. Demo, download, marketplace link and pricing will be added when it is ready.', art: 'prop', tags: ['Prop firms', 'Accounts', 'Notion'] },
  { id: 'session-dashboard', name: 'Futures Session Dashboard', category: 'Indicators', format: 'TRADINGVIEW', status: 'Invite-only', description: 'The session at a glance. Overnight ranges, opening context and the levels that matter.', features: ['Overnight and prior-day levels', 'Asia, London and New York context', 'Opening range and VWAP distance', 'Compact session dashboard'], note: 'Published on TradingView as an invite-only script. Access and commercial availability are still being finalized.', url: 'https://www.tradingview.com/script/N0Gy9U5Q-Mango-Atlas-Futures-Session-Dashboard/', art: 'session', tags: ['Sessions', 'Futures', 'Context'] },
  { id: 'ai-fund', name: 'AI Fund Operations', category: 'Templates', format: 'NOTION TEMPLATE', status: 'In development', description: 'An operating system for your personal fund’s AI agents. Assign work, track routines and review outputs.', features: ['Agent roles and responsibilities', 'Tasks, routines and automation inventory', 'Human approval checkpoints', 'Logs, outputs and retry notes'], note: 'Also known as AI Agent Operations OS. Platform-independent Notion template in development; final download and pricing are not available yet.', art: 'agents', tags: ['AI agents', 'Operations', 'Notion'] },
  { id: 'order-flow', name: 'Order Flow / Footprint', category: 'Indicators', format: 'TRADINGVIEW', status: 'Prototype', description: 'An order-flow dashboard exploring volume delta, imbalance and auction context.', features: ['Buy / sell volume and delta', 'POC and value-area context', 'Row-level imbalance exploration', 'Session directional summary'], note: 'Research prototype. Pine footprint support, plan requirements and historical limitations are still being validated. No published listing yet.', art: 'footprint', tags: ['Order flow', 'Volume', 'Prototype'] },
  { id: 'atlas-stack', name: 'The Mango Atlas Stack', category: 'Resources', format: 'SOFTWARE DIRECTORY', status: 'In development', description: 'A practical directory of the trading, management and AI tools behind the desk.', features: ['Charting and execution software', 'Market data and research', 'Management and operations', 'AI and developer tooling'], note: 'The directory is being curated. Product selections, comparisons and affiliate links will be added later.', art: 'stack', tags: ['Software', 'Trading', 'AI'] },
];
function art(product: Product) {
  const content = ({
    calculator: '<div class="art-equation"><span>CONTRACTS × MOVE × VALUE</span><b>03 <i>×</i> 35 <i>×</i> $2</b><strong>$210<span>.00</span></strong><small>MNQ / BEFORE FEES</small></div>',
    regime: '<div class="art-hud"><span>MANGO ATLAS / REGIME</span><div><b>REGIME</b><i>CLASSIFICATION</i></div><div><b>STRENGTH</b><i>ADX / DIRECTION</i></div><div><b>CONTEXT</b><i>EMA + VWAP</i></div><div class="hud-bars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div>',
    prop: '<div class="art-notion"><div class="art-notion-sidebar"><i></i><i></i><i></i><i></i></div><div><span>PROP TRADER / OS</span><div class="art-notion-cards"><i></i><i></i><i></i></div><div class="art-table"><i></i><i></i><i></i><i></i></div></div></div>',
    session: '<div class="art-session"><span>SESSION CONTEXT</span><div><small>ASIA</small><i></i></div><div><small>LONDON</small><i></i></div><div><small>NEW YORK</small><i></i></div><span class="art-session-baseline">OVERNIGHT → OPENING RANGE → RTH</span></div>',
    agents: '<div class="art-agents"><span>AI FUND / OPERATIONS</span><div class="agent-network"><i>RESEARCH</i><i>HUMAN</i><i>RISK</i><i>EXECUTION</i><i>REVIEW</i></div></div>',
    footprint: '<div class="art-footprint"><span>ORDER FLOW / FOOTPRINT</span><div>' + [1,2,3,4,5,6,7].map((n) => `<i style="--w:${25 + ((n * 17) % 70)}%"></i><b style="--w:${25 + ((n * 31) % 70)}%"></b>`).join('') + '</div></div>',
    stack: '<div class="art-stack"><span>THE DESK / STACK</span><div><i>TRADING</i><i>DATA</i><i>AI</i><i>OPS</i></div></div>',
  } as Record<string, string>)[product.art];
  return `<div class="product-art visual-${product.art}" aria-hidden="true">${content}<span class="art-caption">${product.art === 'calculator' ? 'WORKING UTILITY' : 'INTERFACE CONCEPT'}</span></div>`;
}
const body = `<div class="lab-intro tools-intro"><div><div class="lab-kicker"><span class="status-dot"></span>MANGO ATLAS / TOOLS<span class="early-tag">EARLY ACCESS</span></div><h1>A sharper<br><span>trading desk.</span></h1><p>Purpose-built indicators, operating systems and utilities.<br>Less friction. More focus.</p></div><a class="featured-calculator" href="#calculator"><div class="featured-top"><span class="mono">THE EVERYDAY CALCULATION</span>${icon('arrow')}</div><div class="featured-equation"><span>3 MNQ</span><i>×</i><span>35 points</span></div><strong>$210<span>.00</span></strong><div class="featured-bottom"><span>Before fees · Free web tool</span><b>Try the calculator →</b></div></a></div>
<div class="toolkit-heading"><div><span class="mono">THE TOOLKIT / 01</span><h2>Built for the way you work.</h2></div><p>7 tools to start. An expanding toolkit.</p></div>
<div class="catalog-toolbar"><div class="lab-tabs" role="group" aria-label="Product category">${['All tools', 'Utilities', 'Indicators', 'Templates', 'Resources'].map((c,i) => `<button data-category="${c}" aria-pressed="${!i}">${c}<span>${c === 'All tools' ? products.length : products.filter(p => p.category === c).length}</span></button>`).join('')}</div><label class="catalog-search">${icon('radar')}<span class="sr-only">Search tools</span><input id="tool-search" type="search" placeholder="Find your next tool…" autocomplete="off"></label></div>
<div class="product-grid" id="product-grid"></div><p id="catalog-count" class="catalog-count mono" aria-live="polite"></p>
<section class="calculator-panel intel-panel" id="calculator" aria-labelledby="calc-title"><div class="calculator-heading"><div><span class="mono orange">UTILITY / 01 · FREE</span><h2 id="calc-title">Futures Position Calculator</h2><p>From “how much is that move?” to a clear plan.</p></div><span class="calculator-icon">${icon('activity')}</span></div><div class="calculator-layout"><div class="calculator-inputs"><div class="calc-mode lab-tabs" role="group" aria-label="Calculator mode"><button data-calc-mode="move" aria-pressed="true">Quick P&L</button><button data-calc-mode="position" aria-pressed="false">Position builder</button></div><form id="calc-form"><div class="calc-fields"><label>Contract<select name="symbol" id="calc-symbol">${Object.entries(contracts).map(([s,v]) => `<option value="${s}">${s} · ${v.name}</option>`).join('')}</select></label><label>Direction<select name="direction"><option value="1">Long</option><option value="-1">Short</option></select></label></div><div id="move-inputs" class="calc-fields"><label>Contracts<input name="quantity" type="number" min="1" max="100000" step="1" value="3" inputmode="numeric" required></label><label>Price move<input name="move" type="number" step="any" value="35" inputmode="decimal" required></label><label>Move units<select name="units"><option value="points">Points</option><option value="ticks">Ticks</option></select></label></div><div id="position-inputs" hidden><div class="calc-fields"><label>Current contracts<input name="current-quantity" type="number" min="1" max="100000" step="1" value="5" inputmode="numeric"></label><label>Current average entry<input name="entry" type="number" step="any" min="0.01" value="24500" inputmode="decimal"></label></div><div class="changes-heading"><span>Simulate adds / reductions</span><button type="button" id="add-leg">Add leg +</button></div><p class="input-hint">Positive contracts add. Negative contracts reduce, in the order entered.</p><div id="position-legs"><div class="calc-leg"><label>Change in contracts<input name="leg-quantity" type="number" step="1" value="3" inputmode="numeric"></label><label>Fill price<input name="leg-price" type="number" step="any" min="0.01" value="24420" inputmode="decimal"></label><button type="button" class="remove-leg" aria-label="Remove this leg">×</button></div></div><div class="calc-fields"><label>Target price<input name="target" type="number" step="any" min="0.01" value="24550" inputmode="decimal"></label><label>Stop price<input name="stop" type="number" step="any" min="0.01" value="24400" inputmode="decimal"></label><label>Risk budget ($)<input name="budget" type="number" step="any" min="0" value="500" inputmode="decimal"></label></div></div><p class="input-hint" id="calc-input-hint">A positive move means price rises. Choose Short for a short position.</p><button class="calc-submit" type="submit">Calculate ${icon('arrow')}</button></form><div class="contract-spec mono" id="contract-spec"></div></div><div class="calc-results" id="calc-results" aria-live="polite"></div></div><div class="data-footnote">Contract specifications: <a href="https://www.cmegroup.com/markets.html" target="_blank" rel="noopener noreferrer">CME Group ${icon('arrow')}</a> · USD results before commissions, slippage and exchange fees. Hypothetical calculations; no prices are fetched. Verify specifications for your contract.</div></section>
<div class="tools-endnote"><span>${icon('tools')}</span><div><h2>A toolkit in progress.</h2><p>Published indicators link to TradingView. Templates, order flow and the software directory are still being built. Availability and pricing will appear here as each product is ready.</p></div></div>
<dialog id="product-dialog" class="product-dialog" aria-labelledby="dialog-title"><button class="dialog-close" type="button" aria-label="Close product details">×</button><div id="dialog-content"></div></dialog>`;
document.querySelector('#app')!.innerHTML = pageShell('Tools', body);
startClock();
let category = 'All tools';
let search = '';
let mode: 'move' | 'position' = 'move';
function renderProducts() {
  const filtered = products.filter(p => (category === 'All tools' || p.category === category) && `${p.name} ${p.description} ${p.tags.join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  document.querySelector('#product-grid')!.innerHTML = filtered.length ? filtered.map((p, i) => `<article class="product-card" style="--card-delay:${i * 40}ms">${art(p)}<div class="product-copy"><div class="product-meta"><span class="mono">${p.format}</span><span class="product-status ${p.status === 'Free' ? 'free' : p.status === 'Invite-only' ? 'invite' : ''}">${p.status}</span></div><h3>${p.name}</h3><p>${p.description}</p><div class="product-tags">${p.tags.map(t => `<span>${t}</span>`).join('')}</div><div class="product-actions"><button data-details="${p.id}">View details ${icon('arrow')}</button>${p.url ? `<a href="${p.url}" target="_blank" rel="noopener noreferrer" aria-label="Open ${p.name} on TradingView">TradingView ${icon('arrow')}</a>` : p.id === 'futures-calculator' ? '<a href="#calculator">Open tool →</a>' : '<span>Coming soon</span>'}</div></div></article>`).join('') : blank('No tools match your search. Try another name or category.');
  document.querySelector('#catalog-count')!.textContent = `${filtered.length} / ${products.length} TOOLS`;
}
const dialog = document.querySelector<HTMLDialogElement>('#product-dialog')!;
function showDetails(id: string) {
  const p = products.find(p => p.id === id)!;
  document.querySelector('#dialog-content')!.innerHTML = `${art(p)}<div class="dialog-copy"><span class="mono orange">${p.format} / ${p.status.toUpperCase()}</span><h2 id="dialog-title">${p.name}</h2><p>${p.description}</p><ul>${p.features.map(f => `<li>${f}</li>`).join('')}</ul><p class="dialog-note">${p.note}</p>${p.url ? `<a class="product-cta" href="${p.url}" target="_blank" rel="noopener noreferrer">View on TradingView ${icon('arrow')}</a>` : p.id === 'futures-calculator' ? '<button class="product-cta" id="dialog-open-calculator">Open free calculator →</button>' : '<span class="coming-soon-label">In development · Release link coming soon</span>'}</div>`;
  dialog.showModal();
  document.querySelector('#dialog-open-calculator')?.addEventListener('click', () => { dialog.close(); document.querySelector('#calculator')!.scrollIntoView({ behavior: 'smooth' }); document.querySelector<HTMLSelectElement>('#calc-symbol')!.focus({ preventScroll: true }); });
}
document.querySelector('.dialog-close')!.addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
const usd = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Math.abs(n));
const money = (n: number) => `${n < 0 ? '−' : n > 0 ? '+' : ''}${usd(n)}`;
function calculate() {
  const form = document.querySelector<HTMLFormElement>('#calc-form')!;
  const data = new FormData(form);
  const symbol = data.get('symbol') as Contract;
  const direction = Number(data.get('direction')) as 1 | -1;
  const spec = contracts[symbol];
  document.querySelector('#contract-spec')!.textContent = `${symbol} / $${spec.point} PER POINT / ${spec.tick} TICK SIZE / $${spec.point * spec.tick} PER TICK`;
  const field = (name: string) => { const raw = data.get(name); if (typeof raw !== 'string' || !raw.trim() || !Number.isFinite(Number(raw))) throw new Error('Complete all calculation fields with valid numbers.'); return Number(raw); };
  const host = document.querySelector('#calc-results')!;
  try {
    if (mode === 'move') {
      const quantity = field('quantity'); const move = field('move');
      const result = movePnl(symbol, quantity, move, data.get('units') as 'points' | 'ticks', direction);
      const exactTicks = Math.abs(result.ticks - Math.round(result.ticks)) < 1e-7;
      host.innerHTML = `<span class="mono">ESTIMATED ${result.pnl < 0 ? 'LOSS' : 'P&L'} / USD</span><strong class="calc-pnl ${result.pnl < 0 ? 'loss' : ''}">${money(result.pnl)}</strong><p>${quantity} ${symbol} · ${direction === 1 ? 'Long' : 'Short'} · ${result.points} point price move</p><div class="calc-breakdown"><div><span>Point value / contract</span><b>${usd(spec.point)}</b></div><div><span>Tick value / contract</span><b>${usd(spec.point * spec.tick)}</b></div><div><span>Move in ticks</span><b>${Number(result.ticks.toFixed(6))}</b></div><div><span>Calculation</span><b>${quantity} × ${result.points} × $${spec.point}</b></div></div><div class="calc-result-note">${exactTicks ? 'Before commissions and slippage. Positive price moves profit on longs and lose on shorts.' : 'This hypothetical move is not a whole number of ticks. Actual fills use the contract tick size.'}</div>`;
    } else {
      const q = field('current-quantity'), entry = field('entry');
      const legQ = data.getAll('leg-quantity'); const legP = data.getAll('leg-price');
      const changes = legQ.flatMap((raw, i) => { if (!String(raw).trim()) throw new Error('Enter a quantity for each leg or remove it.'); const quantity = Number(raw); if (!quantity) return []; if (!String(legP[i]).trim()) throw new Error('Enter a fill price for each leg.'); return [{ quantity, price: Number(legP[i]) }]; });
      const result = simulatePosition(symbol, q, entry, changes, direction);
      const target = field('target'), stop = field('stop'), budget = field('budget');
      if (target <= 0 || stop <= 0 || budget < 0) throw new Error('Use positive target and stop prices, and a nonnegative risk budget.');
      const pnl = (target - result.average) * direction * result.quantity * spec.point;
      const stopPnl = (stop - result.average) * direction * result.quantity * spec.point;
      const riskPerContract = -(stop - result.average) * direction * spec.point;
      const size = riskPerContract > 0 ? Math.floor(budget / riskPerContract) : null;
      host.innerHTML = `<span class="mono">NEW AVERAGE ENTRY / ${symbol}</span><strong class="calc-average">${result.average.toLocaleString('en-US', { maximumFractionDigits: 4 })}</strong><p>${result.quantity} contracts · ${direction === 1 ? 'Long' : 'Short'} · ${changes.length} simulated legs</p><div class="calc-breakdown"><div><span>Open P&L at target</span><b>${money(pnl)}</b></div><div><span>Open P&L at stop</span><b>${money(stopPnl)}</b></div><div><span>Realized on reductions</span><b>${money(result.realized)}</b></div><div><span>Risk / open contract</span><b>${riskPerContract > 0 ? usd(riskPerContract) : 'Stop beyond breakeven'}</b></div><div><span>Contracts for ${usd(budget)} risk</span><b>${size ?? '—'}</b></div><div><span>Target distance from breakeven</span><b>${Math.abs(target - result.average).toFixed(2)} pts / ${(Math.abs(target - result.average) / spec.tick).toFixed(2)} ticks</b></div></div><div class="calc-result-note">${riskPerContract > 0 ? 'Sizing uses your new average and stop distance. Open P&L excludes realized P&L, fees and slippage.' : 'The stop is on the profitable side of the new average, so risk-based sizing is unavailable.'}</div>`;
    }
  } catch (error) { host.innerHTML = `<span class="mono">CHECK YOUR INPUTS</span><p class="calc-error" role="alert">${e(error instanceof Error ? error.message : 'Invalid inputs')}</p>`; }
}
function switchMode(value: 'move' | 'position') {
  mode = value;
  document.querySelector<HTMLElement>('#move-inputs')!.hidden = mode !== 'move';
  document.querySelector<HTMLElement>('#position-inputs')!.hidden = mode !== 'position';
  document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('#move-inputs input, #move-inputs select').forEach(input => input.disabled = mode !== 'move');
  document.querySelectorAll<HTMLInputElement>('#position-inputs input').forEach(input => input.disabled = mode !== 'position');
  document.querySelectorAll<HTMLButtonElement>('[data-calc-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.calcMode === mode)));
  document.querySelector('#calc-input-hint')!.textContent = mode === 'move' ? 'A positive move means price rises. Choose Short for a short position.' : 'Fill prices, target and stop are hypothetical. Weighted averages may fall between valid ticks.';
  calculate();
}
document.addEventListener('click', event => {
  const target = event.target as Element;
  const filter = target.closest<HTMLButtonElement>('[data-category]');
  if (filter) { category = filter.dataset.category!; document.querySelectorAll('[data-category]').forEach(b => b.setAttribute('aria-pressed', String(b === filter))); renderProducts(); }
  const details = target.closest<HTMLButtonElement>('[data-details]'); if (details) showDetails(details.dataset.details!);
  const calcMode = target.closest<HTMLButtonElement>('[data-calc-mode]'); if (calcMode) switchMode(calcMode.dataset.calcMode as 'move' | 'position');
  const remove = target.closest('.remove-leg'); if (remove) { remove.closest('.calc-leg')!.remove(); calculate(); }
});
document.querySelector<HTMLInputElement>('#tool-search')!.addEventListener('input', event => { search = (event.target as HTMLInputElement).value; renderProducts(); });
document.querySelector('#calc-form')!.addEventListener('submit', event => { event.preventDefault(); calculate(); });
document.querySelector('#calc-form')!.addEventListener('input', calculate);
document.querySelector('#calc-form')!.addEventListener('change', calculate);
document.querySelector('#add-leg')!.addEventListener('click', () => {
  const legs = document.querySelector('#position-legs')!;
  if (legs.children.length >= 8) return;
  legs.insertAdjacentHTML('beforeend', '<div class="calc-leg"><label>Change in contracts<input name="leg-quantity" type="number" step="1" value="0" inputmode="numeric"></label><label>Fill price<input name="leg-price" type="number" step="any" min="0.01" value="24500" inputmode="decimal"></label><button type="button" class="remove-leg" aria-label="Remove this leg">×</button></div>');
  legs.lastElementChild!.querySelector<HTMLInputElement>('input')!.focus();
  calculate();
});
renderProducts(); switchMode('move');
