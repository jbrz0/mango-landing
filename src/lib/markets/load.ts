import { macroResponseSchema, type MacroResponse } from './schema';

let cached: MacroResponse | undefined;
let expires = 0;
let pending: Promise<MacroResponse> | undefined;
export function loadMacro(force = false): Promise<MacroResponse> {
  if (!force && cached && Date.now() < expires) return Promise.resolve(cached);
  pending ??= fetch('/api/macro', { signal: AbortSignal.timeout(15_000) }).then(async response => {
    if (!response.ok) throw new Error('Macro feed unavailable');
    const data = macroResponseSchema.parse(await response.json());
    // Retain individual last-known series if only one upstream source fails.
    for (const symbol of data.unavailable) {
      const prior = cached?.series.find(series => series.symbol === symbol);
      if (prior) data.series.push({ ...prior, refreshFailed: true });
    }
    data.unavailable = data.unavailable.filter(symbol => !data.series.some(series => series.symbol === symbol));
    cached = data; expires = Date.now() + 5 * 60_000;
    return data;
  }).catch(error => {
    if (!cached) throw error;
    cached = { ...cached, series: cached.series.map(series => ({ ...series, refreshFailed: true })) };
    expires = Date.now() + 60_000;
    return cached;
  }).finally(() => { pending = undefined; });
  return pending;
}
