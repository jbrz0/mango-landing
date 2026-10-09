import { z } from 'zod';
export const assets = [
  { symbol: '^GSPC', label: 'S&P 500', type: 'Cash index', group: 'Equities' },
  { symbol: '^IXIC', label: 'Nasdaq Composite', type: 'Cash index', group: 'Equities' },
  { symbol: '^RUT', label: 'Russell 2000', type: 'Cash index', group: 'Equities' },
  { symbol: 'VGK', label: 'Europe', type: 'Equity ETF proxy', group: 'Equities' },
  { symbol: 'EWJ', label: 'Japan', type: 'Equity ETF proxy', group: 'Equities' },
  { symbol: 'CL=F', label: 'WTI oil', type: 'Front-month futures', group: 'Commodities' },
  { symbol: 'GC=F', label: 'Gold', type: 'Front-month futures', group: 'Commodities' },
  { symbol: 'DX-Y.NYB', label: 'US dollar index', type: 'Index', group: 'FX' },
  { symbol: 'EURUSD=X', label: 'EUR / USD', type: 'FX spot', group: 'FX' },
  { symbol: 'GBPUSD=X', label: 'GBP / USD', type: 'FX spot', group: 'FX' },
  { symbol: 'BTC-USD', label: 'Bitcoin', type: 'Crypto spot', group: 'Crypto' },
  { symbol: 'ETH-USD', label: 'Ethereum', type: 'Crypto spot', group: 'Crypto' },
] as const;
const quote = z.object({ symbol: z.string(), price: z.number().positive(), changePct: z.number().finite().nullable(), updatedAt: z.iso.datetime(), history: z.array(z.number().finite().positive()).max(30), refreshFailed: z.boolean().default(false) });
export const headlineSchema = z.object({ id: z.string(), headline: z.string().min(1).max(300), url: z.url().refine(v => new URL(v).protocol === 'https:'), source: z.string(), publishedAt: z.iso.datetime().nullable(), tags: z.array(z.string()) });
export const globalSchema = z.object({ retrievedAt: z.iso.datetime(), quotes: z.array(quote).max(12), unavailable: z.array(z.string()), headlines: z.array(headlineSchema).max(36), newsUnavailable: z.array(z.string()), sentiment: z.object({ value: z.number().int().min(0).max(100), label: z.string(), updatedAt: z.iso.datetime() }).nullable() });
export type GlobalData = z.infer<typeof globalSchema>;
export type Headline = z.infer<typeof headlineSchema>;
