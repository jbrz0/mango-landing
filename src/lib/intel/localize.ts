import type { Intel } from './schema';
import { dateKey, day, displayTimeZone, time, zoneLabel } from '../format';

// Research clock references without another named zone use the briefing's Bangkok date.
// Keep stored research untouched. Relative prose ("overnight", "tonight") remains editorial context.
export function localizeClockReferences(text: string, date: string, zone = displayTimeZone) {
  return text.replace(/\b(\d{1,2}):([0-5]\d)(?:\s*(AM|PM|a|p))?(?:\s+(BKK|ICT|Bangkok))?\b/gi, (original, hour: string, minute: string, meridiem: string | undefined, namedZone: string | undefined, offset: number) => {
    if (!meridiem && !namedZone) return original;
    if (!namedZone && /^\s*(?:ET|EST|EDT|CT|CST|CDT|PT|PST|PDT|UTC|GMT|Z)\b/.test(text.slice(offset + original.length))) return original;
    let hours = Number(hour);
    if (meridiem) {
      if (hours < 1 || hours > 12) return original;
      hours = hours % 12 + (meridiem.toLowerCase().startsWith('p') ? 12 : 0);
    } else if (hours > 23) return original;
    const iso = `${date}T${String(hours).padStart(2, '0')}:${minute}:00+07:00`;
    return `${time(iso, zone)} ${zoneLabel(iso, zone)}${dateKey(iso, zone) !== date ? ` (${day(iso, false, zone)})` : ''}`;
  });
}

export function localizeResearch(input: Intel): Intel {
  const data = structuredClone(input);
  const text = (value: string | null) => value === null ? null : localizeClockReferences(value, data.asOfDate);
  if (data.overview) {
    data.overview.oneLineTake = text(data.overview.oneLineTake);
    data.overview.themes = data.overview.themes.map(value => text(value)!);
    data.overview.risks = data.overview.risks.map(value => text(value)!);
  }
  if (data.nq) {
    for (const key of ['summary', 'primaryCatalyst', 'primaryRisk', 'overnight', 'macro', 'volatility'] as const) data.nq[key] = text(data.nq[key]);
    for (const mover of [...data.nq.megaCaps, ...data.nq.semiconductors, ...data.nq.premarket]) mover.context = text(mover.context)!;
  }
  if (data.fx) {
    data.fx.macroPulse = text(data.fx.macroPulse);
    for (const item of data.fx.instruments) for (const key of ['driver', 'posture', 'comments'] as const) item[key] = text(item[key]);
  }
  for (const item of data.intelligence) {
    item.headline = text(item.headline)!;
    item.summary = text(item.summary)!;
  }
  return data;
}
