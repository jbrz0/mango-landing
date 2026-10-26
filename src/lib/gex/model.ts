import { z } from 'zod';

const finite = z.number().finite();
export const contractSchema = z.object({ strike: finite.positive(), expiry: z.iso.date(), side: z.enum(['C', 'P']), gamma: finite.nonnegative(), iv: finite.positive(), oi: finite.int().nonnegative() });
export const snapshotSchema = z.object({
  version: z.literal(1), symbol: z.literal('QQQ'), source: z.literal('Cboe delayed'), retrievedAt: z.iso.datetime(), chainAsOf: z.iso.datetime(), quoteAsOf: z.iso.datetime(),
  spot: finite.positive(), open: finite.positive(), high: finite.positive(), low: finite.positive(), previousClose: finite.positive(),
  contracts: z.array(contractSchema).min(10), rejected: z.number().int().nonnegative(),
}).refine(s => s.high >= s.low, 'Invalid session range').superRefine((s, ctx) => {
  const keys = s.contracts.map(c => `${c.expiry}:${c.side}:${c.strike}`);
  if (new Set(keys).size !== keys.length) ctx.addIssue({ code: 'custom', message: 'Duplicate option series' });
  if (Math.max(+new Date(s.chainAsOf), +new Date(s.quoteAsOf)) > +new Date(s.retrievedAt) + 5 * 60_000) ctx.addIssue({ code: 'custom', message: 'Source time is later than capture' });
});
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
export function aggregate(contracts: Contract[], spot: number, step = 0): Exposure[] {
  const rows = new Map<number, Exposure>();
  for (const c of contracts) {
    const strike = step ? Math.round(c.strike / step) * step : c.strike;
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
function gammaScenario(contracts: Contract[], base: number, asOf: string) {
  const time = +new Date(asOf);
  const prepared = contracts.filter(c => c.gamma > 0 && c.oi > 0 && expiryTime(c.expiry) > time).map(c => {
    const t = Math.max((expiryTime(c.expiry) - time) / (365.25 * 86400_000), 1 / (365.25 * 24 * 60));
    const volTime = c.iv * Math.sqrt(t);
    const weight = exposure(c, base);
    return { sign: c.side === 'C' ? 1 : -1, weight, logWeight: Math.log(weight), volTime, d0: (Math.log(base / c.strike) + c.iv * c.iv * t / 2) / volTime };
  });
  return (price: number) => {
    const move = Math.log(price / base);
    let net = 0;
    for (const c of prepared) {
      const delta = move / c.volTime;
      // Evaluate the final exposure in log space, avoiding overflow in an intermediate gamma ratio.
      net += c.sign * (price === base ? c.weight : Math.exp(c.logWeight + move - c.d0 * delta - delta * delta / 2));
    }
    return net;
  };
}
export function netAt(contracts: Contract[], base: number, price: number, asOf: string) {
  return gammaScenario(contracts, base, asOf)(price);
}
export function gammaFlips(contracts: Contract[], spot: number, asOf: string) {
  const net = gammaScenario(contracts, spot, asOf);
  const flips: number[] = [];
  // Include exact spot/strikes as well as a uniform grid. The curve need not be monotone.
  const grid = [...new Set([spot, ...Array.from({ length: 401 }, (_, i) => spot * (.8 + .4 * i / 400)), ...contracts.map(c => c.strike).filter(k => k >= spot * .8 && k <= spot * 1.2)])].sort((a, b) => a - b);
  let previousPrice = grid[0], previous = net(previousPrice), zero: number | null = null;
  for (const price of grid.slice(1)) {
    const value = net(price);
    if (value === 0) { zero ??= price; continue; }
    if (previous !== 0 && Math.sign(previous) !== Math.sign(value)) {
      let lo = previousPrice, hi = price, left = previous;
      for (let n = 0; zero === null && n < 26; n++) {
        const mid = (lo + hi) / 2, v = net(mid);
        if (v === 0) { zero = mid; break; }
        if (Math.sign(left) !== Math.sign(v)) hi = mid; else { lo = mid; left = v; }
      }
      flips.push(zero ?? (lo + hi) / 2);
    }
    previous = value; previousPrice = price; zero = null;
  }
  return flips.sort((a, b) => Math.abs(a - spot) - Math.abs(b - spot));
}
export function analyze(snapshot: Snapshot, days: number) {
  const asOf = +new Date(snapshot.chainAsOf);
  const lastDate = new Date(`${exchangeDate(snapshot.chainAsOf)}T12:00:00Z`);
  lastDate.setUTCDate(lastDate.getUTCDate() + days);
  const cutoff = lastDate.toISOString().slice(0, 10);
  const contracts = snapshot.contracts.filter(c => c.gamma > 0 && c.oi > 0 && expiryTime(c.expiry) > asOf && c.expiry <= cutoff);
  const levels = aggregate(contracts, snapshot.spot);
  const call = levels.reduce((s, r) => s + r.call, 0), put = levels.reduce((s, r) => s + r.put, 0);
  const near = levels.filter(r => Math.abs(r.strike / snapshot.spot - 1) <= .1);
  const callWall = near.filter(r => r.call > 0).sort((a, b) => b.call - a.call)[0] ?? null;
  const putWall = near.filter(r => r.put > 0).sort((a, b) => b.put - a.put)[0] ?? null;
  const flips = contracts.length ? gammaFlips(contracts, snapshot.spot, snapshot.chainAsOf) : [];
  const net = call - put, gross = call + put;
  const nearestExpiry = contracts.map(c => c.expiry).sort()[0] ?? null;
  const nearGross = contracts.filter(c => c.expiry === nearestExpiry).reduce((s, c) => s + exposure(c, snapshot.spot), 0);
  const expiries = [...new Set(contracts.map(c => c.expiry))].sort().map(expiry => {
    const rows = aggregate(contracts.filter(c => c.expiry === expiry), snapshot.spot);
    const gross = rows.reduce((sum, r) => sum + r.gross, 0), net = rows.reduce((sum, r) => sum + r.net, 0);
    return { expiry, gross, net };
  });
  const largestExpiry = [...expiries].sort((a, b) => b.gross - a.gross)[0] ?? null;
  const major = near.filter(r => r.gross >= Math.max(0, ...near.map(r => r.gross)) * .2);
  const upside = major.filter(r => r.strike > snapshot.spot).sort((a, b) => a.strike - b.strike);
  const downside = major.filter(r => r.strike < snapshot.spot).sort((a, b) => b.strike - a.strike);
  return { contracts, levels, call, put, net, gross, callWall, putWall, flips, nearestExpiry, expiryShare: gross ? nearGross / gross : 0, expiries, largestExpiry, upside, downside, regime: gross === 0 || Math.abs(net / gross) < .03 ? 'Balanced' : net > 0 ? 'Positive' : 'Negative' };
}

export function freshness(s: Snapshot, now = Date.now()) {
  const age = now - +new Date(s.retrievedAt);
  const local = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now));
  const part = (type: string) => local.find(p => p.type === type)?.value ?? '';
  const minutes = Number(part('hour')) * 60 + Number(part('minute'));
  const session = !['Sat', 'Sun'].includes(part('weekday')) && minutes >= 570 && minutes < 960;
  const sourceAge = now - Math.min(+new Date(s.quoteAsOf), +new Date(s.chainAsOf));
  if (age > 4 * 86400_000 || sourceAge > 4 * 86400_000 || (session && (age > 4 * 3600_000 || sourceAge > 4 * 3600_000))) return { label: 'LAST SAVED SNAPSHOT', stale: true };
  return { label: session ? 'SCHEDULED SNAPSHOT' : 'OUTSIDE REGULAR HOURS', stale: false };
}
