import { bangkokDate, TIMEZONE } from './intel/schema';

export const readable = (value: string | null | undefined) => value ? value.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase()) : 'Unavailable';
export const time = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));
export const day = (date: string, long = false) => new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, day: '2-digit', month: long ? 'long' : 'short', year: 'numeric' }).format(new Date(date.length === 10 ? `${date}T00:00:00+07:00` : date));
export const signed = (value: number | null) => value === null ? 'No change data' : `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
export const number = (value: number, digits = 2) => new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(value);
export const isStale = (generatedAt: string, now = Date.now()) => now - Date.parse(generatedAt) > 36 * 60 * 60_000;
export const notToday = (generatedAt: string, now = new Date()) => bangkokDate(generatedAt) !== bangkokDate(now);

// All research text is escaped before entering a template. No markdown or HTML from feeds is rendered.
export const escape = (input: string | number | null | undefined) => String(input ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
