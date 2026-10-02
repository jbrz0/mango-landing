import { z } from 'zod';
import briefing from '../data/intel/current.json';
import { EQUITY_TTL, equityQuoteSchema, type EquityQuote, type EquityResponse } from '../src/lib/markets/equities.js';

const providerSchema = z.object({ chart: z.object({ error: z.null(), result: z.array(z.object({ meta: z.object({
  symbol: z.string(), currency: z.literal('USD'), instrumentType: z.enum(['EQUITY', 'ETF']),
  regularMarketPrice: z.number().finite().positive(), regularMarketTime: z.number().int().positive(),
  chartPreviousClose: z.number().finite().positive().optional(),
}) })).length(1) }) });

export function parseEquity(input: unknown, symbol: string, now = Date.now()): EquityQuote {
  const meta = providerSchema.parse(input).chart.result[0].meta;
  if (meta.symbol !== symbol || meta.regularMarketTime * 1000 > now + 5 * 60_000) throw new Error('Invalid quote identity or timestamp');
  return equityQuoteSchema.parse({
    symbol, price: meta.regularMarketPrice,
    // With range=1d, chartPreviousClose is the preceding regular-session close.
    changePct: meta.chartPreviousClose ? (meta.regularMarketPrice / meta.chartPreviousClose - 1) * 100 : null,
    currency: 'USD', source: 'Yahoo Finance', updatedAt: new Date(meta.regularMarketTime * 1000).toISOString(),
    retrievedAt: new Date(now).toISOString(), refreshFailed: false,
  });
}

export function createEquityLoader(symbols: string[], fetcher: typeof fetch = fetch, now = Date.now) {
  const allowed = [...new Set(symbols)].filter(symbol => /^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol)).slice(0, 90);
  const lastGood = new Map<string, EquityQuote>();
  let cached: EquityResponse | undefined;
  let expires = 0;
  let pending: Promise<EquityResponse> | undefined;
  async function refresh(): Promise<EquityResponse> {
    const results = await Promise.allSettled(allowed.map(async symbol => {
      const response = await fetcher(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`, {
        signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`Quote provider HTTP ${response.status}`);
      const body = await response.text();
      if (body.length > 500_000) throw new Error('Quote response too large');
      const quote = parseEquity(JSON.parse(body), symbol, now());
      lastGood.set(symbol, quote);
      return quote;
    }));
    const quotes: EquityQuote[] = [];
    const unavailable: string[] = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') quotes.push(result.value);
      else {
        const prior = lastGood.get(allowed[index]);
        if (prior) quotes.push({ ...prior, refreshFailed: true });
        else unavailable.push(allowed[index]);
      }
    });
    cached = { quotes, unavailable };
    expires = now() + (results.every(result => result.status === 'fulfilled') ? EQUITY_TTL : 5 * 60_000);
    return cached;
  }
  return () => {
    if (cached && now() < expires) return Promise.resolve(cached);
    pending ??= refresh().finally(() => { pending = undefined; });
    return pending;
  };
}

// Fixed by the published briefing. Request parameters cannot choose upstream URLs or symbols.
const nq = briefing.nq;
export const equitySymbols = nq ? [...new Set([...nq.megaCaps, ...nq.semiconductors, ...nq.premarket].map(item => item.symbol))] : [];
export const loadEquityData = createEquityLoader(equitySymbols);
