import { inject } from '@vercel/analytics';

/** Hostnames that report to Vercel Web Analytics (matches the Google tag). */
export const ANALYTICS_HOSTS = ['mangoatlas.xyz', 'www.mangoatlas.xyz'];

export function shouldTrack(hostname: string) {
  return ANALYTICS_HOSTS.includes(hostname);
}

/** Loads Vercel Web Analytics (/_vercel/insights/script.js) on production domains only. */
export function startAnalytics() {
  if (typeof window === 'undefined' || !shouldTrack(window.location.hostname)) return;
  inject({ mode: 'production', framework: 'vite' });
}

startAnalytics();
