import { z } from 'zod';
import { XMLParser } from 'fast-xml-parser';
import { assets, globalSchema, headlineSchema, type GlobalData, type Headline } from '../src/lib/global/schema.js';
const yahooSchema = z.object({ chart: z.object({ error: z.null(), result: z.array(z.object({ meta: z.object({ symbol: z.string(), regularMarketPrice: z.number().finite().positive(), regularMarketTime: z.number().int().positive(), exchangeTimezoneName: z.string() }), timestamp: z.array(z.number().int().positive()), indicators: z.object({ quote: z.array(z.object({ close: z.array(z.number().finite().positive().nullable()) })).min(1) }) })).length(1) }) });
export function parseGlobalQuote(input: unknown, symbol: string, now = Date.now()) {
  const data = yahooSchema.parse(input).chart.result[0];
  if (data.meta.symbol !== symbol || data.meta.regularMarketTime * 1000 > now + 300_000) throw new Error('Invalid quote identity or time');
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: data.meta.exchangeTimezoneName, year: 'numeric', month: '2-digit', day: '2-digit' });
  const quoteDate = date.format(data.meta.regularMarketTime * 1000);
  const bars = data.timestamp.flatMap((stamp, i) => {
    const close = data.indicators.quote[0].close[i];
    return close != null && stamp * 1000 <= now + 300_000 ? [{ date: date.format(stamp * 1000), close }] : [];
  });
  const history = bars.map(bar => bar.close).slice(-21);
  // The last daily bar can be missing. Find a completed prior day by date instead of array position.
  const prior = bars.filter(bar => bar.date < quoteDate).at(-1)?.close ?? null;
  return { symbol, price: data.meta.regularMarketPrice, changePct: prior ? (data.meta.regularMarketPrice / prior - 1) * 100 : null, updatedAt: new Date(data.meta.regularMarketTime * 1000).toISOString(), history };
}
const feeds = [
  { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', tags: ['World'] },
  { name: 'BBC Business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml', tags: ['Economy'] },
  { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', tags: ['Crypto'] },
] as const;
export function parseHeadlines(body: string, source: string, tags: string[], now = Date.now()): Headline[] {
  const parsed = new XMLParser({ ignoreAttributes: true, processEntities: false }).parse(body);
  const items = parsed.rss?.channel?.item;
  if (!items) throw new Error('Unexpected RSS format');
  return (Array.isArray(items) ? items : [items]).slice(0, 10).flatMap((item: Record<string, unknown>, index: number) => {
    const published = typeof item.pubDate === 'string' ? Date.parse(item.pubDate) : NaN;
    if (Number.isFinite(published) && published > now + 300_000) return [];
    const headline = typeof item.title === 'string' ? item.title.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').slice(0, 300) : '';
    const geopolitical = /\b(war|conflict|iran|israel|gaza|lebanon|russia|ukraine|china|taiwan|nuclear|ceasefire|missile|military|sanctions?|tariffs?|trade|election|opec|hormuz)\b/i.test(headline);
    const economic = /\b(markets?|stocks?|bonds?|oil|energy|gold|economy|economic|inflation|rates?|central bank|fed|growth|bank|banking|debt|currency|dollar|exports?)\b/i.test(headline);
    // Keep the global desk focused on economic and geopolitical transmission rather than general world news.
    if (source === 'BBC World' && !geopolitical && !economic) return [];
    const categories = [...new Set([...tags, ...(geopolitical ? ['Geopolitics'] : []), ...(economic ? ['Macro'] : [])])];
    const result = headlineSchema.safeParse({ id: `${source}-${index}`, headline, url: item.link, source, publishedAt: Number.isFinite(published) ? new Date(published).toISOString() : null, tags: categories });
    return result.success ? [result.data] : [];
  });
}
export function createGlobalLoader(fetcher: typeof fetch = fetch, now = Date.now) {
  let cached: GlobalData | undefined, expires = 0, pending: Promise<GlobalData> | undefined;
  const lastQuotes = new Map<string, GlobalData['quotes'][number]>();
  async function download(url: string) {
    const response = await fetcher(url, { signal: AbortSignal.timeout(9000), headers: { Accept: 'application/json, application/rss+xml, application/xml' } });
    if (!response.ok) throw new Error(`Provider HTTP ${response.status}`);
    const body = await response.text();
    if (body.length > 2_000_000) throw new Error('Provider payload too large');
    return body;
  }
  async function refresh() {
    const [quotes, news, sentiment] = await Promise.all([
      Promise.allSettled(assets.map(async asset => {
        const quote = { ...parseGlobalQuote(JSON.parse(await download(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(asset.symbol)}?interval=1d&range=1mo`)), asset.symbol, now()), refreshFailed: false };
        lastQuotes.set(asset.symbol, quote);
        return quote;
      })),
      Promise.allSettled(feeds.map(async feed => parseHeadlines(await download(feed.url), feed.name, [...feed.tags], now()))),
      download('https://api.alternative.me/fng/?limit=1').then(body => {
        const data = z.object({ data: z.array(z.object({ value: z.coerce.number().int().min(0).max(100), value_classification: z.string(), timestamp: z.coerce.number().int().positive() })).min(1) }).parse(JSON.parse(body)).data[0];
        if (data.timestamp * 1000 > now() + 300_000) throw new Error('Future sentiment');
        return { value: data.value, label: data.value_classification, updatedAt: new Date(data.timestamp * 1000).toISOString() };
      }).catch(() => null),
    ]);
    cached = globalSchema.parse({ retrievedAt: new Date(now()).toISOString(), quotes: quotes.flatMap((r, i) => r.status === 'fulfilled' ? [r.value] : lastQuotes.has(assets[i].symbol) ? [{ ...lastQuotes.get(assets[i].symbol)!, refreshFailed: true }] : []), unavailable: quotes.flatMap((r, i) => r.status === 'rejected' && !lastQuotes.has(assets[i].symbol) ? [assets[i].symbol] : []), headlines: news.flatMap(r => r.status === 'fulfilled' ? r.value : []).sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '')).slice(0, 30), newsUnavailable: news.flatMap((r, i) => r.status === 'rejected' ? [feeds[i].name] : []), sentiment });
    expires = now() + (cached.unavailable.length || cached.quotes.some(q => q.refreshFailed) || cached.newsUnavailable.length || !sentiment ? 60_000 : 15 * 60_000);
    return cached;
  }
  return () => { if (cached && now() < expires) return Promise.resolve(cached); pending ??= refresh().finally(() => { pending = undefined; }); return pending; };
}
export const loadGlobalData = createGlobalLoader();
