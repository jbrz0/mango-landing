import { loadMacro } from '../lib/markets/load';
import { dailyStatus, macroDefinitions, type MacroResponse } from '../lib/markets/schema';
import { day, escape as e, number } from '../lib/format';
import { arrow, sectionHeader } from './primitives';

export const quoteSymbols = [
  { proName: 'OANDA:NAS100USD', title: 'NAS100 CFD' },
  { proName: 'OANDA:SPX500USD', title: 'US500 CFD' },
  { proName: 'CAPITALCOM:DXY', title: 'Dollar index CFD' },
  { proName: 'OANDA:XAUUSD', title: 'XAUUSD · Gold spot' },
  { proName: 'COINBASE:BTCUSD', title: 'BTC/USD · Spot' },
];

function renderMacro(data?: MacroResponse, failed = false) {
  document.querySelector('#macro')!.innerHTML = `${sectionHeader('macro-title', 'Macro pulse', 'LATEST DAILY DATA')}
    <div class="macro-rows">${Object.entries(macroDefinitions).map(([symbol, definition]) => {
      const series = data?.series.find(item => item.symbol === symbol);
      const last = series?.points.at(-1);
      const previous = series?.points.at(-2);
      const change = last && previous ? definition.unit === 'percent' ? (last.value - previous.value) * 100 : (last.value / previous.value - 1) * 100 : null;
      return `<div class="macro-row" data-macro="${symbol}"><div><strong>${definition.label}</strong><span class="mono">${symbol}</span><a class="macro-source" href="${definition.sourceUrl}" target="_blank" rel="noopener noreferrer">${definition.source} ↗</a></div><div><b class="mono">${last ? `${number(last.value, 2)}${definition.unit === 'percent' ? '%' : ''}` : failed || data ? 'Unavailable' : 'Loading…'}</b>${change !== null && Number.isFinite(change) ? `<small>${change >= 0 ? '+' : ''}${number(change, definition.unit === 'percent' ? 0 : 2)}${definition.unit === 'percent' ? ' bp' : '%'} vs prior</small>` : ''}<small>${last ? `${day(last.date)} · ${symbol === 'US10Y' ? 'Daily yield' : 'Close'}` : 'Daily source observation'}</small>${series && dailyStatus(series) !== 'Daily observation' ? `<small class="orange">${e(dailyStatus(series))}</small>` : ''}</div><button class="icon-link" data-chart="${symbol === 'US10Y' ? 'UST:US10Y' : `CBOE:${symbol}`}" aria-label="Chart ${definition.label}">${arrow}</button></div>`;
    }).join('')}</div><p class="section-note">Official daily observations, independent of the selected briefing. Volatility in points; yield in %. <button class="text-button" id="refresh-macro">Refresh</button></p>`;
}

export function attachMarkets() {
  const host = document.querySelector('#market-strip')!;
  host.innerHTML = `<div class="quote-heading"><span class="eyebrow">MARKET QUOTES</span><span>Current provider feed · Independent of briefing date</span></div><div class="quote-scroll" tabindex="0" role="region" aria-label="Market quotes, scroll horizontally to see all instruments"><div class="quote-provider tradingview-widget-container"><div class="tradingview-widget-container__widget"></div></div></div><p id="quotes-loading" class="quotes-loading" role="status">Loading market quotes…</p><div class="quote-footnote"><span>CFDs: OANDA / Capital.com · Spot: OANDA / Coinbase · May be delayed · Scroll for more ↔</span><a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer nofollow">Quotes by TradingView ↗</a></div>`;
  const container = host.querySelector('.quote-provider')!;
  const status = host.querySelector('#quotes-loading')!;
  let timer: ReturnType<typeof setTimeout>;
  const failure = () => { status.textContent = 'Quote provider could not be reached. Reload to retry; official daily data is available below.'; };
  const observer = new MutationObserver(() => {
    const frame = container.querySelector('iframe');
    if (!frame) return;
    frame.title = 'Current CFD and spot quotes by TradingView';
    frame.addEventListener('load', () => { clearTimeout(timer); status.remove(); }, { once: true });
    observer.disconnect();
  });
  observer.observe(container, { childList: true, subtree: true });
  const script = document.createElement('script');
  script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-tickers.js';
  script.async = true;
  script.textContent = JSON.stringify({ symbols: quoteSymbols, colorTheme: 'dark', isTransparent: true, showSymbolLogo: false, locale: 'en' });
  script.onerror = () => { clearTimeout(timer); failure(); };
  container.append(script);
  timer = setTimeout(failure, 18_000);

  renderMacro();
  const refresh = async (force = false) => {
    try { renderMacro(await loadMacro(force)); } catch { renderMacro(undefined, true); }
  };
  document.querySelector('#macro')!.addEventListener('click', event => {
    if ((event.target as Element).closest('#refresh-macro')) void refresh(true);
  });
  void refresh();
  setInterval(() => { if (!document.hidden) void refresh(); }, 5 * 60_000);
}
