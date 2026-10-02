import { escape as e, displayTimeZone, zoneName } from '../lib/format';
import { loadMacro } from '../lib/markets/load';
import { macroDefinitions, type MacroSymbol } from '../lib/markets/schema';

export const chartSymbols: Array<{ id: string; short: string; label: string; detail: string; group: string; daily?: MacroSymbol }> = [
  { id: 'OANDA:NAS100USD', short: 'NAS100', label: 'NAS100 · Nasdaq 100 CFD', detail: 'OANDA · Cash CFD, not NQ futures', group: 'Indices' },
  { id: 'OANDA:SPX500USD', short: 'US500', label: 'US500 · S&P 500 CFD', detail: 'OANDA · Cash CFD, not ES futures', group: 'Indices' },
  { id: 'CAPITALCOM:DXY', short: 'DXY', label: 'DXY · Dollar index CFD', detail: 'Capital.com · Dollar index CFD', group: 'Macro' },
  { id: 'UST:US10Y', short: '10Y', label: 'US10Y · Treasury yield', detail: 'US Treasury · Daily par yield (%)', group: 'Macro', daily: 'US10Y' },
  { id: 'CBOE:VIX', short: 'VIX', label: 'VIX · Volatility index', detail: 'Cboe · Official daily close', group: 'Macro', daily: 'VIX' },
  { id: 'CBOE:VXN', short: 'VXN', label: 'VXN · Nasdaq volatility', detail: 'Cboe · Official daily close', group: 'Macro', daily: 'VXN' },
  { id: 'OANDA:XAUUSD', short: 'Gold', label: 'XAUUSD · Spot gold', detail: 'OANDA · Spot gold / USD', group: 'Commodities' },
  { id: 'COINBASE:BTCUSD', short: 'BTC', label: 'BTC/USD · Bitcoin spot', detail: 'Coinbase · Crypto spot', group: 'Crypto' },
  { id: 'COINBASE:ETHUSD', short: 'ETH', label: 'ETH/USD · Ether spot', detail: 'Coinbase · Crypto spot', group: 'Crypto' },
  ...['EURUSD', 'GBPUSD', 'AUDUSD', 'USDJPY', 'USDCHF', 'USDCAD'].map(symbol => ({ id: `OANDA:${symbol}`, short: symbol, label: `${symbol} · Spot FX`, detail: 'OANDA · Spot FX', group: 'FX' })),
];

export function chartPanel() {
  return `<section class="panel chart-panel" id="charts" aria-labelledby="chart-title">
    <div class="section-heading"><h2 id="chart-title">Market chart</h2><span class="section-meta">INTERACTIVE CHARTS</span></div>
    <div class="chart-controls"><div class="chart-tabs" role="group" aria-label="Quick chart symbols">${chartSymbols.filter(s => ['NAS100', 'VIX', 'DXY', 'Gold', 'BTC'].includes(s.short)).map(s => `<button type="button" data-chart="${s.id}" aria-pressed="${s.short === 'NAS100'}">${s.short}</button>`).join('')}</div><label class="sr-only" for="chart-symbol">Chart instrument</label><select id="chart-symbol">${['Indices','Macro','Commodities','Crypto','FX'].map(group => `<optgroup label="${group}">${chartSymbols.filter(s => s.group === group).map(s => `<option value="${s.id}">${e(s.label)}</option>`).join('')}</optgroup>`).join('')}</select></div>
    <div class="chart-caption"><strong id="chart-instrument">NAS100 · Nasdaq 100 CFD</strong><span id="chart-detail">OANDA · Cash CFD, not NQ futures</span></div>
    <div id="chart-host" class="chart-host"></div>
    <div class="chart-footnote"><span id="chart-note">Provider chart · May be delayed. Separate from the selected briefing.</span><a id="chart-source" href="https://www.tradingview.com/chart/?symbol=OANDA%3ANAS100USD" target="_blank" rel="noopener noreferrer nofollow">Chart by TradingView ↗</a></div>
  </section>`;
}

