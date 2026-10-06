import { escape as e, readable } from '../lib/format';
import { sectionIcon } from './section-icons';

export const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12"/></svg>';
export function badge(value: string | null | undefined, label?: string, title?: string) {
  const tone = value?.includes('bullish') ? 'positive' : value?.includes('bearish') ? 'negative' : value === 'rising' || value === 'high' ? 'warning' : 'muted';
  return `<span class="badge ${tone}"${title ? ` title="${e(title)}"` : ''}><span class="badge-dot" aria-hidden="true"></span>${e(label ?? readable(value))}</span>`;
}
export function sectionHeader(id: string, title: string, meta = '') {
  return `<div class="section-heading"><h2 id="${id}">${sectionIcon(id)}${title}</h2>${meta ? `<span class="section-meta">${meta}</span>` : ''}</div>`;
}
export function empty(title: string, description: string, compact = false) {
  return `<div class="empty-state${compact ? ' compact' : ''}"><span class="empty-mark" aria-hidden="true">+</span><div><h3>${e(title)}</h3><p>${e(description)}</p></div></div>`;
}
export function metric(label: string, value: string | null | undefined) {
  return `<div class="metric"><span class="eyebrow">${e(label)}</span>${badge(value)}</div>`;
}
