## CSV preview and mock testing

Sign in and open **Trade history → Preview CSV** (`/trades/preview`). Download the
mock file on that page, select it, and press **Preview CSV**. Expect **36 records:
30 valid, 6 invalid, 2 repeated**. The last six records deliberately test validation
failures; remove them for a valid-only file. Quoted multiline notes count as one
CSV record. See CP29 in [CHECKPOINTS.md](CHECKPOINTS.md) for individual cases.

Preview stays in your browser. Once every record is valid, **Confirm import**
sends the CSV for server validation and saves the entire batch to your default
account. Repeated records require explicit acknowledgement. The same validated
batch in the same order returns its original receipt on retry or reload; different
or overlapping files are not deduplicated. Imported reviews are timestamped at
import time. No currency conversion or balance adjustment is performed.

CP31 requires migrations through `0008_import_trade_links`. Follow [MIGRATIONS.md](MIGRATIONS.md)
before starting the updated app. The sample's final six invalid records must be
removed before importing; its two repeated records can be kept intentionally.
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

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

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
`npm run release:verify -- --expect-ref origin/codex/cp32-release-preflight`.
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
