# GEX V2 audit

Audited the Cboe adapter, saved snapshot schema, model, chart aggregation and displayed copy before changing calculations on October 26, 2026.

## Existing calculation findings

- Correct: `gamma × OI × 100 × spot² × 0.01` gives dollar delta-exposure change per 1% QQQ move. Calls contribute positively, puts negatively. Gross is call plus put magnitude.
- Correct: summary totals and the flip use the complete selected expiry book, independent of the chart range. Wall searches intentionally use ±10% of spot.
- Incorrect label: the displayed contract count counts option series (one side/strike/expiry record), not outstanding contracts. Open-interest contracts are a separate sum.
- Exact strikes were rounded to $1 before selecting walls and market concentrations. This can merge distinct fractional strikes and report a false wall. Bucketing belongs only in chart rendering.
- Expiry selection used a rolling number of hours despite documenting calendar days. Before 16:00 ET this omitted the closing hours of the final selected date.
- The anchored Black–Scholes gamma-ratio scenario is internally consistent at spot and reprices individual options, but assumes constant IV, zero rates/dividends, and 16:00 ET expiry. Rates, dividend inputs and source Greek valuation conventions are absent from the snapshot. Retain and disclose this approximation rather than silently replacing source gamma with a different pricing model.
- The flip scan finds multiple crossings, but misses a crossing exactly on a grid point. Its ratio calculation can overflow when a large exponent is multiplied before cancellation. Prepare each option once and evaluate relative exposure in log space; preserve anchoring at spot.
- The existing expiry share describes the nearest expiry, not necessarily the largest expiry contribution.
- Stale snapshots change their status text, but did not receive the stale color. Chain age was also absent from the freshness test. Market commentary must inherit stale/update-failure state.
- Data integrity improvements: validate real expiry dates, integer open interest, unique series and source timestamps consistently for saved snapshots as well as provider captures.

## Scope

Preserve the saved-snapshot pipeline, refresh workflow, three chart modes, expiry controls and public routing. Refine the existing dark dashboard, expose model assumptions in collapsed methodology, and test mathematical invariants and browser behavior. No directional signals or confidence scores.

## Resolution and evidence

All listed implementation issues are resolved. The source-anchored scenario remains explicitly approximate, with constant IV/OI, zero rate/dividends, 16:00 ET expiry, a one-minute time floor and no American exercise treatment. A finite search can miss narrow crossings and makes no claim about flips outside ±20%.

The saved snapshot has chain time `2026-10-25T17:46:52.000Z`, quote time `2026-10-23T19:59:59.000Z` and capture time `2026-10-25T18:00:52.413Z`. The 30-day book still contains 2,460 option series, representing 3,857,273 open-interest contracts. Net remains -$5,818,562,376.92, gross $12,960,485,409.19, call wall $720, put wall $700 and nearest flip $717.28. The denser numerical scan changes the raw flip only below displayed precision. The largest gross expiry is Oct 30 at 34.4% of selected-book gross. The fixes do not manufacture different headline values.

Calculation tests cover units, signed/gross reconciliation, chart bucket invariance, fractional strikes, expiry-day boundaries, independent Black–Scholes ratio agreement, exact zeros, multiple crossings, no in-range crossings, finite log-space repricing, saved-source validation and empty/stale books. Browser tests cover 320/390/768/1440px, all modes and windows, consistent colors, keyboard inspection, exact source times, range-independent totals and cold/retained failure states. Production build includes TypeScript checking.

Final local checks: 72 unit tests passed, 92 browser tests passed, and the TypeScript/production build succeeded. Visual inspection covered the built heatmap at 320/390/1440px and both desktop profile modes; no page overflow or runtime errors across all three modes at those widths. Existing non-blocking build warnings concern dependency annotations and the unrelated Visual Atlas chunk size.

Primary model references: [OIC gamma](https://www.optionseducation.org/advancedconcepts/gamma) and [OIC volatility and the Greeks](https://www.optionseducation.org/advancedconcepts/volatility-the-greeks). The latter identifies rates and expected dividends as model inputs, which the saved snapshot does not supply.
