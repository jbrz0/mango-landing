import '../lib/analytics';
import '../styles.css';
import './labs.css';
import { pageShell, startClock, icon, blank } from './shared';
const futuresCalculatorUrl = 'https://www.mangoatlas.xyz/tools/calculator-futures';

type Product = { id: string; name: string; category: string; format: string; status: string; description: string; features: string[]; note: string; url?: string; art: string; tags: string[] };
const products: Product[] = [
  { id: 'gex', name: 'QQQ Gamma Exposure', category: 'Utilities', format: 'WEB TOOL', status: 'Free', description: 'Explore QQQ options positioning by strike and expiry, with call/put walls, modeled gamma flips and concise market context.', features: ['Interactive heatmap, walls and strike profiles', '7, 30 and 90-day expiry windows', 'Call/put concentrations and modeled gamma flips', 'Exact source timestamps and transparent methodology'], note: 'Free to use. Published delayed Cboe snapshots and daily open interest. Calls-positive / puts-negative is a modeling convention, not observed dealer inventory or a directional signal.', art: 'gex', tags: ['QQQ', 'GEX', 'Options'] },
  { id: 'futures-calculator', name: 'Futures Position Calculator', category: 'Utilities', format: 'WEB TOOL', status: 'Free', description: 'Turn contracts and points into dollars, or work backwards from a dollar target.', features: ['Points to dollar P&L', 'Dollar targets to required points', 'Large inputs with full keyboard navigation', 'NQ, ES, MNQ, MES, GC, MGC, CL, MCL, BTC and MBT'], note: 'Free to use on its own page. No account required. Calculations exclude commissions and slippage.', art: 'calculator', tags: ['Futures', 'Risk', 'No signup'] },
  { id: 'market-regime', name: 'Market Regime HUD', category: 'Indicators', format: 'TRADINGVIEW', status: 'Invite-only', description: 'Trend, range, chop or transition. A compact terminal view of the market’s current regime.', features: ['Regime classification', 'EMA / VWAP context', 'ADX strength and ATR volatility', 'Compact and full display modes'], note: 'Published on TradingView as an invite-only script. Opening the listing does not grant access; pricing and access are still being finalized.', url: 'https://www.tradingview.com/script/xQLgC1fS-Mango-Atlas-Market-Regime-HUD/', art: 'regime', tags: ['Regime', 'VWAP', 'Pine'] },
  { id: 'prop-trader', name: 'Prop Trader OS', category: 'Templates', format: 'NOTION TEMPLATE', status: 'In development', description: 'Your evaluations, funded accounts, drawdown rules and payouts. One organized trading desk.', features: ['Firm and account databases', 'Daily / trailing drawdown tracking', 'Payout eligibility and history', 'Billing dates, rules and performance views'], note: 'Planned paid Notion template. Demo, download, marketplace link and pricing will be added when it is ready.', art: 'prop', tags: ['Prop firms', 'Accounts', 'Notion'] },
  { id: 'ai-fund', name: 'AI Fund Operations', category: 'Templates', format: 'NOTION TEMPLATE', status: 'In development', description: 'An operating system for your personal fund’s AI agents. Assign work, track routines and review outputs.', features: ['Agent roles and responsibilities', 'Tasks, routines and automation inventory', 'Human approval checkpoints', 'Logs, outputs and retry notes'], note: 'Also known as AI Agent Operations OS. Platform-independent Notion template in development; final download and pricing are not available yet.', art: 'agents', tags: ['AI agents', 'Operations', 'Notion'] },
  { id: 'order-flow', name: 'Order Flow / Footprint', category: 'Indicators', format: 'TRADINGVIEW', status: 'Prototype', description: 'An order-flow dashboard exploring volume delta, imbalance and auction context.', features: ['Buy / sell volume and delta', 'POC and value-area context', 'Row-level imbalance exploration', 'Session directional summary'], note: 'Research prototype. Pine footprint support, plan requirements and historical limitations are still being validated. No published listing yet.', art: 'footprint', tags: ['Order flow', 'Volume', 'Prototype'] },
  { id: 'atlas-stack', name: 'The Mango Atlas Stack', category: 'Resources', format: 'SOFTWARE DIRECTORY', status: 'In development', description: 'A practical directory of the trading, management and AI tools behind the desk.', features: ['Charting and execution software', 'Market data and research', 'Management and operations', 'AI and developer tooling'], note: 'The directory is being curated. Product selections, comparisons and affiliate links will be added later.', art: 'stack', tags: ['Software', 'Trading', 'AI'] },
];
function art(product: Product) {
  const content = ({
    gex: '<div class="art-gex"><span>QQQ / GAMMA EXPOSURE</span><div class="art-gex-map">' + Array.from({ length: 36 }, (_, i) => `<i style="--cell:${(i * 7 + Math.floor(i / 6)) % 11 > 5 ? '#00e676' : '#ff3355'};--strength:${.15 + (i * 13 % 8) / 10}"></i>`).join('') + '</div><small>STRIKE × EXPIRY <b>+ GAMMA</b><em>− GAMMA</em></small></div>',
    calculator: '<div class="art-equation"><span>CONTRACTS × MOVE × VALUE</span><b>03 <i>×</i> 35 <i>×</i> $2</b><strong>$210<span>.00</span></strong><small>MNQ / BEFORE FEES</small></div>',
    regime: '<div class="art-hud"><span>MANGO ATLAS / REGIME</span><div><b>REGIME</b><i>CLASSIFICATION</i></div><div><b>STRENGTH</b><i>ADX / DIRECTION</i></div><div><b>CONTEXT</b><i>EMA + VWAP</i></div><div class="hud-bars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div>',
    prop: '<div class="art-notion"><div class="art-notion-sidebar"><i></i><i></i><i></i><i></i></div><div><span>PROP TRADER / OS</span><div class="art-notion-cards"><i></i><i></i><i></i></div><div class="art-table"><i></i><i></i><i></i><i></i></div></div></div>',
    agents: '<div class="art-agents"><span>AI FUND / OPERATIONS</span><div class="agent-network"><i>RESEARCH</i><i>HUMAN</i><i>RISK</i><i>EXECUTION</i><i>REVIEW</i></div></div>',
    footprint: '<div class="art-footprint"><span>ORDER FLOW / FOOTPRINT</span><div>' + [1,2,3,4,5,6,7].map((n) => `<i style="--w:${25 + ((n * 17) % 70)}%"></i><b style="--w:${25 + ((n * 31) % 70)}%"></b>`).join('') + '</div></div>',
    stack: '<div class="art-stack"><span>THE DESK / STACK</span><div><i>TRADING</i><i>DATA</i><i>AI</i><i>OPS</i></div></div>',
  } as Record<string, string>)[product.art];
  return `<div class="product-art visual-${product.art}" aria-hidden="true">${content}<span class="art-caption">${product.art === 'calculator' ? 'WORKING UTILITY' : product.art === 'gex' ? 'INTERFACE PREVIEW' : 'INTERFACE CONCEPT'}</span></div>`;
}
const body = `<div class="lab-intro tools-intro"><div><div class="lab-kicker"><span class="status-dot"></span>MANGO ATLAS / TOOLS</div><h1>A sharper<br><span>trading desk.</span></h1><p>Purpose-built indicators, operating systems and utilities.<br>Less friction. More focus.</p></div></div>
<div class="toolkit-heading"><div><span class="mono">THE TOOLKIT / 01</span><h2>Built for the way you work.</h2></div><p>${products.length} tools to start. An expanding toolkit.</p></div>
<div class="catalog-toolbar"><div class="lab-tabs" role="group" aria-label="Product category">${['All tools', 'Utilities', 'Indicators', 'Templates', 'Resources'].map((c,i) => `<button data-category="${c}" aria-pressed="${!i}">${c}<span>${c === 'All tools' ? products.length : products.filter(p => p.category === c).length}</span></button>`).join('')}</div><label class="catalog-search">${icon('radar')}<span class="sr-only">Search tools</span><input id="tool-search" type="search" placeholder="Find your next tool…" autocomplete="off"></label></div>
<div class="product-grid" id="product-grid"></div><p id="catalog-count" class="catalog-count mono" aria-live="polite"></p>
<div class="tools-endnote"><span>${icon('tools')}</span><div><h2>A toolkit in progress.</h2><p>Published indicators link to TradingView. Templates, order flow and the software directory are still being built. Availability and pricing will appear here as each product is ready.</p></div></div>
<dialog id="product-dialog" class="product-dialog" aria-labelledby="dialog-title"><button class="dialog-close" type="button" aria-label="Close product details">×</button><div id="dialog-content"></div></dialog>`;
document.querySelector('#app')!.innerHTML = pageShell('Tools', body, '/tools');
startClock();
let category = 'All tools';
let search = '';
function renderProducts() {
  const filtered = products.filter(p => (category === 'All tools' || p.category === category) && `${p.name} ${p.description} ${p.tags.join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  document.querySelector('#product-grid')!.innerHTML = filtered.length ? filtered.map((p, i) => `<article class="product-card" style="--card-delay:${i * 40}ms">${art(p)}<div class="product-copy"><div class="product-meta"><span class="mono">${p.format}</span><span class="product-status ${p.status === 'Free' ? 'free' : p.status === 'Invite-only' ? 'invite' : ''}">${p.status}</span></div><h3>${p.name}</h3><p>${p.description}</p><div class="product-tags">${p.tags.map(t => `<span>${t}</span>`).join('')}</div><div class="product-actions"><button data-details="${p.id}">View details ${icon('arrow')}</button>${p.url ? `<a href="${p.url}" target="_blank" rel="noopener noreferrer" aria-label="Open ${p.name} on TradingView">TradingView ${icon('arrow')}</a>` : p.id === 'gex' ? '<a href="/gex">Open gamma exposure →</a>' : p.id === 'futures-calculator' ? `<a href="${futuresCalculatorUrl}">Open tool →</a>` : '<span>Coming soon</span>'}</div></div></article>`).join('') : blank('No tools match your search. Try another name or category.');
  document.querySelector('#catalog-count')!.textContent = `${filtered.length} / ${products.length} TOOLS`;
}
const dialog = document.querySelector<HTMLDialogElement>('#product-dialog')!;
function showDetails(id: string) {
  const p = products.find(p => p.id === id)!;
  document.querySelector('#dialog-content')!.innerHTML = `${art(p)}<div class="dialog-copy"><span class="mono orange">${p.format} / ${p.status.toUpperCase()}</span><h2 id="dialog-title">${p.name}</h2><p>${p.description}</p><ul>${p.features.map(f => `<li>${f}</li>`).join('')}</ul><p class="dialog-note">${p.note}</p>${p.url ? `<a class="product-cta" href="${p.url}" target="_blank" rel="noopener noreferrer">View on TradingView ${icon('arrow')}</a>` : p.id === 'gex' ? '<a class="product-cta" href="/gex">Open gamma exposure →</a>' : p.id === 'futures-calculator' ? `<a class="product-cta" href="${futuresCalculatorUrl}">Open free calculator →</a>` : '<span class="coming-soon-label">In development · Release link coming soon</span>'}</div>`;
  dialog.showModal();
}
document.querySelector('.dialog-close')!.addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
document.addEventListener('click', event => {
  const target = event.target as Element;
  const filter = target.closest<HTMLButtonElement>('[data-category]');
  if (filter) { category = filter.dataset.category!; document.querySelectorAll('[data-category]').forEach(b => b.setAttribute('aria-pressed', String(b === filter))); renderProducts(); }
  const details = target.closest<HTMLButtonElement>('[data-details]'); if (details) showDetails(details.dataset.details!);
});
document.querySelector<HTMLInputElement>('#tool-search')!.addEventListener('input', event => { search = (event.target as HTMLInputElement).value; renderProducts(); });
renderProducts();
