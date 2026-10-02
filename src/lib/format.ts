import { TIMEZONE } from './intel/schema';

export function detectTimeZone(resolve = () => Intl.DateTimeFormat().resolvedOptions().timeZone): string {
  try {
    const zone = resolve();
    if (!zone) return TIMEZONE;
    new Intl.DateTimeFormat('en', { timeZone: zone }).format();
    return zone;
  } catch { return TIMEZONE; }
}
export const displayTimeZone = typeof window === 'undefined' ? TIMEZONE : detectTimeZone();
export const zoneName = displayTimeZone.split('/').at(-1)!.replaceAll('_', ' ');
export const dateKey = (value: string | Date, zone = displayTimeZone) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
export const zoneLabel = (iso: string, zone = displayTimeZone) => zone === TIMEZONE ? 'ICT' : new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' }).formatToParts(new Date(iso)).find(part => part.type === 'timeZoneName')!.value;

export const readable = (value: string | null | undefined) => value ? value.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase()) : 'Unavailable';
export const time = (iso: string, zone = displayTimeZone) => new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));
// A publication/observation date is a calendar label, not a midnight timestamp.
export const day = (date: string, long = false, zone = displayTimeZone) => new Intl.DateTimeFormat('en-GB', { timeZone: date.length === 10 ? 'UTC' : zone, day: '2-digit', month: long ? 'long' : 'short', year: 'numeric' }).format(new Date(date.length === 10 ? `${date}T00:00:00Z` : date));
export const timestamp = (iso: string) => `${day(iso)} · ${time(iso)} ${zoneLabel(iso)}`;
export const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400_000).toISOString().slice(0, 10);
export const signed = (value: number | null) => value === null ? 'No change data' : `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
export const number = (value: number, digits = 2) => new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(value);
export const isStale = (generatedAt: string, now = Date.now()) => now - Date.parse(generatedAt) > 36 * 60 * 60_000;
export const notToday = (generatedAt: string, now = new Date()) => dateKey(generatedAt) !== dateKey(now);

// All research text is escaped before entering a template. No markdown or HTML from feeds is rendered.
export const escape = (input: string | number | null | undefined) => String(input ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
