import { z } from 'zod';

const finite = z.number().finite();
export const contractSchema = z.object({ strike: finite.positive(), expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), side: z.enum(['C', 'P']), gamma: finite.nonnegative(), iv: finite.positive(), oi: finite.nonnegative() });
export const snapshotSchema = z.object({
  version: z.literal(1), symbol: z.literal('QQQ'), source: z.literal('Cboe delayed'), retrievedAt: z.iso.datetime(), chainAsOf: z.iso.datetime(), quoteAsOf: z.iso.datetime(),
  spot: finite.positive(), open: finite.positive(), high: finite.positive(), low: finite.positive(), previousClose: finite.positive(),
  contracts: z.array(contractSchema).min(10), rejected: z.number().int().nonnegative(),
}).refine(s => s.high >= s.low, 'Invalid session range');
export type Snapshot = z.infer<typeof snapshotSchema>;
export type Contract = z.infer<typeof contractSchema>;
export type Exposure = { strike: number; call: number; put: number; net: number; gross: number };
export type Book = ReturnType<typeof analyze>;

// Convert an exchange-local timestamp with US daylight saving; never interpret it in the visitor's timezone.
export function easternTimestamp(input: string): string {
  const local = new Date(input.replace(' ', 'T') + 'Z');
  if (!Number.isFinite(+local)) throw new Error('Invalid exchange timestamp');
  let utc = +local + 5 * 3600_000;
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' }).formatToParts(utc);
    const offset = Number(parts.find(p => p.type === 'timeZoneName')!.value.replace('GMT', ''));
    utc = +local - offset * 3600_000;
  }
  return new Date(utc).toISOString();
}
export function exchangeDate(iso: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}
const expiryTimes = new Map<string, number>();
export function expiryTime(expiry: string) {
  let time = expiryTimes.get(expiry);
  if (time === undefined) { time = +new Date(easternTimestamp(`${expiry}T16:00:00`)); expiryTimes.set(expiry, time); }
  return time;
}
export function exposure(c: Contract, spot: number) { return c.gamma * c.oi * 100 * spot * spot * 0.01; }
function row(strike: number): Exposure { return { strike, call: 0, put: 0, net: 0, gross: 0 }; }
export function aggregate(contracts: Contract[], spot: number, step = 1): Exposure[] {
  const rows = new Map<number, Exposure>();
  for (const c of contracts) {
    const strike = Math.round(c.strike / step) * step;
    const r = rows.get(strike) ?? row(strike);
    const gex = exposure(c, spot);
    if (c.side === 'C') r.call += gex; else r.put += gex;
    r.net = r.call - r.put; r.gross = r.call + r.put;
    rows.set(strike, r);
  }
  return [...rows.values()].sort((a, b) => b.strike - a.strike);
}
// Reprice gamma with constant IV and zero carry, anchored to the published gamma at spot.
// Anchoring makes the hypothetical curve and displayed net exposure agree exactly at spot.
export function netAt(contracts: Contract[], base: number, price: number, asOf: string) {
  let net = 0;
  for (const c of contracts) {
    const t = Math.max((expiryTime(c.expiry) - +new Date(asOf)) / (365.25 * 86400_000), 1 / (365.25 * 24 * 60));
    const volTime = c.iv * Math.sqrt(t);
    const d0 = (Math.log(base / c.strike) + c.iv * c.iv * t / 2) / volTime;
    const d1 = (Math.log(price / c.strike) + c.iv * c.iv * t / 2) / volTime;
    const ratio = base / price * Math.exp(Math.max(-700, Math.min(700, (d0 * d0 - d1 * d1) / 2)));
    net += (c.side === 'C' ? 1 : -1) * exposure(c, price) * ratio;
  }
  return net;
}
export function gammaFlips(contracts: Contract[], spot: number, asOf: string) {
  const flips: number[] = [];
  let previousPrice = spot * .8;
  let previous = netAt(contracts, spot, previousPrice, asOf);
  for (let i = 1; i <= 160; i++) {
    const price = spot * (.8 + .4 * i / 160);
    const value = netAt(contracts, spot, price, asOf);
    if (previous * value < 0) {
      let lo = previousPrice, hi = price, left = previous;
      for (let n = 0; n < 22; n++) {
        const mid = (lo + hi) / 2, v = netAt(contracts, spot, mid, asOf);
        if (left * v <= 0) hi = mid; else { lo = mid; left = v; }
      }
      flips.push((lo + hi) / 2);
    }
    previous = value; previousPrice = price;
  }
  return flips.sort((a, b) => Math.abs(a - spot) - Math.abs(b - spot));
}
export function analyze(snapshot: Snapshot, days: number) {
  const asOf = +new Date(snapshot.chainAsOf);
  const contracts = snapshot.contracts.filter(c => expiryTime(c.expiry) > asOf && expiryTime(c.expiry) <= asOf + days * 86400_000);
  const levels = aggregate(contracts, snapshot.spot);
  const call = levels.reduce((s, r) => s + r.call, 0), put = levels.reduce((s, r) => s + r.put, 0);
  const near = levels.filter(r => Math.abs(r.strike / snapshot.spot - 1) <= .1);
  const callWall = near.filter(r => r.call > 0).sort((a, b) => b.call - a.call)[0] ?? null;
  const putWall = near.filter(r => r.put > 0).sort((a, b) => b.put - a.put)[0] ?? null;
  const flips = contracts.length ? gammaFlips(contracts, snapshot.spot, snapshot.chainAsOf) : [];
  const net = call - put, gross = call + put;
  const nearestExpiry = contracts.map(c => c.expiry).sort()[0] ?? null;
  const nearGross = contracts.filter(c => c.expiry === nearestExpiry).reduce((s, c) => s + exposure(c, snapshot.spot), 0);
  return { contracts, levels, call, put, net, gross, callWall, putWall, flips, nearestExpiry, expiryShare: gross ? nearGross / gross : 0, regime: gross === 0 || Math.abs(net / gross) < .03 ? 'Balanced' : net > 0 ? 'Positive' : 'Negative' };
}
