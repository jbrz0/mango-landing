import '../styles.css';
import './calculator-futures.css';
import { calculateFutures, contractFromUrl, contracts, futuresSymbols, parseFuturesNumber, type CalculationSource } from '../lib/futures';
import type { Contract } from '../lib/global/calculator';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <a class="skip-link" href="#main">Skip to calculator</a>
  <header class="site-header"><div class="header-inner">
    <a class="brand" href="/" aria-label="Mango Atlas home"><img src="/logo-transparent.png" width="46" height="46" alt=""><span>MANGO<span class="brand-atlas">ATLAS</span><small>MARKET INTELLIGENCE</small></span></a>
    <a class="futures-back" href="/"><span aria-hidden="true">←</span> Dashboard</a>
  </div></header>
  <main id="main" class="futures-wrap">
    <div class="futures-heading"><p class="eyebrow"><span class="orange">MANGO ATLAS</span> / TOOLS</p><h1>Futures calculator<span class="orange">.</span></h1><p>Enter points or dollars. The other fills itself in.</p></div>
    <form id="futures-form" novalidate aria-label="Futures calculator">
      <div class="futures-grid">
        <div class="futures-field"><label for="futures-contract">Contract</label><select id="futures-contract" name="contract" required aria-describedby="contract-hint">${futuresSymbols.map(symbol => `<option value="${symbol}">${symbol}</option>`).join('')}</select><p id="contract-hint" class="futures-hint"></p></div>
        <div class="futures-field"><label for="futures-quantity">Amount of contracts</label><input id="futures-quantity" name="quantity" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" value="1" required aria-describedby="quantity-hint"><p id="quantity-hint" class="futures-hint">Positive whole contracts.</p></div>
        <div class="futures-field" id="points-field"><div class="futures-label"><label for="futures-points">Points move</label><span id="points-calculated" class="futures-calculated" hidden>Calculated</span></div><div class="futures-value"><input id="futures-points" name="points" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="0" aria-describedby="points-hint"><span aria-hidden="true">pts</span></div><p id="points-hint" class="futures-hint">1 point = a 1.00 price move.</p></div>
        <div class="futures-field" id="money-field"><div class="futures-label"><label for="futures-money">Amount of money</label><span id="money-calculated" class="futures-calculated" hidden>Calculated</span></div><div class="futures-value"><span class="futures-currency" aria-hidden="true">$</span><input id="futures-money" name="money" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="0.00" aria-describedby="money-hint"></div><p id="money-hint" class="futures-hint">USD · Before commissions and fees.</p></div>
      </div>
      <div class="futures-actions"><output id="futures-status" for="futures-contract futures-quantity futures-points futures-money" aria-live="polite" aria-atomic="true">Enter a points move or a dollar amount to start.</output><button type="reset" class="futures-reset">Reset <span aria-hidden="true">↺</span></button></div>
    </form>
    <div class="futures-footnote"><p>Edit either value to calculate the other. Negative values work too.</p><a id="futures-specs" href="https://www.cmegroup.com/markets/equities/nasdaq/micro-e-mini-nasdaq-100.contractSpecs.html" target="_blank" rel="noopener noreferrer">CME contract specs ↗</a></div>
  </main>`;

const form = document.querySelector<HTMLFormElement>('#futures-form')!;
const contract = document.querySelector<HTMLSelectElement>('#futures-contract')!;
const quantity = document.querySelector<HTMLInputElement>('#futures-quantity')!;
const inputs = { points: document.querySelector<HTMLInputElement>('#futures-points')!, money: document.querySelector<HTMLInputElement>('#futures-money')! };
const status = document.querySelector<HTMLOutputElement>('#futures-status')!;
let source: CalculationSource = 'points';

const decimal = (value: number, digits = 10) => new Intl.NumberFormat('en-US', { useGrouping: false, maximumFractionDigits: digits }).format(value);
const dollars = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
const specPaths: Record<Contract, string> = {
  NQ: 'equities/nasdaq/e-mini-nasdaq-100', ES: 'equities/sp/e-mini-sandp500',
  MNQ: 'equities/nasdaq/micro-e-mini-nasdaq-100', MES: 'equities/sp/micro-e-mini-sandp-500',
  GC: 'metals/precious/gold', MGC: 'metals/precious/e-micro-gold',
  CL: 'energy/crude-oil/light-sweet-crude', MCL: 'energy/crude-oil/micro-wti-crude-oil',
  BTC: 'cryptocurrencies/bitcoin/bitcoin', MBT: 'cryptocurrencies/bitcoin/micro-bitcoin',
};

function update() {
  const symbol = contract.value as Contract;
  const spec = contracts[symbol];
  const derived: CalculationSource = source === 'points' ? 'money' : 'points';
  document.querySelector('#contract-hint')!.textContent = `${spec.name} · ${dollars(spec.point)} / point`;
  document.querySelector<HTMLAnchorElement>('#futures-specs')!.href = `https://www.cmegroup.com/markets/${specPaths[symbol]}.contractSpecs.html`;
  document.querySelectorAll('.futures-calculated').forEach(badge => { (badge as HTMLElement).hidden = true; });
  document.querySelectorAll('.futures-field').forEach(field => field.classList.remove('is-calculated'));
  for (const field of [quantity, inputs.points, inputs.money]) field.removeAttribute('aria-invalid');
  inputs[derived].value = '';
  const count = parseFuturesNumber(quantity.value);
  const value = parseFuturesNumber(inputs[source].value, source === 'money');
  let message = '';
  if (count === null || !Number.isInteger(count) || count < 1 || count > 100_000) {
    if (quantity.value.trim()) quantity.setAttribute('aria-invalid', 'true');
    message = 'Enter a whole number of contracts from 1 to 100,000.';
  } else if (value === null) {
    if (inputs[source].value.trim()) {
      inputs[source].setAttribute('aria-invalid', 'true');
      message = `Enter a valid ${source === 'points' ? 'points move' : 'dollar amount'}.`;
    } else message = 'Enter a points move or a dollar amount to start.';
  } else {
    try {
      const result = calculateFutures(symbol, count, source, value);
      inputs[derived].value = derived === 'money' ? result.money.toFixed(2) : decimal(result.points);
      document.querySelector<HTMLElement>(`#${derived}-calculated`)!.hidden = false;
      document.querySelector(`#${derived}-field`)!.classList.add('is-calculated');
      message = `${decimal(count)} ${symbol} × ${decimal(result.points)} pts × ${dollars(spec.point)} = ${dollars(result.money)}`;
    } catch (error) {
      inputs[source].setAttribute('aria-invalid', 'true');
      message = error instanceof Error ? error.message : 'Unable to calculate these values.';
    }
  }
  status.textContent = message;
}

form.addEventListener('submit', event => event.preventDefault());
for (const key of ['points', 'money'] as const) inputs[key].addEventListener('input', () => { source = key; update(); });
// Selecting the calculated value makes switching between points and dollars a single keystroke.
for (const field of [quantity, inputs.points, inputs.money]) field.addEventListener('focus', () => field.select());
quantity.addEventListener('input', update);
contract.addEventListener('change', () => {
  const url = new URL(location.href);
  url.hash = contract.value.toLowerCase();
  history.replaceState(null, '', url);
  update();
});
const loadContract = () => { contract.value = contractFromUrl(new URL(location.href)); update(); };
window.addEventListener('hashchange', loadContract);
window.addEventListener('popstate', loadContract);
form.addEventListener('reset', event => {
  event.preventDefault();
  quantity.value = '1';
  inputs.points.value = inputs.money.value = '';
  source = 'points';
  update();
  quantity.focus();
});
loadContract();
