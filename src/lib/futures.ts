import { contracts, movePnl, type Contract } from './global/calculator';

export const futuresSymbols: Contract[] = ['NQ', 'ES', 'MNQ', 'MES', 'GC', 'MGC', 'CL', 'MCL', 'BTC', 'MBT'];
export type CalculationSource = 'points' | 'money';

export function contractFromUrl(url: URL): Contract {
  const match = (value: string | null) => futuresSymbols.find(symbol => symbol === value?.trim().toUpperCase());
  return match(url.hash.slice(1)) ?? match(url.searchParams.get('contract')) ?? 'MNQ';
}

// Accept US-style decimals and pasted thousands separators without coercing blanks to zero.
export function parseFuturesNumber(raw: string, currency = false): number | null {
  const value = currency ? raw.trim().replace(/^\$/, '') : raw.trim();
  if (!/^-?(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d*)?|\.\d+)$/.test(value)) return null;
  const number = Number(value.replaceAll(',', ''));
  return Number.isFinite(number) ? number : null;
}

export function calculateFutures(symbol: Contract, quantity: number, source: CalculationSource, value: number) {
  if (!Number.isFinite(value)) throw new Error('Enter a valid number.');
  // Use the same quantity validation and multipliers as the existing position calculator.
  const dollarsPerPoint = movePnl(symbol, quantity, 1, 'points').pnl;
  const points = source === 'points' ? value : value / dollarsPerPoint;
  const money = source === 'money' ? value : movePnl(symbol, quantity, value, 'points').pnl;
  if (![points, money].every(number => Number.isFinite(number) && Math.abs(number) <= Number.MAX_SAFE_INTEGER)) {
    throw new Error('These values are too large to calculate accurately.');
  }
  return { points, money };
}

export { contracts };
