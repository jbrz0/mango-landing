import { aggregate, type Snapshot, type Book, type Exposure } from '../lib/gex/model';

export type WallsRange = number | 'levels';
type WallsBook = Pick<Book, 'contracts' | 'flips'> & { callWall: Exposure | null; putWall: Exposure | null };
const price = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const exposureLabel = (n: number, signed = false) => `${n < 0 ? '−' : signed && n > 0 ? '+' : ''}$${Math.abs(n) >= 1e9 ? (Math.abs(n) / 1e9).toFixed(2) + 'B' : (Math.abs(n) / 1e6).toFixed(1) + 'M'}`;

export function wallsGeometry(s: Snapshot, b: WallsBook, selection: WallsRange) {
  const markers = [
    ...(b.callWall ? [{ kind: 'call', label: 'CALL WALL', value: b.callWall.strike }] : []),
    ...(b.putWall ? [{ kind: 'put', label: 'PUT WALL', value: b.putWall.strike }] : []),
    { kind: 'spot', label: 'SPOT', value: s.spot },
    ...(b.flips.length ? [{ kind: 'flip', label: 'GAMMA FLIP', value: b.flips[0] }] : []),
  ];
  let low: number, high: number;
  if (selection === 'levels') {
    const values = markers.map(m => m.value);
    low = Math.min(s.spot * .99, ...values); high = Math.max(s.spot * 1.01, ...values);
    const pad = (high - low) * .18;
    low -= pad; high += pad;
  } else { low = s.spot * (1 - selection); high = s.spot * (1 + selection); }
  const step = high - low > 80 ? 5 : high - low > 42 ? 2 : 1;
  const rows = aggregate(b.contracts, s.spot, step).filter(r => r.strike >= low && r.strike <= high);
  const max = Math.max(1, ...rows.flatMap(r => [r.call, r.put]));
  const top = 42, bottom = 562, left = 62, right = 654, zero = (left + right) / 2;
  const y = (value: number) => top + (high - value) / (high - low) * (bottom - top);
  const annotations = markers.filter(m => m.value >= low && m.value <= high)
    .map(m => ({ ...m, y: y(m.value), labelY: y(m.value) })).sort((a, b) => a.y - b.y);
  // Keep exact-price lines in place; spread only their labels when levels are close.
  for (let i = 0; i < annotations.length; i++) annotations[i].labelY = Math.max(annotations[i].y, top + 14, i ? annotations[i - 1].labelY + 30 : 0);
  for (let i = annotations.length - 1; i >= 0; i--) annotations[i].labelY = Math.min(annotations[i].labelY, bottom - 14, i < annotations.length - 1 ? annotations[i + 1].labelY - 30 : bottom);
  return { markers, annotations, rows, low, high, step, max, top, bottom, left, right, zero, y };
}

