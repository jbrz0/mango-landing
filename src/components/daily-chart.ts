import { createChart, LineSeries, ColorType, type Time } from 'lightweight-charts';
import { dailyStatus, macroDefinitions, type MacroSeries } from '../lib/markets/schema';
import { day, number } from '../lib/format';

export function drawDailyChart(host: HTMLElement, data: MacroSeries) {
  const definition = macroDefinitions[data.symbol];
  const last = data.points.at(-1)!;
  const formatted = (value: number) => `${number(value, 2)}${definition.unit === 'percent' ? '%' : ' pts'}`;
  host.innerHTML = `<div class="daily-toolbar"><div class="daily-ranges" role="group" aria-label="Chart date range">${['1M', '3M', '1Y', 'All'].map(range => `<button type="button" data-range="${range}" aria-pressed="${range === '3M'}">${range}</button>`).join('')}</div><span>DAILY · ${definition.source}</span></div><div class="daily-readout" aria-live="off"></div><div class="daily-canvas" role="img" aria-label="${data.symbol} daily history, ${data.points[0].date} through ${last.date}. Latest ${formatted(last.value)}."></div>`;
  const readout = host.querySelector<HTMLDivElement>('.daily-readout')!;
  const latestText = `${day(last.date)} · ${formatted(last.value)} · ${dailyStatus(data)}`;
  readout.textContent = latestText;
  const chart = createChart(host.querySelector<HTMLDivElement>('.daily-canvas')!, {
    autoSize: true,
    layout: { background: { type: ColorType.Solid, color: '#0a0a0a' }, textColor: '#969696', fontSize: 11, attributionLogo: true },
    grid: { vertLines: { color: '#ffffff08' }, horzLines: { color: '#ffffff0b' } },
    rightPriceScale: { borderColor: '#272727' },
    timeScale: { borderColor: '#272727', timeVisible: false },
    handleScroll: { vertTouchDrag: false },
  });
  const series = chart.addSeries(LineSeries, { color: '#ff990a', lineWidth: 2, priceFormat: { type: 'custom', formatter: (value: number) => formatted(value), minMove: 0.01 } });
  series.setData(data.points.map(point => ({ time: point.date, value: point.value })));
  const range = (selected: string) => {
    const days = { '1M': 30, '3M': 90, '1Y': 365 }[selected];
    if (days) {
      const start = new Date(Date.parse(last.date) - days * 86400_000).toISOString().slice(0, 10);
      chart.timeScale().setVisibleRange({ from: (start < data.points[0].date ? data.points[0].date : start) as Time, to: last.date as Time });
    } else chart.timeScale().fitContent();
    host.querySelectorAll<HTMLButtonElement>('[data-range]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.range === selected)));
  };
  range('3M');
  host.querySelectorAll<HTMLButtonElement>('[data-range]').forEach(button => button.addEventListener('click', () => range(button.dataset.range!)));
  chart.subscribeCrosshairMove(event => {
    const point = event.seriesData.get(series);
    if (!point || !('value' in point)) { readout.textContent = latestText; return; }
    const date = typeof point.time === 'object' ? `${point.time.year}-${String(point.time.month).padStart(2, '0')}-${String(point.time.day).padStart(2, '0')}` : String(point.time);
    readout.textContent = `${day(date)} · ${formatted(point.value)} · Daily observation`;
  });
  return () => chart.remove();
}
