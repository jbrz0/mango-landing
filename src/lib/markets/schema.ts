import { z } from 'zod';

// Treasury's daily par yield table. Without a year filter it opens on 1990, so link the current year (Treasury's own default link).
export const TREASURY_YIELD_URL = 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_yield_curve';
export const treasuryYieldUrl = (now = new Date()) => `${TREASURY_YIELD_URL}&field_tdr_date_value=${now.getUTCFullYear()}`;

export const macroDefinitions = {
  VIX: { label: 'Equity volatility', source: 'Cboe', sourceUrl: 'https://www.cboe.com/tradable_products/vix/vix_historical_data/', unit: 'points' },
  VXN: { label: 'Nasdaq volatility', source: 'Cboe', sourceUrl: 'https://www.cboe.com/tradable_products/vix/vix_historical_data/', unit: 'points' },
  US10Y: { label: 'US 10Y Treasury', source: 'US Treasury', sourceUrl: treasuryYieldUrl(), unit: 'percent' },
} as const;
export type MacroSymbol = keyof typeof macroDefinitions;
export const dateSchema = z.iso.date();
export const pointSchema = z.object({ date: dateSchema, value: z.number().finite().nonnegative() }).strict();
export const seriesSchema = z.object({
  symbol: z.enum(['VIX', 'VXN', 'US10Y']),
  points: z.array(pointSchema).min(2).max(800),
  retrievedAt: z.iso.datetime(),
  refreshFailed: z.boolean(),
}).strict().refine(series => series.points.every((point, index) => !index || point.date > series.points[index - 1].date), 'Dates must be unique and ascending');
export const macroResponseSchema = z.object({
  series: z.array(seriesSchema).max(3),
  unavailable: z.array(z.enum(['VIX', 'VXN', 'US10Y'])).max(3),
}).strict().refine(data => new Set([...data.series.map(s => s.symbol), ...data.unavailable]).size === 3 && data.series.length + data.unavailable.length === 3, 'Every symbol must have exactly one result');
export type DailyPoint = z.infer<typeof pointSchema>;
export type MacroSeries = z.infer<typeof seriesSchema>;
export type MacroResponse = z.infer<typeof macroResponseSchema>;

// A weekend or ordinary US holiday should not flag a daily observation as old.
export function dailyStatus(series: MacroSeries, now = Date.now()) {
  if (series.refreshFailed) return 'Refresh failed · Last known';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return Date.parse(today) - Date.parse(series.points.at(-1)!.date) > 5 * 86400_000 ? 'Last published observation' : 'Daily observation';
}
