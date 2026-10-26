import { aggregate, type Snapshot, type Book, type Exposure } from '../lib/gex/model';

export type WallsRange = number | 'levels';
type WallsBook = Pick<Book, 'contracts' | 'flips'> & { callWall: Exposure | null; putWall: Exposure | null };
const price = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const exposureLabel = (n: number, signed = false) => `${n < 0 ? '−' : signed && n > 0 ? '+' : ''}$${Math.abs(n) >= 1e9 ? (Math.abs(n) / 1e9).toFixed(2) + 'B' : Math.abs(n) >= 1e6 ? (Math.abs(n) / 1e6).toFixed(1) + 'M' : Math.abs(n) >= 1e3 ? (Math.abs(n) / 1e3).toFixed(1) + 'K' : Math.abs(n).toFixed(0)}`;

export function wallsGeometry(s: Snapshot, b: WallsBook, selection: WallsRange, width = 846) {
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
  const compact = width < 820;
  const top = 42, bottom = 562, left = 76, right = width - (compact ? 12 : 248), zero = (left + right) / 2;
  const y = (value: number) => top + (high - value) / (high - low) * (bottom - top);
  const annotations = markers.filter(m => m.value >= low && m.value <= high)
    .map(m => ({ ...m, y: y(m.value), labelY: y(m.value) })).sort((a, b) => a.y - b.y);
  // Keep exact-price lines in place; spread only their labels when levels are close.
  for (let i = 0; i < annotations.length; i++) annotations[i].labelY = Math.max(annotations[i].y, top + 16, i ? annotations[i - 1].labelY + 34 : 0);
  for (let i = annotations.length - 1; i >= 0; i--) annotations[i].labelY = Math.min(annotations[i].labelY, bottom - 16, i < annotations.length - 1 ? annotations[i + 1].labelY - 34 : bottom);
  return { markers, annotations, rows, low, high, step, max, top, bottom, left, right, zero, y, compact, width };
}

export function wallsChart(s: Snapshot, b: WallsBook, selection: WallsRange, width = 846) {
  const g = wallsGeometry(s, b, selection, Math.max(240, Math.floor(width)));
  const { top, bottom, left, right, zero, max, y } = g;
  const half = (right - left) / 2;
  const barHeight = Math.min(12, (bottom - top) / (g.high - g.low) * g.step * .7);
  const axisStep = g.step * (g.step === 1 ? 2 : 1);
  const ticks = Array.from({ length: Math.max(0, Math.floor(g.high / axisStep) - Math.ceil(g.low / axisStep) + 1) }, (_, i) => (Math.ceil(g.low / axisStep) + i) * axisStep);
  return `<div class="gex-walls-levels" aria-label="Key levels">${g.markers.map(m => `<div class="gex-wall-level is-${m.kind}"><span>${m.label}</span><strong>$${price(m.value)}</strong><small>${m.value >= s.spot ? '+' : '−'}${(Math.abs(m.value / s.spot - 1) * 100).toFixed(2)}%${m.value < g.low || m.value > g.high ? ' · outside view' : ''}</small></div>`).join('')}</div>
<div class="gex-walls-scroll" tabindex="0" role="region" aria-label="Scrollable call and put walls chart">
<svg class="gex-walls ${g.compact ? 'is-compact' : ''}" viewBox="0 0 ${g.width} 610" role="group" aria-labelledby="gex-walls-title gex-walls-desc">
<title id="gex-walls-title">QQQ call and put walls</title><desc id="gex-walls-desc">Call gamma exposure extends left from zero, put gamma exposure right, on the same dollar scale per 1% QQQ move. Exact price lines mark key levels. Select a strike to inspect its exposure. Bars combine the nearest $${g.step} strike bucket.</desc>
<text x="14" y="19" class="walls-heading">STRIKE</text><text x="${zero - 12}" y="19" text-anchor="end" class="walls-call walls-heading">← CALLS</text><text x="${zero + 12}" y="19" class="walls-put walls-heading">PUTS →</text><text x="${right + 28}" y="19" class="walls-heading walls-level-heading">KEY LEVELS</text>
${(g.width < 600 ? [-1,0,1] : [-1,-.5,0,.5,1]).map(t => `<line class="walls-grid ${t === 0 ? 'walls-zero' : ''}" x1="${zero + half*t}" x2="${zero + half*t}" y1="${top}" y2="${bottom}"/><text class="walls-axis" x="${zero+half*t}" y="588" text-anchor="${t === -1 ? 'start' : t === 1 ? 'end' : 'middle'}">${t === 0 ? '0' : exposureLabel(-max*t,true)}</text>`).join('')}
${ticks.map(t => `<line class="walls-grid" x1="${left}" x2="${right}" y1="${y(t)}" y2="${y(t)}"/><text class="walls-axis" x="${left - 12}" y="${y(t)+5}" text-anchor="end">${price(t)}</text>`).join('')}
${g.rows.map(r => { const isCall = b.callWall && Math.round(b.callWall.strike / g.step) * g.step === r.strike;
  const isPut = b.putWall && Math.round(b.putWall.strike / g.step) * g.step === r.strike;
  return `<g class="walls-strike" tabindex="0" role="button" data-wall-strike="${r.strike}" data-wall-call="${r.call}" data-wall-put="${r.put}" data-wall-net="${r.net}" aria-label="$${price(r.strike)} bucket. Calls ${exposureLabel(r.call)}, puts ${exposureLabel(r.put)}, net ${exposureLabel(r.net,true)}"><title>$${price(r.strike)} · Calls ${exposureLabel(r.call)} · Puts ${exposureLabel(r.put)} · Net ${exposureLabel(r.net,true)}</title><rect class="walls-hit" x="${left}" y="${y(r.strike)-Math.max(barHeight,18)/2}" width="${right-left}" height="${Math.max(barHeight,18)}"/><rect class="walls-bar walls-put-bar ${isPut ? 'walls-wall-bar' : ''}" x="${zero}" y="${y(r.strike)-barHeight/2}" width="${r.put/max*half}" height="${barHeight}"/><rect class="walls-bar walls-call-bar ${isCall ? 'walls-wall-bar' : ''}" x="${zero-r.call/max*half}" y="${y(r.strike)-barHeight/2}" width="${r.call/max*half}" height="${barHeight}"/></g>`;
}).join('')}
${g.annotations.map(m => `<g class="walls-marker is-${m.kind}" data-wall-marker="${m.kind}" data-price="${m.value}"><line class="walls-level-line" x1="${left}" x2="${right}" y1="${m.y}" y2="${m.y}"/><path class="walls-connector" d="M ${right} ${m.y} L ${right+9} ${m.y} L ${right+22} ${m.labelY} H ${right+28}"/><rect class="walls-level-box" x="${right+28}" y="${m.labelY-15}" width="${g.width-right-40}" height="30" rx="2"/><text class="walls-level-name" x="${right+38}" y="${m.labelY+5}">${m.label}</text><text class="walls-level-price" x="${g.width-20}" y="${m.labelY+5}" text-anchor="end">${price(m.value)}</text></g>`).join('')}
</svg></div><div class="gex-walls-caption"><span>CALLS + (LEFT) / PUTS − (RIGHT) · ${exposureLabel(max)} EACH SIDE</span><span>$${g.step} STRIKE BUCKETS · EXACT LEVEL LINES</span></div>`;
}
