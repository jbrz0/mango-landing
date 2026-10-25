# Mango Atlas Gamma Map

Route: `/gex` (separate Vite entry). Deliberately absent from navigation and marked `noindex,nofollow`. It is publicly accessible, not an authenticated private page.

## Data and operations

`npm run gex:update` fetches one QQQ delayed chain from Cboe, validates it, strips unused fields and atomically publishes `public/data/gex/current.json`. The browser only downloads this saved snapshot. No user interaction contacts Cboe and no API keys are needed by this adapter.

The GitHub Actions workflow `gex-refresh.yml` targets 10:00, 12:30 and 15:15 America/New_York on weekdays. Paired UTC schedules and an offset gate handle US DST. GitHub can start scheduled jobs late; no updates are promised to the minute. It also runs on market holidays; quote time still identifies the last observation. The workflow commits the validated snapshot to main, which the repository's existing Vercel Git integration publishes. Manual refresh: Actions → Refresh QQQ gamma snapshot → Run workflow. The page's “Check for update” reloads the published file; it does not create a capture.

On fetch/validation failure the job fails without replacing the last good snapshot. Future/regressed timestamps, duplicate contracts, wrong symbols, malformed chains, and data older than five days fail publication. A reader with a prior snapshot retains it on a failed update check. A cold-load failure displays no levels. The page explicitly flags old captures/quotes during regular weekday session hours, or captures older than four days outside session hours. This is a freshness heuristic, not an exchange holiday calendar.

Cboe provides separate chain generation and last underlying trade times. These are exchange-local timestamps and are converted with New York DST. Capture, chain and quote timestamps are shown separately. Sunday chain generation does not turn Friday's last trade into a Sunday market observation. Open interest is daily, not live.

### Provider choice and usage restrictions

The initial adapter uses the public [Cboe QQQ delayed chain](https://www.cboe.com/delayed_quotes/qqq/quote_table/). It is accessible without an API key; that does **not** mean open-licensed data. Cboe's quote-table notice restricts automated extraction and its data terms apply to redistribution. This implementation has not obtained a redistribution license. Resolve provider permissions before promoting this experimental page to a broadly advertised/commercial data product. Do not describe this as a guaranteed free licensed feed.

For an official API adapter, [Alpaca option snapshots](https://docs.alpaca.markets/us/reference/optionchain) provide greeks and a free `indicative` feed with modified quotes and delayed trades. They require credentials; open interest must be joined from contract/reference data. Verify coverage and display rights for the intended public product before choosing a subscription. Yahoo's unofficial option endpoints were not selected because unauthenticated access and availability are less dependable. The UI and calculation model consume the normalized snapshot schema, so the upstream adapter can be replaced independently.

## Model

- QQQ ETF dollar strikes; no synthetic NDX/NQ conversion.
- Filter unexpired contracts to the selected next 7, 30 or 90 calendar days from chain time. Exclude zero OI/gamma/IV and adjusted roots. Multiplier: 100 shares.
- Per-contract dollars per 1% underlying move: `gamma * OI * 100 * spot² * 0.01`.
- Net: calls minus puts. Gross: calls plus puts. This is an assumption about signs, not observed dealer inventory. “Balanced” means absolute net/gross is below 3%.
- Walls: largest call and put exposures within ±10% of spot, across selected expiries. They need not bracket spot. Levels-to-watch pick the strongest gross concentration above and below spot within the same range.
- Flip: scan ±20% of spot for all sign changes, refine each by bisection, then report the nearest. No crossing returns no level. Gamma is repriced with constant IV and zero carry using a Black–Scholes gamma ratio anchored at published spot gamma. This guarantees the curve and displayed net agree at spot. It is a sensitivity scenario, not a future price forecast. Assume 16:00 ET expiry; special exchange sessions/early closes are not modeled.
- Heatmap: aggregate nearest $1, $2 or $5 strike buckets according to visible range. First seven expiries get individual columns; subsequent expiries share a “Later” column. Color scale is symmetric across the visible cells; changing range/window rescales it. Spot/flip row labels use nearest buckets; exact values remain in metrics. Inspect cells for exact underlying totals. Profile uses the same selected book and bucket sizes.
- Walls tab: a mirrored call/put profile uses one shared dollar scale and exact-price dashed markers. “Fit key levels” includes spot, both available walls and the nearest available gamma flip with padding. Fixed ranges identify off-screen levels in the level cards. Label collisions move labels, never their underlying price lines. Narrow panels keep both bar directions visible and show marker values in cards above the chart. Hover, focus or select a strike to inspect exposure.
- The session-range graphic uses reported OHLC only; it does not invent an intraday time series. Conditional commentary is descriptive and unbacktested, with no entry, stop or return claims.

## Research references

- [SpotGamma TRACE gamma heatmap](https://support.spotgamma.com/hc/en-us/articles/33608037264787-What-is-the-Gamma-Heatmap): intensity and positioning context. TRACE's time/price lens is a different construction from our strike/expiry grid.
- [MenthorQ GEX guide](https://menthorq.com/guide/what-is-gex/): exposure profiles, concentration levels, and model sign interpretation.
- [SquawkFlow heatmap](https://squawkflow.com/gex-heatmap): strike-by-expiry layout and explicit separation of full-book totals from the displayed grid.
- [GammaFlip GEX levels](https://gammaflip.io/gex): compact spot, flip and regime summaries.

The design is original Mango Atlas styling and does not use competitors' imagery, code or data.

## Validation

`npm test` includes unit coverage for exposure units, sign aggregation, flip crossings, curve anchoring, exchange DST, source validation and expiry selection. `npm run test:e2e` includes GEX responsive layouts, controls, keyboard inspection, stale labels, and cold/retained failure states. `npm run build` checks TypeScript and emits `dist/gex.html` alongside the existing pages.
