import { escape as e } from '../lib/format';

export const chartSymbols = [
  { id: 'OANDA:NAS100USD', short: 'NAS100', label: 'NAS100 · Nasdaq 100 CFD', detail: 'OANDA · Cash CFD, not NQ futures', group: 'Indices' },
  { id: 'OANDA:SPX500USD', short: 'US500', label: 'US500 · S&P 500 CFD', detail: 'OANDA · Cash CFD, not ES futures', group: 'Indices' },
  { id: 'CME_MINI:NQ1!', short: 'NQ', label: 'NQ · Nasdaq 100 futures', detail: 'CME · Continuous futures', group: 'Indices' },
  { id: 'CME_MINI:ES1!', short: 'ES', label: 'ES · S&P 500 futures', detail: 'CME · Continuous futures', group: 'Indices' },
  { id: 'NASDAQ:NDX', short: 'NDX', label: 'NDX · Nasdaq 100 cash index', detail: 'NASDAQ · Cash index', group: 'Indices' },
  { id: 'SP:SPX', short: 'SPX', label: 'SPX · S&P 500 cash index', detail: 'S&P · Cash index', group: 'Indices' },
  { id: 'TVC:DXY', short: 'DXY', label: 'DXY · US Dollar Index', detail: 'TVC · Dollar index', group: 'Macro' },
  { id: 'TVC:US10Y', short: '10Y', label: 'US10Y · Treasury yield', detail: 'TVC · US 10-year yield (%)', group: 'Macro' },
  { id: 'CBOE:VIX', short: 'VIX', label: 'VIX · Volatility index', detail: 'CBOE · Volatility index', group: 'Macro' },
  { id: 'OANDA:XAUUSD', short: 'Gold', label: 'XAUUSD · Spot gold', detail: 'OANDA · Spot gold / USD', group: 'Commodities' },
  { id: 'COMEX:GC1!', short: 'GC', label: 'GC · Gold futures', detail: 'COMEX · Continuous futures', group: 'Commodities' },
  { id: 'COINBASE:BTCUSD', short: 'BTC', label: 'BTC/USD · Bitcoin spot', detail: 'Coinbase · Crypto spot', group: 'Crypto' },
  { id: 'COINBASE:ETHUSD', short: 'ETH', label: 'ETH/USD · Ether spot', detail: 'Coinbase · Crypto spot', group: 'Crypto' },
  ...['EURUSD', 'GBPUSD', 'AUDUSD', 'USDJPY', 'USDCHF', 'USDCAD'].map(symbol => ({ id: `OANDA:${symbol}`, short: symbol, label: `${symbol} · Spot FX`, detail: 'OANDA · Spot FX', group: 'FX' })),
];

export function chartPanel() {
  return `<section class="panel chart-panel" id="charts" aria-labelledby="chart-title">
    <div class="section-heading"><h2 id="chart-title">Market chart</h2><span class="section-meta">INTERACTIVE / TRADINGVIEW</span></div>
    <div class="chart-controls"><div class="chart-tabs" role="group" aria-label="Quick chart symbols">${chartSymbols.filter(s => ['NAS100', 'NQ', 'DXY', 'Gold', 'BTC'].includes(s.short)).map(s => `<button type="button" data-chart="${s.id}" aria-pressed="${s.short === 'NAS100'}">${s.short}</button>`).join('')}</div><label class="sr-only" for="chart-symbol">Chart instrument</label><select id="chart-symbol">${['Indices','Macro','Commodities','Crypto','FX'].map(group => `<optgroup label="${group}">${chartSymbols.filter(s => s.group === group).map(s => `<option value="${s.id}">${e(s.label)}</option>`).join('')}</optgroup>`).join('')}</select></div>
    <div class="chart-caption"><strong id="chart-instrument">NAS100 · Nasdaq 100 CFD</strong><span id="chart-detail">OANDA · Cash CFD, not NQ futures</span></div>
    <div id="chart-host" class="chart-host"></div>
    <div class="chart-footnote"><span>Public chart · May be delayed or unavailable by exchange. Separate from the selected briefing.</span><a id="chart-source" href="https://www.tradingview.com/chart/?symbol=OANDA%3ANAS100USD" target="_blank" rel="noopener noreferrer nofollow">Chart by TradingView ↗</a></div>
  </section>`;
}

