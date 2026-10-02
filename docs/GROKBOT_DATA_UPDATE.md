# Grokbot daily intelligence update contract

Version **1**. Repository: `jbrz0/mango-landing`. Production branch: `main`.

The application belongs to maintainers. Grokbot publishes **data only** through this contract. Stop the previous job that edits `daily.json`; that file and its page no longer exist. Use a dedicated, clean checkout and one scheduled writer.

## Daily procedure (recommended)

1. Complete the research jobs and assemble one JSON payload at an absolute path outside the checkout, e.g. `/tmp/mango-intel.json`. Use a source timestamp for every numerical quote. Use `null` or an empty collection when information is missing. Do not turn missing evidence into a neutral/bullish/bearish prediction.
2. Run the following with fail-on-error behavior. The publisher does not create a schedule; your existing Grokbot scheduler invokes it.

```sh
set -euo pipefail
cd /path/to/mango-landing
git switch main
git pull --ff-only origin main
npm ci
npm run intel:publish -- --input /tmp/mango-intel.json
```

`intel:publish` performs the full sequence: clean-main/remote checks → parse → runtime validation → normalization → isolated candidate build → atomic current/archive update → production validation → unit tests → production build → stage **only** generated files → commit → ordinary fast-forward push. The GitHub/Vercel integration then builds and deploys that commit. A successful push is not proof that Vercel deployed; inspect the commit's Vercel status and the site's timestamp. Do not send a success report until deployment succeeds.

Before commit, any validation, test, staging or build failure restores the previous current/archive bytes and exits non-zero. If Git rejects the push, the validated local commit is retained for investigation; no force push, hard reset, automatic merge, or credential changes are allowed. Reconcile with the maintainer before retrying.

## Individual commands

```sh
npm run intel:update -- --input /tmp/mango-intel.json
npm run intel:validate
npm run typecheck
npm test
npm run build
```

`intel:update` itself checks types and builds the candidate in `.intel-work/update-*/` before promotion. It does **not** commit or push. `intel:validate` validates current plus **every** archive and requires current to match its dated archive. `npm run build` enforces the same validation. Use `intel:publish` for unattended work so any failure after the initial update also triggers rollback. Do not substitute a loose shell sequence that commits regardless of exit codes. On Windows use the same npm commands in a PowerShell session; `intel:publish` handles subprocess failures independently of PowerShell's defaults.

## Allowed and forbidden files

The command may change only:

- `data/intel/current.json`
- `data/intel/archive/<asOfDate>.json`

Temporary staging/lock/recovery files live under ignored `.intel-work/`; never commit them. Payload paths, dates and file names are validated; dates are never used unchecked as file paths.

