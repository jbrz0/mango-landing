import type { VisualNode } from './visual-data';

export const FX_LEVEL_COLORS = { support: '#f08b87', price: '#ffae35', resistance: '#6ed2b1' };

type Level = NonNullable<VisualNode['levels']>[number];
type Plane = { kind: Level['kind']; y: number; value: number | null; label: string };

export function layoutFxLevels(levels: NonNullable<VisualNode['levels']>): Plane[] {
  const bottom = -1.35, top = 3.3;
  const kinds = new Set(levels.map(mark => mark.kind));
  const lo = Math.min(...levels.map(mark => mark.value));
  const hi = Math.max(...levels.map(mark => mark.value));
  // Reserve space for explicitly missing bounds without inventing a price.
  const scaleBottom = bottom + (kinds.has('support') ? 0 : 0.85);
  const scaleTop = top - (kinds.has('resistance') ? 0 : 0.85);
  const yFor = (value: number) => hi > lo ? scaleBottom + (value - lo) / (hi - lo) * (scaleTop - scaleBottom) : (scaleBottom + scaleTop) / 2;
  const planes: Plane[] = levels.map(mark => ({ ...mark, y: yFor(mark.value), label: `${mark.value}${mark.label ? ` · ${mark.label}` : ''}` }));
  for (const [kind, y, name] of [['support', bottom, 'Support'], ['price', (bottom + top) / 2, 'Snapshot'], ['resistance', top, 'Resistance']] as const) {
    if (!kinds.has(kind)) planes.push({ kind, y, value: null, label: `${name} not supplied` });
  }
  return planes;
}
