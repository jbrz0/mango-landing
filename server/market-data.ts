import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { dateSchema, pointSchema, seriesSchema, type DailyPoint, type MacroSymbol, type MacroSeries, type MacroResponse } from '../src/lib/markets/schema.js';

const TTL = 15 * 60_000;
const xml = new XMLParser({ removeNSPrefix: true, parseTagValue: false, ignoreAttributes: false, processEntities: false });

function observations(points: DailyPoint[], today: string, minimum = 2) {
  const unique = new Map<string, DailyPoint>();
  for (const point of points) {
    pointSchema.parse(point);
    if (point.date > today) throw new Error('Provider returned a future observation');
    unique.set(point.date, point);
  }
  const ordered = [...unique.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-756);
  if (ordered.length < minimum) throw new Error('Not enough valid observations');
  return ordered;
}

export function parseCboe(csv: string, today: string): DailyPoint[] {
  const [header, ...rows] = csv.trim().split(/\r?\n/);
  if (header.replace(/^\uFEFF/, '').trim() !== 'DATE,OPEN,HIGH,LOW,CLOSE') throw new Error('Unexpected Cboe columns');
  return observations(rows.filter(row => row.trim()).map(row => {
    const [date, , , , close] = row.split(',');
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date);
    if (!match || !close?.trim()) throw new Error('Malformed Cboe observation');
    return { date: `${match[3]}-${match[1]}-${match[2]}`, value: Number(close) };
  }), today);
}

export function parseTreasury(body: string, today: string): DailyPoint[] {
  if (XMLValidator.validate(body) !== true) throw new Error('Invalid Treasury XML');
  const feed = xml.parse(body).feed;
  if (!feed || !feed.entry) throw new Error('Missing Treasury entries');
  const entries = Array.isArray(feed.entry) ? feed.entry : [feed.entry];
  const scalar = (value: unknown): string | undefined => typeof value === 'string' ? value : value && typeof value === 'object' ? (value as Record<string, string>)['#text'] : undefined;
  const points: DailyPoint[] = [];
  for (const entry of entries) {
    const props = entry.content?.properties;
    const date = scalar(props?.NEW_DATE)?.slice(0, 10);
    const value = scalar(props?.BC_10YEAR);
    if (!date || !dateSchema.safeParse(date).success) throw new Error('Invalid Treasury date');
    // Treasury can publish a null for a maturity. Never convert it to zero.
    if (value === undefined || !value.trim()) continue;
    points.push({ date, value: Number(value) });
  }
  return observations(points, today, 1);
}

export function createMarketLoader(fetcher: typeof fetch = fetch, now: () => number = Date.now) {
  let cached: MacroResponse | undefined;
  let expires = 0;
  let pending: Promise<MacroResponse> | undefined;
  const lastGood = new Map<MacroSymbol, MacroSeries>();
  async function download(url: string) {
    const response = await fetcher(url, { signal: AbortSignal.timeout(10_000), headers: { Accept: 'text/csv, application/xml, text/xml' } });
    if (!response.ok) throw new Error(`Provider HTTP ${response.status}`);
    const body = await response.text();
    if (body.length > 2_000_000) throw new Error('Provider payload too large');
    return body;
  }
  async function refresh(): Promise<MacroResponse> {
    const clock = new Date(now());
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(clock);
    const year = Number(today.slice(0, 4));
    const symbols: MacroSymbol[] = ['VIX', 'VXN', 'US10Y'];
    const results = await Promise.allSettled(symbols.map(async symbol => {
      let points: DailyPoint[];
      if (symbol === 'US10Y') {
        // Include the previous year so January has history and a prior close.
        const years = await Promise.all([year - 1, year].map(async value => {
          const body = await download(`https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=${value}`);
          // On Jan 1 the current year can legitimately contain no records yet.
          if (value === year && !/<entry[\s>]/.test(body) && XMLValidator.validate(body) === true && Object.hasOwn(xml.parse(body), 'feed')) return [];
          return parseTreasury(body, today);
        }));
        points = observations(years.flat(), today);
      } else {
        points = parseCboe(await download(`https://cdn.cboe.com/api/global/us_indices/daily_prices/${symbol}_History.csv`), today);
      }
      const series = seriesSchema.parse({ symbol, points, retrievedAt: clock.toISOString(), refreshFailed: false });
      lastGood.set(symbol, series);
      return series;
    }));
    const series: MacroSeries[] = [];
    const unavailable: MacroSymbol[] = [];
    results.forEach((result, index) => {
      const symbol = symbols[index];
      if (result.status === 'fulfilled') series.push(result.value);
      else {
        const previous = lastGood.get(symbol);
        if (previous) series.push({ ...previous, refreshFailed: true });
        else unavailable.push(symbol);
      }
    });
    cached = { series, unavailable };
    expires = now() + (results.every(result => result.status === 'fulfilled') ? TTL : 60_000);
    return cached;
  }
  return () => {
    if (cached && now() < expires) return Promise.resolve(cached);
    pending ??= refresh().finally(() => { pending = undefined; });
    return pending;
  };
}

export const loadMarketData = createMarketLoader();