export function wallsChart(s: Snapshot, b: WallsBook, selection: WallsRange) {
  const g = wallsGeometry(s, b, selection);
  const { top, bottom, left, right, zero, max, y } = g;
  const half = (right - left) / 2;
  const barHeight = Math.min(12, (bottom - top) / (g.high - g.low) * g.step * .7);
  const axisStep = g.step * (g.step === 1 ? 2 : 1);
  const ticks = Array.from({ length: Math.max(0, Math.floor(g.high / axisStep) - Math.ceil(g.low / axisStep) + 1) }, (_, i) => (Math.ceil(g.low / axisStep) + i) * axisStep);
  return `<div class="gex-walls-levels" aria-label="Key levels">${g.markers.map(m => `<div class="gex-wall-level is-${m.kind}"><span>${m.label}</span><strong>$${price(m.value)}</strong><small>${m.value >= s.spot ? '+' : '−'}${(Math.abs(m.value / s.spot - 1) * 100).toFixed(2)}%${m.value < g.low || m.value > g.high ? ' · outside view' : ''}</small></div>`).join('')}</div>
<div class="gex-walls-scroll" tabindex="0" role="region" aria-label="Scrollable call and put walls chart">
<svg class="gex-walls" viewBox="0 0 846 610" role="group" aria-labelledby="gex-walls-title gex-walls-desc">
<title id="gex-walls-title">QQQ call and put walls</title><desc id="gex-walls-desc">Put gamma exposure extends left from zero, call gamma exposure right, on the same dollar scale per 1% QQQ move. Exact price lines mark key levels. Select a strike to inspect its exposure. Bars combine the nearest $${g.step} strike bucket.</desc>
<text x="${left}" y="19" class="walls-heading">STRIKE</text><text x="${zero - 12}" y="19" text-anchor="end" class="walls-put walls-heading">← PUTS</text><text x="${zero + 12}" y="19" class="walls-call walls-heading">CALLS →</text><text x="682" y="19" class="walls-heading">KEY LEVELS</text>
${[-1,-.5,0,.5,1].map(t => `<line class="walls-grid ${t === 0 ? 'walls-zero' : ''}" x1="${zero + half*t}" x2="${zero + half*t}" y1="${top}" y2="${bottom}"/><text class="walls-axis" x="${zero+half*t}" y="588" text-anchor="${t === -1 ? 'start' : t === 1 ? 'end' : 'middle'}">${t === 0 ? '0' : exposureLabel(max*t,true)}</text>`).join('')}
${ticks.map(t => `<line class="walls-grid" x1="${left}" x2="${right}" y1="${y(t)}" y2="${y(t)}"/><text class="walls-axis" x="50" y="${y(t)+3}" text-anchor="end">${price(t)}</text>`).join('')}
${g.rows.map(r => { const isCall = b.callWall && Math.round(b.callWall.strike / g.step) * g.step === r.strike;
  const isPut = b.putWall && Math.round(b.putWall.strike / g.step) * g.step === r.strike;
  return `<g class="walls-strike" tabindex="0" role="button" data-wall-strike="${r.strike}" data-wall-call="${r.call}" data-wall-put="${r.put}" data-wall-net="${r.net}" aria-label="$${price(r.strike)} bucket. Calls ${exposureLabel(r.call)}, puts ${exposureLabel(r.put)}, net ${exposureLabel(r.net,true)}"><title>$${price(r.strike)} · Calls ${exposureLabel(r.call)} · Puts ${exposureLabel(r.put)} · Net ${exposureLabel(r.net,true)}</title><rect class="walls-hit" x="${left}" y="${y(r.strike)-Math.max(barHeight,18)/2}" width="${right-left}" height="${Math.max(barHeight,18)}"/><rect class="walls-bar walls-put-bar ${isPut ? 'walls-wall-bar' : ''}" x="${zero-r.put/max*half}" y="${y(r.strike)-barHeight/2}" width="${r.put/max*half}" height="${barHeight}"/><rect class="walls-bar walls-call-bar ${isCall ? 'walls-wall-bar' : ''}" x="${zero}" y="${y(r.strike)-barHeight/2}" width="${r.call/max*half}" height="${barHeight}"/></g>`;
}).join('')}
${g.annotations.map(m => `<g class="walls-marker is-${m.kind}" data-wall-marker="${m.kind}" data-price="${m.value}"><line class="walls-level-line" x1="${left}" x2="${right}" y1="${m.y}" y2="${m.y}"/><path class="walls-connector" d="M ${right} ${m.y} L ${right+9} ${m.y} L 676 ${m.labelY} H 682"/><rect class="walls-level-box" x="682" y="${m.labelY-12}" width="154" height="24" rx="2"/><text class="walls-level-name" x="690" y="${m.labelY+3}">${m.label}</text><text class="walls-level-price" x="828" y="${m.labelY+3}" text-anchor="end">${price(m.value)}</text></g>`).join('')}
</svg></div><div class="gex-walls-caption"><span>PUTS − / CALLS + · ${exposureLabel(max)} EACH SIDE</span><span>$${g.step} STRIKE BUCKETS · EXACT LEVEL LINES</span></div>`;
}