export function attachChart() {
  const host = document.querySelector<HTMLDivElement>('#chart-host')!;
  const select = document.querySelector<HTMLSelectElement>('#chart-symbol')!;
  let sequence = 0;
  let timer: ReturnType<typeof setTimeout>;
  let observer: MutationObserver | undefined;
  function show(id: string) {
    const instrument = chartSymbols.find(s => s.id === id);
    if (!instrument) return;
    sequence++;
    const currentSequence = sequence;
    clearTimeout(timer); observer?.disconnect();
    select.value = id;
    document.querySelector('#chart-instrument')!.textContent = instrument.label;
    document.querySelector('#chart-detail')!.textContent = instrument.detail;
    document.querySelector<HTMLAnchorElement>('#chart-source')!.href = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(id)}`;
    document.querySelectorAll<HTMLButtonElement>('[data-chart]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.chart === id)));
    if (['CME_MINI:NQ1!', 'CME_MINI:ES1!', 'COMEX:GC1!'].includes(id)) {
      host.innerHTML = `<div class="chart-loading"><strong>${e(instrument.short)} futures · External chart</strong><span>This exchange’s futures data is restricted in free embeds. Open the actual futures chart on TradingView. CFD prices and levels are a different instrument.</span><a class="chart-external" href="https://www.tradingview.com/chart/?symbol=${encodeURIComponent(id)}" target="_blank" rel="noopener noreferrer nofollow">Open ${e(instrument.short)} futures ↗</a></div>`;
      return;
    }
    host.innerHTML = '<div class="chart-loading" role="status">Loading public chart…</div><div class="tradingview-widget-container"><div class="tradingview-widget-container__widget"></div></div>';
    const container = host.querySelector<HTMLDivElement>('.tradingview-widget-container')!;
    const loading = host.querySelector<HTMLDivElement>('.chart-loading')!;
    const fail = () => {
      if (sequence !== currentSequence) return;
      loading.innerHTML = '<strong>Chart unavailable</strong><span>The chart provider could not be reached. Research remains available.</span><button type="button" id="chart-retry">Retry chart</button>';
      loading.classList.add('failed');
      loading.querySelector('button')?.addEventListener('click', () => show(id));
    };
    observer = new MutationObserver(() => {
      const frame = container.querySelector('iframe');
      if (!frame) return;
      frame.title = `${instrument.label} chart by TradingView`;
      frame.addEventListener('load', () => {
        if (sequence !== currentSequence) return;
        clearTimeout(timer); loading.remove();
      }, { once: true });
      observer?.disconnect();
    });
    observer.observe(container, { childList: true, subtree: true });
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    script.textContent = JSON.stringify({ autosize: true, symbol: id, interval: '60', timezone: 'Asia/Bangkok', theme: 'dark', style: '1', locale: 'en', backgroundColor: '#0a0a0a', gridColor: 'rgba(255,255,255,0.04)', allow_symbol_change: false, hide_side_toolbar: true, hide_top_toolbar: false, hide_legend: false, save_image: false, calendar: false, support_host: 'https://www.tradingview.com' });
    script.onerror = fail;
    container.append(script);
    timer = setTimeout(fail, 18000);
  }
  select.addEventListener('change', () => show(select.value));
  document.addEventListener('click', event => {
    const target = (event.target as Element).closest<HTMLButtonElement>('[data-chart]');
    if (target?.dataset.chart) {
      show(target.dataset.chart);
      if (!target.closest('.chart-tabs')) document.querySelector('#charts')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    }
  });
  host.innerHTML = '<div class="chart-loading">Public chart loads when in view.</div>';
  const lazy = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) { lazy.disconnect(); if (!sequence) show(select.value); }
  }, { threshold: 0.05 });
  lazy.observe(host);
}
