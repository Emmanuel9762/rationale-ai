## CSV preview and mock testing

Sign in and open **Trade history → Preview CSV** (`/trades/preview`). Download the
mock file on that page, select it, and press **Preview CSV**. Expect **36 records:
30 valid, 6 invalid, 2 repeated**. The last six records deliberately test validation
failures. For successful import testing, download the **import-ready CSV** instead:
**30 valid, 0 invalid, 2 repeated**, with 5 open trades, 4 closed without P&L and
21 closed with P&L. Quoted multiline notes count as one
CSV record. See CP29 in [CHECKPOINTS.md](CHECKPOINTS.md) for individual cases.

Preview stays in your browser. Once every record is valid, **Confirm import**
sends the CSV for server validation and saves the entire batch to your default
account. Repeated records require explicit acknowledgement. The same validated
batch in the same order returns its original receipt on retry or reload; different
or overlapping files are not deduplicated. Imported reviews are timestamped at
import time. No currency conversion or balance adjustment is performed.

CP31 requires migrations through `0008_import_trade_links`. Follow [MIGRATIONS.md](MIGRATIONS.md)
before starting the updated app. The import-ready sample preserves the original
validation sample's valid records in the same order, including its two intentional
repeats. If you already imported that valid subset, it returns the same receipt.
Use a test account for mock data. Preview alone never changes the journal.

**Import history** lists your saved receipts with original counts and links to
newly imported trades. Batch filters persist when narrowing the journal, paging
or exporting CSV. Linked trades show current values after edits. Older CP30
receipts may have no links; they are displayed without guessing trade membership.


This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel. Shared journal styling and UI verification are documented in [UI_GUIDE.md](UI_GUIDE.md).

## Manual review (CP56)

On **Review evidence**, choose dates and expand **Review this evidence with an
external model**. Download a private JSON packet, choose whether to share it with
your model, then paste the JSON reply for validation and an unsaved, cited draft.
Rationale makes no model call or journal write. [MANUAL_REVIEW.md](MANUAL_REVIEW.md)
has the steps, input limits and acceptance checks.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## CP32 release verification

After fetching and successfully switching to the intended checkpoint, run
`npm run release:verify -- --expect-ref origin/main`.
The read-only gate requires an exact, clean checkout before database verification;
expect nine migrations and zero pending. It never applies migrations. See
[RELEASE.md](RELEASE.md) for Fish commands, preserving README edits, environment
pairing and browser acceptance. No schema or dependency change in CP32.

## Recorded outcome filters (CP33)

Trade history can filter wins, losses, break-even, closed trades with P&L, or
closed trades missing P&L. Outcomes require both an exit price and exit time and
use recorded P&L rather than calculating profit from prices. The selection combines
with batch, group, date and review filters and survives pagination and CSV export.
Open status plus an outcome is rejected as conflicting. No migration is required.

## Inspect performance samples (CP34)

On Performance, select a Total, Open / incomplete, Closed without P&L or Closed with
P&L count to inspect its trades. Group and entry dates carry into the journal and
CSV export. Zero counts open an empty result. These views use current saved values,
so later edits can change membership. No new migration is required.

## Consolidated baseline (CP47)

CP41–46, including the redesigned journal, are merged on `main`. Fetch, switch
successfully and fast-forward before running
`release:verify -- --expect-ref origin/main`; see RELEASE.md for the Fish sequence
and acceptance checks. Nine migrations remain required.

MT5 ingestion is the next proposed milestone. [MT5_IMPORT.md](MT5_IMPORT.md)
defines the source-sample requirements, execution identity, reconciliation and
test cases. Automatic logging is not implemented; existing imports still require
Rationale's CSV format.

## Journal follow-up (CP37)

The dashboard links to all open/incomplete trades, closed trades missing P&L and
closed trades awaiting review. Counts cover all of your accounts and the selected entry dates,
including trades beyond the first journal page. A closed trade can appear in both
missing-P&L and awaiting-review queues; counts should not be added together. Open
trades are not necessarily errors. Saving a review updates the review count while
leaving missing P&L unchanged. No new migration is required.

