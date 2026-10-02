import { z } from 'zod';

const symbol = z.string().regex(/^[A-Z][A-Z0-9.-]{0,14}$/);
export const equityQuoteSchema = z.object({
  symbol, price: z.number().finite().positive(), changePct: z.number().finite().nullable(),
  currency: z.literal('USD'), source: z.literal('Yahoo Finance'),
  updatedAt: z.iso.datetime(), retrievedAt: z.iso.datetime(), refreshFailed: z.boolean(),
});
export const equityResponseSchema = z.object({ quotes: z.array(equityQuoteSchema).max(90), unavailable: z.array(symbol).max(90) });
export type EquityQuote = z.infer<typeof equityQuoteSchema>;
export type EquityResponse = z.infer<typeof equityResponseSchema>;
export const EQUITY_TTL = 15 * 60_000;
export function equityStatus(quote: EquityQuote, now = Date.now()) {
  if (quote.refreshFailed || now - Date.parse(quote.retrievedAt) > 2 * EQUITY_TTL) return 'Refresh delayed · Last known';
  if (now - Date.parse(quote.updatedAt) > 5 * 86400_000) return 'Stale price';
  return 'Regular session';
}
