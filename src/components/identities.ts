import { escape as e } from '../lib/format';
import type { EconomicEvent } from '../lib/intel/schema';

// Common names are served locally. New research symbols use Public's logo feed.
const cachedLogos = new Set(['AAPL', 'AMD', 'AMZN', 'AVGO', 'GOOGL', 'INTC', 'META', 'MSFT', 'MU', 'NVDA', 'SMH', 'TSLA', 'TSM']);
export function stockIdentity(symbol: string) {
  const src = cachedLogos.has(symbol) ? `/company-logos/${symbol}.png` : `https://universal.hellopublic.com/companyLogos/${encodeURIComponent(symbol)}@3x.png`;
  return `<span class="stock-identity"><span class="company-logo" aria-hidden="true"><span>${e(symbol.slice(0, 2))}</span><img src="${src}" width="24" height="24" alt="" loading="lazy" decoding="async" data-identity-image></span><strong class="mono">${e(symbol)}</strong></span>`;
}

// Resolve the actual country first: a German EUR event should show Germany.
const countries: Record<string, string> = {
  'united states': 'us', 'usa': 'us', 'us': 'us', 'japan': 'jp', 'canada': 'ca',
  'united kingdom': 'gb', 'uk': 'gb', 'euro area': 'eu', 'eurozone': 'eu', 'european union': 'eu',
  'switzerland': 'ch', 'australia': 'au', 'new zealand': 'nz', 'china': 'cn',
  'germany': 'de', 'france': 'fr', 'italy': 'it', 'spain': 'es', 'south korea': 'kr',
};
const currencyRegions: Record<string, string> = { USD: 'us', JPY: 'jp', CAD: 'ca', GBP: 'gb', EUR: 'eu', CHF: 'ch', AUD: 'au', NZD: 'nz', CNY: 'cn', KRW: 'kr' };
export function eventCurrency(event: Pick<EconomicEvent, 'country' | 'currency'>) {
  const country = event.country.trim().toLowerCase();
  const flag = countries[country] ?? (['', 'unknown', 'global'].includes(country) ? currencyRegions[event.currency] : undefined);
  return `<span class="event-currency">${flag ? `<img src="/flags/${flag}.svg" width="18" height="14" alt="" aria-hidden="true" loading="lazy" data-identity-image>` : ''}${e(event.currency)}</span>`;
}

export function attachIdentityFallbacks() {
  // Capture image errors for rows replaced by archive, filter and calendar updates.
  document.addEventListener('error', event => {
    const image = event.target;
    if (image instanceof HTMLImageElement && image.hasAttribute('data-identity-image')) image.hidden = true;
  }, true);
}