## Dashboard entry dates (CP38)

Use From/Through entry dates on the dashboard to limit metrics, follow-up counts
and recent trades to one period. Both UTC boundary days are included; blank bounds
are unrestricted and All time clears the period. Dates refer to entry time even
when a trade closes later. Journal queue links, View all matching trades and
View performance for these dates preserve the period. Invalid or reversed dates
show an error instead of displaying broader results. No new migration is required.

## Return to your journal selection (CP39)

Opening a trade or its review from Trade history retains the active filters and
page. Back to trades returns to that selection after review saves, trade edits or
conflict reloads. The selection is refreshed, so reviewed trades leave an unreviewed
queue and edits may move a trade out of its old filters. If a page becomes empty,
use Return to the first page. Direct trade URLs still return to the full journal.

## Journal counts (CP41)

Trade history shows the total matching trades across all pages alongside the
number on the current page. Counts use the same filters and ownership scope as
journal rows and export, including import batches. An empty later page can still
have matches on earlier pages; use Return to the first page. Invalid filters show
an error without a count. Counts describe current records, not original import
receipt totals, and are not limited by the CSV export cap.

## Outcome counts in Performance (CP42)

Each performance group shows winning, losing and break-even trade counts. These
partition its closed trades with recorded P&L; missing P&L and incomplete trades
remain separate. Select a count to inspect that outcome in the journal with the
group and UTC entry dates preserved. A zero count opens an empty matching set.

## Performance summary CSV (CP43)

Use Export performance (CSV) on Performance to download setup, symbol and plan
adherence breakdowns for the selected UTC entry dates. Each row includes its
dimension, group, missing-label flag, dates, counts and recorded metrics. Adherence
groups use stable keys such as followed, partly and unreviewed. Blank date bounds
mean unrestricted. Empty results produce a header-only file. Blank metrics mean
no applicable sample; measured zero remains zero, and ∞ means no recorded losses.
Groups overlap across dimensions, so do not add their totals together. Currency
conversion is not applied. This is a summary, not a trade import or database backup.

Exports reject more than 2,000 combined group rows rather than truncate them.
Narrow the dates if needed. Formula-like labels receive a protective apostrophe;
recorded numeric values retain their decimal precision and negative signs.

## Monthly performance (CP44)

Performance and its summary CSV now include a fourth dimension: UTC entry month.
Rows are chronological and omit months without entries. Metrics follow entry
cohorts even when a trade closes later; this is not an exit-date cash-flow report.
Selected dates can make boundary months partial, and every monthly journal link
uses the intersection of that month and the selected period. CSV dimension month
uses YYYY-MM group keys; its date columns record the overall report selection.
The existing 2,000-row export cap applies across all four dimensions combined.

### Quick entry dates (CP45)

Dashboard and Performance offer Last 7 days, Last 30 days, This month and Last
month. All use UTC entry dates. Rolling ranges include today; this month ends
today, including its incomplete day. Last month covers the full preceding month.
Links resolve to explicit from/to dates when rendered, so bookmarks retain those
dates. Manual bounds and All time remain available; matching journal and export
links carry the selected dates as before.

### Journal reading and navigation (CP46)

The journal puts entries first. Expand **Filters** to narrow the list; active
filters open automatically and appear as removable chips. Removing a chip keeps
other constraints and returns to page one. Desktop uses a table with setup
context; mobile shows the same fields as cards. **How to read this journal**
explains outcome, review and export semantics. Trade detail separates execution
from rationale and notes, with a **Jump to review** link. All existing filtered
exports, pagination, import context and review/edit return links remain available.

### Paper-trading CSV mapping (CP48)

Open **Preview CSV → Map a paper-trade CSV** to map custom column names locally.
Download the included three-trade sample and follow [PAPER_IMPORT.md](PAPER_IMPORT.md).
Validate, inspect the result, then download a compatible file and use the existing
preview/confirmation flow to save it. Only whole-trade rows with UTC timestamps
are supported. This is not broker sync or a certified TradingView/MT5 adapter.
No migration required; overlapping histories are not deduplicated.
