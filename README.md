# Mango Atlas Market Intelligence

A public, free market-intelligence dashboard at [mangoatlas.xyz](https://mangoatlas.xyz). The root page is the product: daily market regime, Nasdaq research, catalysts, rates, FX, interactive charts, short sourced news summaries, and briefing history.

## Development

Node **22.12+**, npm, and Git are required. The frontend is static TypeScript/Vite, with cached Vercel Functions for official daily market data and Nasdaq constituent prices. No React framework, database, persistent application server, or paid data subscription is required.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. The app uses the original logo, favicons, typography stack and `#ff990a` brand accent. X stays at `https://x.com/mangoatlas`; Discord is `https://discord.gg/xUQSsm5UpV`.

## Validation and production

The standalone futures calculator lives at `/tools/calculator-futures`. Link directly to a contract with `#mnq` (case insensitive) or `?contract=MNQ`; a recognized hash takes precedence. Its four keyboard-accessible fields support NQ, ES, MNQ, MES, GC, MGC, CL, MCL, BTC and MBT. Entering points calculates USD P&L, and entering USD calculates points. The last edited value remains the input when changing contract or quantity. Values are before commissions and fees; points mean a 1.00 price change, including metals, energy and Bitcoin. Reset keeps the selected contract. This page is unlisted and is not linked from the homepage navigation.

Multipliers use CME specifications: [equity index contracts](https://www.cmegroup.com/articles/faqs/faq-e-nano-equity-index-futures.html), [gold contracts](https://www.cmegroup.com/markets/metals/precious/gold-futures.html), [WTI contracts](https://www.cmegroup.com/education/articles-and-reports/micro-wti-crude-oil-futures-faq), and [Bitcoin contracts](https://www.cmegroup.com/articles/faqs/frequently-asked-questions-cryptocurrency-futures.html).

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
api/equities.ts        Shared 15-minute stock/ETF quote cache
server/market-data.ts  Fixed Cboe and Treasury adapters, validation and cache
server/equity-data.ts  Validated Yahoo Finance regular-session quote adapter
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

The build emits current data, archives and a generated manifest into `dist/data/intel/`. These are real, versioned daily JSON snapshots, so archive storage needs no database. The selector shows published dates within the latest briefing's 30-day window; older files remain preserved. The browser validates JSON again and can recover from the newest valid archive if current data fails. The date list is also embedded at build time for recovery when the manifest cannot be fetched. Development examples and legacy prose are **not** copied into `dist/`.

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
| Stocks/ETFs mentioned in Nasdaq research | Yahoo Finance chart JSON through `/api/equities` | Latest regular session; shared 15-minute cache, may be delayed |

The top strip uses TradingView's own quote widget for NAS100 CFD, US500 CFD, dollar index CFD, spot gold and Bitcoin. On smaller screens it scrolls horizontally so no symbols disappear. Prices are not scraped or copied out of its iframe. The macro panel shows the three official daily observations with source dates and changes from the preceding observation. Yield changes are basis points; volatility changes are percentages.

The registry in `src/components/chart.ts` contains 15 instruments, all rendered as solid `#ff990a` lines. Restricted futures and duplicate cash-index options were removed. **NAS100 and US500 are CFDs, and dollar index CFD is explicitly labeled.** NQ research retains its original futures identity; its chart shortcut clearly says NAS100 CFD. [TradingView widgets have exchange restrictions](https://www.tradingview.com/widget-docs/faq/data/), so VIX, VXN and US10Y use native interactive Lightweight Charts with official daily data instead of blocked embeds. These have pan/zoom, crosshair values and 1M/3M/1Y/All ranges. Other charts retain their hourly default, with compact 15m/1h/4h/1D buttons and no advanced toolbar, OHLC legend or volume. TradingView's public embed reads line-style overrides from the iframe query string; passing them only in its config hash has no effect. Library and data-source attribution remain visible.

`/api/macro` fetches only fixed official URLs, validates values and dates, returns up to 756 observations per series, and includes the prior Treasury year for January continuity. It caches successful responses for 15 minutes at the function/CDN, with up to one hour of stale-while-revalidate at the CDN. The browser checks every five minutes while visible. Refresh failures retain the last success when available in that function instance or browser, preserve its dates, and mark it explicitly. A cold start during an upstream outage has no durable fallback and reports unavailable. Observations over five calendar days old are marked stale; the UI never presents these daily values as intraday prices. No scheduled job is needed.

Nasdaq stock rows show prices and changes from the preceding regular-session close, separately from published research commentary. `/api/equities` fetches only the unique US stock/ETF symbols in the current briefing, with no caller-selected upstream URLs. All visitors share the CDN's 15-minute cache, with up to another 15 minutes of stale-while-revalidate; concurrent requests in a function instance share one refresh. Browsers reuse responses for 15 minutes and refresh while visible. Failed symbols retain their original last-known timestamp when available, otherwise display `Price unavailable`. Retrievals more than 30 minutes old and failed refreshes are marked; observations older than five days are stale. This is a keyless Yahoo endpoint, not a contracted feed with guaranteed uptime. There is no durable cache across cold starts during provider outages, and symbols only mentioned in an older archive may be unavailable. No Redis, credentials or scheduled job is required.

The UI detects the browser/device time zone, falling back to Asia/Bangkok, with 12-hour display. This applies to the clock, updates, quote/news timestamps, catalyst grouping and TradingView intraday axes. Stored research remains in Bangkok time. Recognized clock references in its prose are converted using the briefing date and stored time zone; explicitly named US/UTC zones and relative editorial language remain intact. Date-only archive and provider observation labels never shift. Untimed events retain their published date because no exact instant is known. Briefings older than 36 hours are marked stale. The redundant stored-quote disclosure is removed. Selecting an archive does not relabel current market data as historical.

Run the opt-in real-provider audit after changing any symbol (Chrome installed by default, or set `PLAYWRIGHT_CHANNEL`):

```sh
node --import tsx scripts/verify-market-feeds.ts http://127.0.0.1:5173/
node --import tsx scripts/verify-market-feeds.ts https://www.mangoatlas.xyz/
```

It checks every chart for rendered orange price lines or official history, all quote-strip symbols, Nasdaq row prices, source dates, mobile overflow, footer alignment and browser errors. Screenshots and JSON evidence go into ignored `.intel-work/market-audit/`. CI uses deterministic provider fixtures; external-provider availability is checked separately. The Vite dev and preview servers serve the same macro and equities handlers as Vercel.

If adding a keyed API later, introduce a server-side provider adapter and server-only environment variables. Never add a credential to a `VITE_*` variable; this frontend is public.

## Analytics

Google Analytics uses the [Google tag](https://developers.google.com/tag-platform/gtagjs) with measurement ID `G-T8K5KE5246`, configured in `index.html`. It loads asynchronously only on `mangoatlas.xyz` and `www.mangoatlas.xyz`, so local development, browser tests and Vercel preview domains do not send analytics traffic. The measurement ID is public and requires no environment variable or secret.

## Deployment

The existing GitHub → Vercel integration is preserved. `vercel.json` explicitly runs `npm ci` and `npm run build` and serves `dist`. `/daily` and `/daily.html` permanently redirect to `/`. Vercel's build itself validates data; it does not depend on GitHub Actions finishing first. The GitHub workflow additionally runs validation, type checking, unit tests, production build and browser tests on every push/PR.

Manual setup: point the existing Grokbot scheduled job at the new update contract and stop the old `daily.json` writer. Supply the remaining structured feeds. Use a dedicated clean checkout and single worker. GitHub authentication belongs on that runner, not in this repository. Optionally make the validation workflow a required status check and restrict the automation account's GitHub permissions. The site itself needs no additional service configuration.

## Early-access standalone pages

`/global` (Global Intel), `/tools` and `/visual` are independent Vite entry points. They are deliberately absent from the homepage navigation, footer and sitemap, and carry `noindex, nofollow` metadata while in development. Their page-specific CSS/JS is not loaded by the homepage. These are public URLs, not authenticated private pages.

Global Intel reuses the validated daily briefing and `/api/macro`, with an interactive D3/Natural Earth regional map, cross-asset daily performance tiles, publisher headlines, crypto Fear & Greed, local market session clocks and official daily macro history. `/api/global` uses a fixed instrument registry and fixed publisher URLs only. Yahoo Finance observations, BBC World/Business RSS, CoinDesk RSS and Alternative.me sentiment refresh through a shared 15-minute function/CDN cache; partial failures are explicit and retry sooner. Provider timestamps remain visible, prices may be delayed, and futures rolls can affect changes. Regional coverage matches headline keywords, not live geolocated events; map arcs are illustrative. Typical session hours account for time zones/DST but not exchange holidays or Tokyo's lunch break. No credentials or subscriptions are needed.

Tools includes six products from the Notion roadmap, the published TradingView link for Market Regime HUD, product-detail dialogs, and filtering/search. Its calculator cards and detail dialog link to the standalone `/tools/calculator-futures` page. The older Futures Session Dashboard entry and embedded calculator are removed. Unreleased products have no invented checkout, price or private Notion links.

`/visual` presents the validated briefing in a full-screen Three.js atlas with eight switchable views: regime signals, signed cross-asset moves, grouped leadership, FX support/price/resistance stacks, two categorical bias paths, economic catalyst pillars, equal-weight themes and risks, and a graph connecting stories to their published tags. Market and leadership columns use one linear percent scale per view; missing returns stay missing. FX stacks normalize each pair independently, history uses the five published bias categories, and catalyst heights represent ordinal impact. The scene supports drag/orbit, wheel/pinch zoom, optional rotation, reduced motion, and responsive desktop/phone layouts without page scrolling. Every point is reachable through the data picker, previous/next controls and keyboard; complete research and source links open on demand. Browsers without WebGL retain the data explorer. It does not fetch a second research feed. Quotes are published snapshots, not the homepage's live provider strip.

In a managed workspace whose Node fetch requires the session proxy, run local QA with `NODE_USE_ENV_PROXY=1 npm run dev`. This is a workspace transport setting, not a production dependency.
