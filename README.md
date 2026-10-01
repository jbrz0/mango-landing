# Mango Atlas Market Intelligence

A public, free market-intelligence dashboard at [mangoatlas.xyz](https://mangoatlas.xyz). The root page is the product: daily market regime, Nasdaq research, catalysts, rates, FX, interactive charts, short sourced news summaries, and briefing history.

## Development

Node **22.12+**, npm, and Git are required. The frontend is static TypeScript/Vite, with one cached Vercel Function for official daily market data. No React framework, database, persistent application server, or paid data subscription is required.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. The app uses the original logo, favicons, typography stack and `#ff990a` brand accent. X stays at `https://x.com/mangoatlas`; Discord is `https://discord.gg/xUQSsm5UpV`.

## Validation and production

```sh
npm run intel:validate
npm run typecheck
npm test
npm run build
npm run preview
```

`npm run build` checks TypeScript and every production snapshot, then writes `dist/`. It refuses malformed production data. There was no existing lint configuration; TypeScript, runtime schema tests, and browser tests provide the current automated checks.

For browser tests:

```sh
npx playwright install chromium
npm run test:e2e
```

`PLAYWRIGHT_CHANNEL=chrome` optionally uses an installed Chrome for local tests. The tests cover 375/390/430/1440px layouts, no overflow, data failure, archive comparisons, event times, FX expansion, news filters, safe text rendering, chart failure, links and redirects. Third-party chart availability is tested separately in a real browser, not asserted by deterministic CI.

## Structure

```text
src/
  components/          Dashboard sections, chart adapter and UI primitives
  lib/intel/           Zod schema, archive loading, comparable field changes
  lib/markets/         Independent daily-market contract and client cache
  styles.css           Shared tokens and responsive layout
api/macro.ts           Cached, read-only Vercel Function
server/market-data.ts  Fixed Cboe and Treasury adapters, validation and cache
scripts/
  data.ts              Repository-wide validation
  update.ts            Staged build, atomic writes, recovery and rollback
  intel.ts             Update and validation CLI
  publish.ts           Validated, generated-data-only Git publishing
data/intel/
  current.json         Latest production research
  archive/YYYY-MM-DD.json
  example.json         Complete synthetic example, blocked from production
data/legacy/           Original legacy source records for migration provenance
public/                Original logo/favicons, manifest, robots and sitemap
docs/GROKBOT_DATA_UPDATE.md
```

The build emits current data, archives and a generated manifest into `dist/data/intel/`. The browser validates JSON again and can recover from the newest valid archive if current data fails. The date list is also embedded at build time for recovery when the manifest cannot be fetched. Development examples and legacy prose are **not** copied into `dist/`.

30 previously published Grokbot briefings were migrated from Git history, through October 1, 2026. Their original timestamps and source commit IDs are preserved. This migration does not independently verify the research claims or infer numerical quotes. Markdown emphasis is removed, explicit volatility labels are normalized, and the older unsupported `Transition` volatility value becomes `null`. No NQ, FX, calendar or news feed was available in the repository; those sections honestly show missing coverage until supplied.

## Daily data updates

Read the full [Grokbot contract](docs/GROKBOT_DATA_UPDATE.md). The scheduled job must supply one complete snapshot, never modify the application code, and never fabricate data.

```sh
npm run intel:update -- --input /tmp/mango-intel.json
npm run intel:validate
npm run build
```

The updater performs a candidate production build **before** touching current data. For the full fail-safe scheduled Git workflow use:

```sh
git switch main
git pull --ff-only origin main
npm ci
npm run intel:publish -- --input /tmp/mango-intel.json
```

`intel:publish` requires a clean checkout exactly at `origin/main`, validates and builds the update, tests and rebuilds the final files, stages only current plus its dated archive, commits and pushes. A validation/test/build failure before commit restores the previous data. Never use `git add .` for a bot update.

## Providers and environment

**No environment variables or credentials are required.** Research stays repo-backed. Quotes and charts update independently of the selected briefing:

| Instruments | Source and delivery | Cadence |
| --- | --- | --- |
| NAS100, US500, XAUUSD, six FX pairs | OANDA via official TradingView widgets | Provider feed, may be delayed |
| Dollar index CFD | Capital.com via official TradingView widgets | Provider feed, may be delayed |
| BTC/USD, ETH/USD | Coinbase via official TradingView widgets | Provider feed |
| VIX, VXN | [Cboe historical CSV](https://www.cboe.com/tradable_products/vix/vix_historical_data/) through `/api/macro` | Official daily closes |
| US10Y | [US Treasury XML](https://home.treasury.gov/treasury-daily-interest-rate-xml-feed) through `/api/macro` | Daily 10-year par yield in percent |

The top strip uses TradingView's own quote widget for NAS100 CFD, US500 CFD, dollar index CFD, spot gold and Bitcoin. On smaller screens it scrolls horizontally so no symbols disappear. Prices are not scraped or copied out of its iframe. The macro panel shows the three official daily observations with source dates and changes from the preceding observation. Yield changes are basis points; volatility changes are percentages.

The registry in `src/components/chart.ts` contains 15 instruments. Restricted futures and duplicate cash-index options were removed. **NAS100 and US500 are CFDs, and dollar index CFD is explicitly labeled.** NQ research retains its original futures identity; its chart shortcut clearly says NAS100 CFD. [TradingView widgets have exchange restrictions](https://www.tradingview.com/widget-docs/faq/data/), so VIX, VXN and US10Y use native interactive Lightweight Charts with official daily data instead of blocked embeds. These have pan/zoom, crosshair values and 1M/3M/1Y/All ranges. Library and data-source attribution remain visible.

`/api/macro` fetches only fixed official URLs, validates values and dates, returns up to 756 observations per series, and includes the prior Treasury year for January continuity. It caches successful responses for 15 minutes at the function/CDN, with up to one hour of stale-while-revalidate at the CDN. The browser checks every five minutes while visible. Refresh failures retain the last success when available in that function instance or browser, preserve its dates, and mark it explicitly. A cold start during an upstream outage has no durable fallback and reports unavailable. Observations over five calendar days old are marked stale; the UI never presents these daily values as intraday prices. No scheduled job is needed.

Research timestamps use Asia/Bangkok (ICT), with 12-hour display. Provider observation dates remain their original dates; retrieval time is separate in the API. Briefings and optional stored research quotes older than 36 hours are marked stale. If a briefing contains quotes, they appear in a separate dated disclosure. Selecting an archive does not relabel current market data as historical.

Run the opt-in real-provider audit after changing any symbol (Chrome installed by default, or set `PLAYWRIGHT_CHANNEL`):

```sh
node --import tsx scripts/verify-market-feeds.ts http://127.0.0.1:5173/
node --import tsx scripts/verify-market-feeds.ts https://www.mangoatlas.xyz/
```

It checks every chart for populated prices or official history, all quote-strip symbols, source dates, mobile overflow, footer alignment and browser errors. Screenshots and JSON evidence go into ignored `.intel-work/market-audit/`. CI uses deterministic provider fixtures; external-provider availability is checked separately. The Vite dev and preview servers serve the same macro handler as Vercel.

If adding a keyed API later, introduce a server-side provider adapter and server-only environment variables. Never add a credential to a `VITE_*` variable; this frontend is public.

## Analytics

Google Analytics uses the [Google tag](https://developers.google.com/tag-platform/gtagjs) with measurement ID `G-T8K5KE5246`, configured in `index.html`. It loads asynchronously only on `mangoatlas.xyz` and `www.mangoatlas.xyz`, so local development, browser tests and Vercel preview domains do not send analytics traffic. The measurement ID is public and requires no environment variable or secret.

## Deployment

The existing GitHub → Vercel integration is preserved. `vercel.json` explicitly runs `npm ci` and `npm run build` and serves `dist`. `/daily` and `/daily.html` permanently redirect to `/`. Vercel's build itself validates data; it does not depend on GitHub Actions finishing first. The GitHub workflow additionally runs validation, type checking, unit tests, production build and browser tests on every push/PR.

Manual setup: point the existing Grokbot scheduled job at the new update contract and stop the old `daily.json` writer. Supply the remaining structured feeds. Use a dedicated clean checkout and single worker. GitHub authentication belongs on that runner, not in this repository. Optionally make the validation workflow a required status check and restrict the automation account's GitHub permissions. The site itself needs no additional service configuration.
