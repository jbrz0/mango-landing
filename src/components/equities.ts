import { EQUITY_TTL, equityResponseSchema, equityStatus, type EquityResponse } from '../lib/markets/equities';
import { escape as e, signed, timestamp } from '../lib/format';

let cached: EquityResponse | undefined;
let expires = 0;
let pending: Promise<EquityResponse> | undefined;
async function loadEquities(): Promise<EquityResponse> {
  if (cached && Date.now() < expires) return cached;
  pending ??= fetch('/api/equities', { signal: AbortSignal.timeout(12_000) }).then(async response => {
    if (!response.ok) throw new Error('Stock quotes unavailable');
    const data = equityResponseSchema.parse(await response.json());
    for (const symbol of data.unavailable) {
      const prior = cached?.quotes.find(quote => quote.symbol === symbol);
      if (prior) data.quotes.push({ ...prior, refreshFailed: true });
    }
    cached = data;
    expires = Date.now() + EQUITY_TTL;
    return data;
  }).catch(() => {
    cached = { quotes: cached?.quotes.map(quote => ({ ...quote, refreshFailed: true })) ?? [], unavailable: [] };
    expires = Date.now() + 5 * 60_000;
    return cached;
  }).finally(() => { pending = undefined; });
  return pending;
}

export async function refreshEquityQuotes() {
  if (!document.querySelector('[data-equity]')) return;
  const data = await loadEquities();
  // Resolve elements after the request: an archive selection may have replaced the rows.
  document.querySelectorAll<HTMLElement>('[data-equity]').forEach(element => {
    const quote = data.quotes.find(quote => quote.symbol === element.dataset.equity);
    element.innerHTML = quote
      ? `<b>${e(new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(quote.price))}</b>${quote.changePct !== null ? `<span class="${quote.changePct < 0 ? 'negative-text' : 'positive-text'}">${signed(quote.changePct)}</span>` : ''}`
      : '<span class="muted-text">Price unavailable</span>';
    const source = element.parentElement!.querySelector<HTMLElement>('[data-equity-source]')!;
    source.textContent = quote ? `${quote.source} · ${timestamp(quote.updatedAt)} · ${equityStatus(quote)}` : 'No current quote available for this symbol.';
  });
}