Grokbot must **never edit or stage** `src/**`, `scripts/**`, `index.html`, `public/**`, `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `vercel.json`, `.github/**`, documentation, `data/intel/example.json`, or `data/legacy/**`. No `git add .`, dependency changes, schema edits, secrets, account information, tokens, arbitrary code generation, or environment changes are part of a daily update. A new field or schema version requires a maintainer-reviewed application release first.

The publisher checks a clean checkout and whitelists its staged paths. These are process safeguards, not a substitute for least-privilege GitHub credentials and branch protection. Never give a research prompt permission to change application code or disable validation. GitHub credentials live only in the runner's secure credential store.

## Schema and required structure

The executable source of truth is [`src/lib/intel/schema.ts`](../src/lib/intel/schema.ts). TypeScript types are inferred from that runtime schema. Objects are strict: unknown keys, missing keys, wrong types and unknown enum values are rejected. Do not send prose outside JSON, markdown fences, NaN, Infinity, or trailing commas. Maximum input size: **1 MiB**.

All fields in the complete example below are required. There are **no omitted optional keys in v1**. Unavailable sections (`overview`, `nq`, `fx`) may be `null`; unavailable scalar values use `null`; absent collections use `[]`. A non-null section must include all its keys. Empty strings are rejected rather than treated as real information. Strings are trimmed; instrument symbols are uppercased. No numerical string coercion occurs.

| Field | Contract |
| --- | --- |
| `schemaVersion` | Literal integer `1`. Other versions fail closed. |
| `kind` | Production: `briefing`. Documentation/tests: `example`, which the updater/build/browser refuse in production. |
| `asOfDate` | Real `YYYY-MM-DD` calendar date. Must equal `generatedAt`'s date in Bangkok. |
| `generatedAt` | ISO-8601 date/time with seconds and `Z` or a numeric offset. At most 5 minutes in the future. New updates cannot move backwards in date or timestamp. Changed same-day data must have a newer timestamp. |
| `timezone` | Literal `Asia/Bangkok`. |
| `provenance` | `source`: short nonempty string; `note`: research provenance string or `null`. No secrets. |
| `overview` | Nullable object: sentiment, confidence, volatility outlook, one-line takeaway, themes and risks. |
| `markets` | Up to 80 quotes. Unique `symbol`; explicit instrument type, unit, source and timestamp. No instrument substitutions. |
| `nq` | Nullable research object. Missing bias/conviction/regime/prose/sentiments can be `null`. Each mover collection has up to 30 items. |
| `fx` | Nullable object with macro pulse and up to 30 unique-symbol instrument rows. |
| `events` | Up to 250 unique-ID scheduled events. Includes source link and actual only if available. |
| `intelligence` | Up to 80 unique-ID articles. Headline + **your original short summary**, source URL, metadata. Never copy article bodies. |

### Enums

- Bias/sentiment: `bullish`, `mildly_bullish`, `neutral`, `mildly_bearish`, `bearish`.
- Confidence/conviction: `low`, `medium`, `high`.
- Volatility outlook: `falling`, `stable`, `rising`.
- Instrument type: `futures`, `cash_index`, `cfd`, `spot`, `crypto_spot`, `yield`, `volatility_index`, `fx`.
- Quote status: `live`, `delayed`, `snapshot`, `unavailable`. `live` describes the **source** only; repo-stored values are always labeled snapshots in the UI.
- Quote unit: `USD`, `points`, `percent`, `rate`.
- Event impact: `low`, `medium`, `high`.
- Untimed event `timeLabel`: `tentative` or `all_day`; timed events use `null`.

### Quotes and instruments

Each quote requires `symbol`, `label`, `instrumentType`, `price`, `changePct`, `unit`, `source`, `updatedAt`, `status`. Available quotes require finite numeric price, source and timestamp; `changePct` may be `null`. For `unavailable`, both numbers must be `null`. Source/timestamp may also be null. Quote timestamps cannot be later than the briefing. Preserve earlier quote timestamps when a provider has not refreshed; never relabel old data as current.

Use canonical symbols `NQ`, `ES`, `GC` for futures; `NDX`, `SPX`, `DXY` for cash indices; `NAS100` for a CFD; `XAUUSD` for spot gold; `US10Y` for a yield; `VIX`/`VXN` for volatility indices. These identities are checked. Yield units must be `percent`. Use `EURUSD`, `USDJPY`, etc. for spot FX and label the actual provider/venue. An explicit futures contract belongs in `label` (and, if desired, a more specific unique symbol such as `NQZ2026`). A CFD must never supply the NQ or NDX price slot. Yield `changePct` is relative percentage change, **not basis points**; use null if only basis-point change is known.

Symbols accept uppercase letters, digits and `: ^ ! . _ / = -`, maximum 40 characters. Prices/changes are numbers, not formatted currency strings. Supports/resistances are arrays of up to 10 finite numbers; they are published research levels, not streaming quotes.

### Research and movers

Prose is plain text, rendered with HTML escaping. Most prose values allow up to 1,600 characters; short fields (labels, source names, IDs, tags, regime, event values) allow 160. Themes and risks each allow up to 20 items. NQ has `bias`, `conviction`, `regime`, `summary`, `primaryCatalyst`, `primaryRisk`, `overnight`, `macro`, `volatility`, `sentimentShortTerm`, `sentimentMediumTerm` plus the three mover arrays. Each mover has `symbol`, `changePct`, `context`, `source`, `updatedAt`. A numeric move requires its timestamp; null price change does not imply zero. The dashboard now obtains stock/ETF row prices independently through the shared `/api/equities` cache. Do not insert current quotes into historical research or change this payload shape for the price feed. The quote adapter automatically includes the unique stock/ETF symbols in the current published snapshot.

### Economic events

`date` is the event's **Bangkok calendar day**. For known times set `datetime` with an explicit offset, `timeLabel: null`, and a matching Bangkok `date`. For genuinely unknown release time use `datetime: null` and `timeLabel: "tentative"`; do not invent midnight or a release time. All-day events use `all_day`. `timezone` stays `Asia/Bangkok`. Currency is a three-letter uppercase code. Forecast/previous/actual are short strings or `null` (strings allow values such as `3.2%` or `210K`). Do not invent forecasts or actuals.

The UI detects the viewer's device time zone (Bangkok fallback) and displays 12-hour times and today/the next seven local calendar days. Timed events are grouped by their converted date; untimed events keep their published date. Keep source timestamps and the Bangkok schema unchanged. It cannot infer calendar completeness from an empty array; empty coverage is labeled unpublished. Archived dates show the calendar as published, with known times converted for the viewer. Date-only archive labels do not shift.

For prose clock references on the briefing date, prefer explicit Bangkok notation such as `7:30 PM BKK` or `19:30 ICT`; these are localized at display time, as are existing `7:30p` references in the briefing's time zone. Put other-day release times in structured `events` instead of embedding an ambiguous clock in prose. Relative editorial terms such as "overnight" retain their original research context. Original stored text is never rewritten.

### Intelligence/news

Each item requires `id`, `source`, `headline` (max 240 chars), `url`, `summary` (max 600 chars), `publishedAt`, `tags` (up to 8), and `symbols` (up to 20). `publishedAt` may be null if unknown; never invent it and never use a future article timestamp. URLs for events/articles must be HTTPS without embedded credentials. Bloomberg-derived items use source `Bloomberg`, the original story link, and only our original short summary. No copied paragraphs or full newsletters.

## Failure and recovery

- Parse/validation failure: clear error, non-zero exit, previous files untouched.
- Candidate type/build failure: previous files untouched, temporary staging removed.
- Promotion I/O failure: prior bytes restored and new archive removed if necessary.
- Crash during promotion: fsynced temp-file renames prevent truncated JSON; `.intel-work/recovery.json` retains prior bytes. Two files cannot be renamed as one filesystem transaction, so the updater replaces the archive first, then current. All deployable changes become atomic at the Git commit/Vercel deployment boundary. Repository validation blocks inconsistent partial state.
- Concurrent update/publish: refused by exclusive lock files. Do not run parallel daily jobs.
- Repeating an identical normalized payload is a no-op. Same-day successful updates replace that day's snapshot; Git retains intraday revisions. Older days remain untouched.
- A bad `current.json` response in a deployed browser falls back to the latest valid archive, with a visible recovery label; if all data fails, each section degrades gracefully and charts remain usable.

After an interrupted process, first verify no updater/publisher process remains. If a recovery journal exists, run:

```sh
npx tsx scripts/intel.ts recover
npm run intel:validate
npm run build
```

Never remove a recovery journal without restoring or inspecting it. If a crash occurred before a journal was created, current data was not promoted; inspect the working tree and run validation before removing the stale `.intel-work/update.lock`/`publish.lock` and retrying. A publisher lock can remain after a crash and is removed manually only after confirming that process is no longer active. If a local validated commit was made before interruption, inspect `git status`/`git log` and the remote before retrying. Do not delete unrelated files or reset unrelated changes.

## Complete valid example

The following is the full fixture from `data/intel/example.json`. It is deliberately `kind: "example"` and **will be refused by the production updater**. Build a new payload from actual research with `kind: "briefing"`; do not simply relabel these synthetic numbers. Nulls and empty arrays are preferable to unsupported data.

```json
{
  "schemaVersion": 1,
  "kind": "example",
  "asOfDate": "2026-01-15",
  "generatedAt": "2026-01-15T08:00:00+07:00",
  "timezone": "Asia/Bangkok",
  "provenance": { "source": "Documentation fixture", "note": "EXAMPLE ONLY. Synthetic research and numbers for schema and UI tests. Never publish this fixture." },
  "overview": {
    "sentiment": "neutral", "confidence": "low", "volatilityOutlook": "stable",
    "oneLineTake": "EXAMPLE: Wait for the scheduled release before reassessing the research view.",
    "themes": ["EXAMPLE: Macro uncertainty remains the dominant theme."],
    "risks": ["EXAMPLE: An unexpected release could change the volatility outlook."]
  },
  "markets": [
    { "symbol": "NQ", "label": "E-mini Nasdaq 100 continuous futures", "instrumentType": "futures", "price": 20000, "changePct": 0.25, "unit": "points", "source": "Synthetic test fixture", "updatedAt": "2026-01-15T07:50:00+07:00", "status": "delayed" },
    { "symbol": "US10Y", "label": "US 10-year Treasury yield", "instrumentType": "yield", "price": 4, "changePct": null, "unit": "percent", "source": "Synthetic test fixture", "updatedAt": "2026-01-15T07:50:00+07:00", "status": "snapshot" },
    { "symbol": "VIX", "label": "CBOE Volatility Index", "instrumentType": "volatility_index", "price": null, "changePct": null, "unit": "points", "source": null, "updatedAt": null, "status": "unavailable" }
  ],
  "nq": {
    "bias": "mildly_bullish", "conviction": "low", "regime": "EXAMPLE: Range-bound",
    "summary": "EXAMPLE: A synthetic Nasdaq briefing used to demonstrate the complete contract.",
    "primaryCatalyst": "EXAMPLE: Scheduled economic release.", "primaryRisk": "EXAMPLE: Weak participation.",
    "overnight": "EXAMPLE: Session context.", "macro": "EXAMPLE: Rates context.", "volatility": "EXAMPLE: Options and volatility context.",
    "sentimentShortTerm": "neutral", "sentimentMediumTerm": "mildly_bullish",
    "megaCaps": [{ "symbol": "MSFT", "changePct": null, "context": "EXAMPLE: Leadership context without a quoted move.", "source": "Synthetic test fixture", "updatedAt": null }],
    "semiconductors": [{ "symbol": "NVDA", "changePct": 0.5, "context": "EXAMPLE: Synthetic move for testing.", "source": "Synthetic test fixture", "updatedAt": "2026-01-15T07:50:00+07:00" }],
    "premarket": [{ "symbol": "AAPL", "changePct": null, "context": "EXAMPLE: No price supplied.", "source": "Synthetic test fixture", "updatedAt": null }]
  },
  "fx": {
    "macroPulse": "EXAMPLE: A synthetic dollar view, not current market research.",
    "instruments": [
      { "symbol": "EURUSD", "bias": "neutral", "driver": "EXAMPLE: Waiting for data.", "posture": "Wait for confirmation", "support": [1.05], "resistance": [1.1], "comments": "EXAMPLE levels only." },
      { "symbol": "USDJPY", "bias": null, "driver": null, "posture": null, "support": [], "resistance": [], "comments": null }
    ]
  },
  "events": [
    { "id": "example-release", "datetime": "2026-01-15T19:30:00+07:00", "date": "2026-01-15", "timeLabel": null, "timezone": "Asia/Bangkok", "currency": "USD", "country": "United States", "impact": "high", "title": "EXAMPLE economic release", "forecast": null, "previous": null, "actual": null, "source": "https://www.forexfactory.com/calendar" },
    { "id": "example-tentative", "datetime": null, "date": "2026-01-16", "timeLabel": "tentative", "timezone": "Asia/Bangkok", "currency": "JPY", "country": "Japan", "impact": "medium", "title": "EXAMPLE tentative event", "forecast": null, "previous": null, "actual": null, "source": "https://www.forexfactory.com/calendar" }
  ],
  "intelligence": [
    { "id": "example-macro", "source": "Example source", "headline": "EXAMPLE: Macro story headline", "url": "https://example.com/macro", "summary": "Original synthetic summary for documentation. This is not a real news article or copied publisher text.", "publishedAt": "2026-01-15T07:30:00+07:00", "tags": ["Macro", "Rates"], "symbols": ["DXY"] },
    { "id": "example-tech", "source": "Example source", "headline": "EXAMPLE: Technology story headline", "url": "https://example.com/tech", "summary": "Synthetic technology summary for filter testing.", "publishedAt": null, "tags": ["Technology"], "symbols": ["NQ"] }
  ]
}

```