export function attachChart() {
  const host = document.querySelector<HTMLDivElement>('#chart-host')!;
  const select = document.querySelector<HTMLSelectElement>('#chart-symbol')!;
  let sequence = 0;
  let timer: ReturnType<typeof setTimeout>;
  let observer: MutationObserver | undefined;
  let dispose: (() => void) | undefined;
  let interval = '60';
  const lineOverrides = {
    'mainSeriesProperties.lineStyle.colorType': 'solid',
    'mainSeriesProperties.lineStyle.color': '#ff990a',
    'mainSeriesProperties.lineStyle.linewidth': 2,
  };
  async function show(id: string, force = false) {
    const instrument = chartSymbols.find(s => s.id === id);
    if (!instrument) return;
    sequence++;
    const currentSequence = sequence;
    clearTimeout(timer); observer?.disconnect(); dispose?.(); dispose = undefined;
    select.value = id;
    document.querySelector('#chart-instrument')!.textContent = instrument.label;
    document.querySelector('#chart-detail')!.textContent = instrument.detail;
    const source = document.querySelector<HTMLAnchorElement>('#chart-source')!;
    source.href = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(id)}`;
    source.textContent = 'Chart by TradingView ↗';
    document.querySelector('#chart-note')!.textContent = 'Provider chart · May be delayed. Separate from the selected briefing.';
    document.querySelectorAll<HTMLButtonElement>('[data-chart]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.chart === id)));
    if (instrument.daily) {
      const definition = macroDefinitions[instrument.daily];
      source.href = definition.sourceUrl; source.textContent = `Data: ${definition.source} ↗`;
      document.querySelector('#chart-note')!.innerHTML = 'Official daily observations · Drag to pan, scroll to zoom. <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">TradingView Lightweight Charts™ · Copyright © 2025 TradingView, Inc.</a>';
      host.innerHTML = '<div class="chart-loading" role="status">Loading official daily history…</div>';
      try {
        const [data, { drawDailyChart }] = await Promise.all([loadMacro(force), import('./daily-chart')]);
        if (sequence !== currentSequence) return;
        const series = data.series.find(series => series.symbol === instrument.daily);
        if (!series) throw new Error('Source unavailable');
        dispose = drawDailyChart(host, series);
      } catch {
        if (sequence !== currentSequence) return;
        host.innerHTML = '<div class="chart-loading"><strong>Daily source temporarily unavailable</strong><span>Retry to load the official history.</span><button type="button">Retry chart</button></div>';
        host.querySelector('button')?.addEventListener('click', () => void show(id, true));
      }
      return;
    }
    host.innerHTML = `<div class="daily-toolbar"><div class="daily-ranges" role="group" aria-label="Chart interval">${[['15', '15m'], ['60', '1h'], ['240', '4h'], ['D', '1D']].map(([value, label]) => `<button type="button" data-interval="${value}" aria-pressed="${value === interval}">${label}</button>`).join('')}</div><span>${e(zoneName.toUpperCase())}</span></div><div class="provider-chart"><div class="chart-loading" role="status">Loading public chart…</div><div class="tradingview-widget-container"><div class="tradingview-widget-container__widget"></div></div></div>`;
    host.querySelectorAll<HTMLButtonElement>('[data-interval]').forEach(button => button.addEventListener('click', () => {
      interval = button.dataset.interval!;
      void show(id);
    }));
    const container = host.querySelector<HTMLDivElement>('.tradingview-widget-container')!;
    const loading = host.querySelector<HTMLDivElement>('.chart-loading')!;
    const fail = () => {
      if (sequence !== currentSequence) return;
      clearTimeout(timer);
      loading.innerHTML = '<strong>Chart unavailable</strong><span>The chart provider could not be reached. Research remains available.</span><button type="button" id="chart-retry">Retry chart</button>';
      loading.classList.add('failed');
      loading.querySelector('button')?.addEventListener('click', () => show(id));
    };
    observer = new MutationObserver(() => {
      const frame = container.querySelector('iframe');
      if (!frame) return;
      // The public embed reads style overrides from its query string, not the config hash.
      const url = new URL(frame.src);
      url.searchParams.set('overrides', JSON.stringify(lineOverrides));
      frame.src = url.href;
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
    script.textContent = JSON.stringify({
      autosize: true, symbol: id, interval, timezone: displayTimeZone, theme: 'dark', style: '2', locale: 'en',
      backgroundColor: '#0a0a0a', gridColor: 'rgba(255,255,255,0.04)', allow_symbol_change: false,
      hide_side_toolbar: true, hide_top_toolbar: true, hide_legend: true, hide_volume: true,
      save_image: false, calendar: false, support_host: 'https://www.tradingview.com',
      overrides: lineOverrides,
    });
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
