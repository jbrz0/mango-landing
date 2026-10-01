import knownDates from 'virtual:intel-dates';
import { dateSchema, parseIntel, type Intel } from './schema';

async function fetchJson(path: string) {
  const response = await fetch(path, { cache: 'no-cache', signal: AbortSignal.timeout(6000) });
  if (!response.ok) throw new Error(`Data unavailable (${response.status})`);
  const text = await response.text();
  if (text.length > 1_048_576) throw new Error('Response is too large');
  return JSON.parse(text) as unknown;
}

const cache = new Map<string, Intel>();
export async function loadArchive(date: string) {
  dateSchema.parse(date);
  if (cache.has(date)) return cache.get(date)!;
  const data = parseIntel(await fetchJson(`/data/intel/archive/${date}.json`));
  if (data.asOfDate !== date) throw new Error('Archive date mismatch');
  cache.set(date, data);
  return data;
}

export async function loadDashboard() {
  let dates = [...knownDates];
  const [currentResult, manifestResult] = await Promise.allSettled([
    fetchJson('/data/intel/current.json').then(input => parseIntel(input)),
    fetchJson('/data/intel/manifest.json'),
  ]);
  if (manifestResult.status === 'fulfilled') {
    const value = manifestResult.value as { dates?: unknown };
    if (Array.isArray(value?.dates) && value.dates.length <= 10_000 && value.dates.every(date => dateSchema.safeParse(date).success)) {
      dates = [...new Set([...dates, ...value.dates as string[]])].sort().reverse();
    }
  }
  let current: Intel | null = currentResult.status === 'fulfilled' ? currentResult.value : null;
  const fallback = !current;
  if (!current) {
    for (const date of dates) {
      try { current = await loadArchive(date); break; } catch { /* Try the next valid archive. */ }
    }
  }
  if (current) {
    cache.set(current.asOfDate, current);
    dates = [...new Set([current.asOfDate, ...dates.filter(date => date <= current!.asOfDate)])].sort().reverse();
  }
  return { current, dates, fallback };
}

export async function previousBriefing(date: string, dates: string[]) {
  for (const previous of dates.filter(value => value < date)) {
    try { return await loadArchive(previous); } catch { /* Ignore a damaged historical file. */ }
  }
  return null;
}
