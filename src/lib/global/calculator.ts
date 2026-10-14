export const contracts = {
  MNQ: { name: 'Micro E-mini Nasdaq-100', point: 2, tick: 0.25 },
  NQ: { name: 'E-mini Nasdaq-100', point: 20, tick: 0.25 },
  MES: { name: 'Micro E-mini S&P 500', point: 5, tick: 0.25 },
  ES: { name: 'E-mini S&P 500', point: 50, tick: 0.25 },
  MGC: { name: 'Micro Gold', point: 10, tick: 0.1 },
  GC: { name: 'Gold', point: 100, tick: 0.1 },
  MCL: { name: 'Micro WTI Crude Oil', point: 100, tick: 0.01 },
  CL: { name: 'WTI Crude Oil', point: 1000, tick: 0.01 },
  BTC: { name: 'Bitcoin', point: 5, tick: 5 },
  MBT: { name: 'Micro Bitcoin', point: 0.1, tick: 5 },
} as const;
export type Contract = keyof typeof contracts;
export function movePnl(symbol: Contract, quantity: number, move: number, units: 'points' | 'ticks', direction: 1 | -1 = 1) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100_000 || !Number.isFinite(move)) throw new Error('Enter a positive whole contract quantity and a valid move.');
  const spec = contracts[symbol];
  const points = units === 'ticks' ? move * spec.tick : move;
  const pnl = quantity * points * spec.point * direction;
  if (!Number.isFinite(pnl)) throw new Error('The position is too large to calculate.');
  return { pnl, points, ticks: points / spec.tick };
}
export function simulatePosition(symbol: Contract, quantity: number, entry: number, changes: { quantity: number; price: number }[], direction: 1 | -1) {
  if (!Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(entry) || entry <= 0) throw new Error('Enter a positive whole starting quantity and entry price.');
  let average = entry, realized = 0;
  for (const change of changes) {
    if (!Number.isInteger(change.quantity) || !Number.isFinite(change.price) || change.price <= 0) throw new Error('Each add or reduction needs a whole quantity and positive price.');
    if (quantity + change.quantity < 1) throw new Error('Keep at least one contract open. Reductions cannot exceed the position.');
    if (change.quantity > 0) average = (quantity * average + change.quantity * change.price) / (quantity + change.quantity);
    else realized += -change.quantity * (change.price - average) * direction * contracts[symbol].point;
    quantity += change.quantity;
  }
  if (![average, realized].every(Number.isFinite)) throw new Error('The position is too large to calculate.');
  return { quantity, average, realized };
}
