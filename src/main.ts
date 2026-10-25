import './lib/analytics';
import './styles.css';
import { shell, renderData, renderChanges, feed, events } from './components/dashboard';
import { chartPanel, attachChart } from './components/chart';
import { attachMarkets } from './components/markets';
import { attachDashboardHeader, attachDashboardLayout } from './components/layout';
import { loadArchive, loadDashboard, previousBriefing } from './lib/intel/load';
import type { Intel } from './lib/intel/schema';
import { day, escape as e, time, zoneLabel } from './lib/format';
import { localizeResearch } from './lib/intel/localize';
import { refreshEquityQuotes } from './components/equities';
import { attachIdentityFallbacks } from './components/identities';

attachIdentityFallbacks();
document.querySelector<HTMLDivElement>('#app')!.innerHTML = shell(chartPanel());
attachDashboardHeader();
attachDashboardLayout();
const dateSelect = document.querySelector<HTMLSelectElement>('#brief-date')!;
let selected: Intel | null = null;
let latest: Intel | null = null;
let dates: string[] = [];
let fallback = false;
let request = 0;
let eventScope = 'today';
const historical = () => selected?.asOfDate !== latest?.asOfDate;

function updateClock() {
  const now = new Date().toISOString();
  document.querySelector('#desk-clock')!.textContent = `${time(now)} ${zoneLabel(now)}`;
}
updateClock();
setInterval(updateClock, 30_000);
attachChart();
renderData(null, false);
attachMarkets();
document.querySelector('#data-status')!.textContent = 'Loading the latest published intelligence…';

async function show(data: Intel | null, ticket: number) {
  selected = data;
  eventScope = 'today';
  renderData(data, historical(), fallback);
  renderChanges(data, null);
  if (data) {
    const previous = await previousBriefing(data.asOfDate, dates);
    if (request === ticket) renderChanges(data, previous);
  }
}

loadDashboard().then(async result => {
  latest = result.current; dates = result.dates; fallback = result.fallback;
  dateSelect.innerHTML = dates.length ? dates.map(date => `<option value="${date}">${e(day(date))}${date === latest?.asOfDate ? ' · Latest' : ''}</option>`).join('') : '<option>No briefings available</option>';
  dateSelect.disabled = !dates.length;
  await show(latest, ++request);
}).catch(() => { renderData(null, false); renderChanges(null, null); });

dateSelect.addEventListener('change', async () => {
  const ticket = ++request;
  const previousDate = selected?.asOfDate;
  dateSelect.setAttribute('aria-busy', 'true');
  try {
    const data = dateSelect.value === latest?.asOfDate ? latest : await loadArchive(dateSelect.value);
    if (ticket !== request) return;
    await show(data, ticket);
  } catch {
    if (ticket !== request) return;
    if (previousDate) dateSelect.value = previousDate;
    document.querySelector('#data-status')!.textContent = 'This archive could not be loaded. The previous selection is still displayed.';
  } finally { if (ticket === request) dateSelect.removeAttribute('aria-busy'); }
});

document.addEventListener('click', event => {
  const element = event.target as Element;
  const filter = element.closest<HTMLButtonElement>('[data-feed-filter]');
  if (filter?.dataset.feedFilter) {
    const tag = filter.dataset.feedFilter;
    document.querySelector('#intelligence')!.innerHTML = feed(selected ? localizeResearch(selected) : null, tag);
    [...document.querySelectorAll<HTMLButtonElement>('[data-feed-filter]')].find(button => button.dataset.feedFilter === tag)?.focus({ preventScroll: true });
  }
  const scope = element.closest<HTMLButtonElement>('[data-event-scope]');
  if (scope?.dataset.eventScope) {
    eventScope = scope.dataset.eventScope;
    document.querySelector('#catalysts')!.innerHTML = events(selected, historical(), eventScope);
    document.querySelector<HTMLButtonElement>(`[data-event-scope="${eventScope}"]`)?.focus({ preventScroll: true });
  }
});

setInterval(() => {
  if (selected && !document.querySelector('#catalysts')?.contains(document.activeElement)) document.querySelector('#catalysts')!.innerHTML = events(selected, historical(), eventScope);
}, 60_000);

setInterval(() => { if (!document.hidden) void refreshEquityQuotes(); }, 15 * 60_000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) void refreshEquityQuotes(); });
