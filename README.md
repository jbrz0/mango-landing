# Mango Atlas Market Intelligence

A public, free market-intelligence dashboard at [mangoatlas.xyz](https://mangoatlas.xyz). The root page is the product: daily market regime, Nasdaq research, catalysts, rates, FX, interactive charts, short sourced news summaries, and briefing history.

## Development

Node **22.12+**, npm, and Git are required. This remains a static site, with TypeScript and Vite added for modular code and reproducible builds. No React framework, database, application server, or paid data subscription is required.

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
  styles.css           Shared tokens and responsive layout
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

**No environment variables or credentials are required.** `.env.example` documents this. Research is entirely repo-backed; interactive charts use TradingView's public iframe widget, loaded only when viewed. No market API is called by the site and no quotes are scraped from the widget.

The small chart adapter and explicit symbol registry are in `src/components/chart.ts`. Public [TradingView widgets](https://www.tradingview.com/widget-docs/widgets/charts/advanced-chart/) have [exchange-specific restrictions](https://www.tradingview.com/widget-docs/faq/data/). NQ/ES/GC futures open the actual futures chart externally because their free embeds are restricted. The default in-page Nasdaq chart is explicitly **OANDA NAS100 CFD**, not NQ or NDX. Other labels distinguish cash indices, spot FX, spot gold and crypto spot. Provider data can be delayed or unavailable; failures leave the research usable. Provider attribution remains visible.

All app times are Asia/Bangkok (ICT), with 12-hour display. Daily research and numerical quotes carry distinct timestamps. A quote is always shown as a stored snapshot even if its source originally reported `live`. Briefings and quotes older than 36 hours are marked stale. Selecting an archive never changes the external chart to a purported historical snapshot.

If adding a keyed API later, introduce a server-side provider adapter and server-only environment variables. Never add a credential to a `VITE_*` variable; this frontend is public.

## Analytics

Google Analytics uses the [Google tag](https://developers.google.com/tag-platform/gtagjs) with measurement ID `G-T8K5KE5246`, configured in `index.html`. It loads asynchronously only on `mangoatlas.xyz` and `www.mangoatlas.xyz`, so local development, browser tests and Vercel preview domains do not send analytics traffic. The measurement ID is public and requires no environment variable or secret.

## Deployment

The existing GitHub → Vercel integration is preserved. `vercel.json` explicitly runs `npm ci` and `npm run build` and serves `dist`. `/daily` and `/daily.html` permanently redirect to `/`. Vercel's build itself validates data; it does not depend on GitHub Actions finishing first. The GitHub workflow additionally runs validation, type checking, unit tests, production build and browser tests on every push/PR.

Manual setup: point the existing Grokbot scheduled job at the new update contract and stop the old `daily.json` writer. Supply the remaining structured feeds. Use a dedicated clean checkout and single worker. GitHub authentication belongs on that runner, not in this repository. Optionally make the validation workflow a required status check and restrict the automation account's GitHub permissions. The site itself needs no additional service configuration.
