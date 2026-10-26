// Canonical public origin. Vercel currently serves www and 308-redirects the apex to it.
// To make the apex canonical: flip the redirect in Vercel first, then change this value and run `npm test`;
// tests/seo.test.ts lists every HTML tag, sitemap entry and robots line that must follow it.
export const SITE_ORIGIN = 'https://www.mangoatlas.xyz';
export const PUBLIC_PATHS = ['/', '/visual', '/global', '/gex', '/tools', '/tools/calculator-futures'] as const;
