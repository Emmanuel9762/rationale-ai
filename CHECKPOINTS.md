# RationaleAI checkpoint handoff

Baseline: `027f5d3` (CP6B, persisted entries using IPv4 Neon HTTP).

Current handoff (2026-10-09): CP11–25 are merged on `main` (`411ee2d`) and its
CI passed, including Chromium workflows. The working `cp13-auth` database passed
a read-only audit: seven matching migrations, zero pending, and all required
schema checks. The owner confirmed live password reset works; earlier pending
recovery/PR consolidation notes below describe historical implementation status.

## CP7 — reproducible migrations

The original two migrations already match the schema; no rewrite or new schema
migration was necessary. Added an isolated PostgreSQL replay test and an IPv4
migration command. See MIGRATIONS.md before running against any existing data.

## CP8 — read the journal

`/trades` lists 25 entries per page; `/trades/[id]` shows the saved trade and
rationale. Queries join accounts and users to enforce the supplied email scope.
Invalid and out-of-scope IDs do not return records. Tests cover persistence,
pagination, deterministic ordering, missing IDs and ownership boundaries.

## CP9 — correct and close trades

`/trades/[id]/edit` uses the same form and parser as creation. Exit price/time
must be supplied together; exit cannot precede entry. Open trades cannot carry
realized P&L. Decimal strings preserve database precision; dates are explicitly
UTC and reject invalid calendar dates. Failed saves retain the form contents.

The app reuses the oldest existing development account instead of inserting an
account on every save. Existing duplicate accounts and their trades are retained.
CP12 below resolves concurrent default-account creation without deleting legacy
accounts. This remains a single-user development application.

Previous timestamps were interpreted in the server's timezone. Existing stored
values are displayed without retroactive conversion. Check old entries manually
if your original server used a non-UTC timezone. New/edit forms explicitly use UTC.

## CP10 — real dashboard metrics

The database sums decimal P&L, scoped to the development user. Only trades with
both exit fields and recorded P&L count toward realized P&L, win rate and profit
factor. Break-even entries count in the win-rate denominator. Missing P&L and
open/incomplete rows remain visible separately. Currency conversion is not
implemented; entered P&L must use one account currency. P&L is broker-entered,
not calculated from price/quantity without instrument specifications.

## Verification and local smoke check

Run `npm ci`, `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.
Tests use isolated PGlite databases and never connect to Neon. A build needs a
syntactically valid DATABASE_URL but does not query it during prerendering.

With your existing private `.env.local`, run `npm run dev`, then:

1. Log an open trade. Confirm its detail page and history persist after refresh.
2. Edit its notes, then close it using a later exit time and broker-recorded P&L.
3. Confirm the same trade ID remains and the dashboard totals change correctly.
4. Attempt an exit before entry; confirm a helpful error retains the form values.
5. Check existing CP6B trades are still visible and the IPv4 connection works.

No live Neon insertion, live migration history audit or browser end-to-end test
was performed in the implementation environment. No live schema changes were
made. Isolated tests do not establish live connectivity.

Before a public/multi-user release: replace the development identity with
session authentication, retain query-level ownership enforcement, and add
concurrency protection for simultaneous trade edits.


## CP11 — stable ownership and a server-side identity boundary

All journal reads, metrics and writes now take the UUID of the current user.
Only `src/lib/auth/development-user.ts` knows the legacy development email.
Every protected page and both Server Actions call `requireCurrentUser` before
accessing records. Changes to a user's email no longer change record ownership.
Submitted user/account IDs do not override the server-resolved identity.

`npm run dev` still resolves the existing development user. Production
(`npm run build` then `npm start`) redirects journal pages and save actions to
`/sign-in`. That page is deliberately a placeholder: no OAuth provider, real
session, registration, or public multi-user access has been added. Development
mode is still shared-user access and should remain local; it is not authentication.

`npm run test:access` starts an ephemeral production server against an unreachable
dummy database and verifies redirects for all five protected pages and both
save actions. Run it after a build. Next can stream an action redirect with
HTTP 200; the test verifies the explicit sign-in redirect header as well.

## CP12 — one default account per user

Migration `0002_default_accounts` adds `is_default` and a partial unique index
on user ID for default accounts. It marks each existing user's oldest account
as default (ties broken by account ID), matching the previous selection order.
No account, balance, trade, or owner is deleted or reassigned.

New default-account creation uses `INSERT ... ON CONFLICT DO NOTHING`, then
reads the winning account. The database index enforces uniqueness, including
requests from different application instances. Older non-default accounts remain
visible through user-scoped history and metrics.

Verification: 24 tests, TypeScript, ESLint, production build, diff check and the
production HTTP access check passed. PGlite tests cover simultaneous requests,
unique-index rejection, migration from a populated CP10 schema, unchanged legacy
trades/balances and repeat migration. PGlite serializes its underlying connection;
this is not a multi-connection Neon load test. The unique index is the concurrency
guarantee. No live Neon migration or post-upgrade smoke check was performed.

### Local rollout for CP11–CP12

1. Stop the development server before migrating; preserve `.env.local` and any
   uncommitted README edits. Install locked dependencies with `npm ci`.
2. Follow MIGRATIONS.md to verify existing migration history and test migration
   0002 on a disposable branch/copy of the database first. The new app requires
   this migration. Do not start it against the old schema.
3. Once the migration is verified and applied to the intended database, run
   `npm run dev`. Confirm existing trades are present, create two trades, and
   verify both use the same default account. Edit/close a trade and check metrics.
4. `npm start` deliberately shows the sign-in placeholder until real session
   authentication is implemented in a later checkpoint.

Next bounded step: choose and integrate a login provider, map its verified
identity to users.id, and explicitly decide how to link the existing development
journal. Never automatically assign old trades to the first person who signs in.

## CP13 — Neon sessions and explicit identity linking

Adds email/password sign-up/sign-in, account page and sign-out, replacing the
shared development identity in every environment. A validated provider session
resolves to an internal users.id via issuer + subject, never by email matching.
Migration 0003 adds nullable identity columns and a unique index; old journals
remain unclaimed until the database operator explicitly links their account.
`auth:link-legacy` performs that operation atomically and refuses conflicting
ownership or an already-populated new journal.

Neon branch `cp13-auth` was provisioned separately and migration 0003 applied there.
Production is unchanged. Earlier CP11–12 live-verification notes above describe
implementation-time status: their migrations were subsequently reconciled through
Neon, data preservation verified, and local migration/dev smoke checks passed.

CP13 verification: 26 tests, lint, typecheck, production build, signed-out access
checks, and a controlled HTTPS-provider integration test for signup/session refresh/
expiry/invalid credentials/signout. The form test caught and fixed a bound-action
error-response stall. SDK version is pinned. Live Neon HTTP signup, session refresh, signout rejection and sign-in passed
using localhost through the workspace proxy. The owner later confirmed local login
and linked trades. Automated browser acceptance remains a separate gate because
Chromium could not be downloaded. See subsequent CP14–16 entries and AUTH_SETUP.md.

## CP14 — full-app ownership and concurrent account checks

The owner confirmed local CP13 login and visibility of the linked legacy journal.
`test:isolation` runs the production Next app, real SDK and Server Actions against
an HTTPS auth fixture and migrated PGlite SQL fixture. Independent cookie jars
exercise dashboard/list/detail isolation, cross-owner action replay, forged owner
fields, valid owner edits, signed-out writes and session expiry. The app has no
fixture authentication bypass. Undici stays external to Next so its native transport
and the test-process-only request interception use the same module.

Verified: production build, lint, typecheck, full-app HTTP isolation. A live Neon
check on disposable `cp14-isolation-tests` (`br-quiet-forest-aevzheef`) exercised
12 independent HTTP account requests and the unique constraint; it passed and
cleaned up only its synthetic owner. No production or owner-journal writes.

`test:browser` adds two independent Chromium contexts. Its execution remains a
release gate: browser binary downloads failed in this workspace. The verified
CP14 increment covers HTTP application isolation and real Neon concurrency, not
browser rendering/cookie acceptance. CI will run the browser gate in CP16.

To run the live concurrency check, supply a disposable migrated branch URL as
ISOLATION_DATABASE_URL and ISOLATION_ALLOW_WRITES=1 in ignored `.env.isolation.local`,
then `npm run test:neon-concurrency`. Do not use your working journal branch.

## CP15 — password recovery and email-code verification

Adds forgot/reset-password forms, explicit APP_ORIGIN for safe reset callbacks,
verification send/resend/submit forms, account verification status and sign-in links.
The pinned Neon SDK owns reset tokens and OTP checks. Generic request notices do
not disclose account existence. Invalid/expired/reused credentials have retry paths.
Mandatory verification remains unchanged on the working Auth branch.

Verified: 27 unit/integration tests, lint, TypeScript production build, and real
Next/SDK HTTP tests against a controlled HTTPS provider covering reset validation,
unknown emails, successful password change, old-password rejection, token reuse,
OTP verification/reuse and provider throttling. Real inbox delivery and browser
interaction are explicitly pending acceptance checks; AUTH_SETUP.md gives steps.
No schema changes, live Auth policy changes or automated emails to the owner.

## CP16 — CI, read-only database audit and release rehearsal

Adds GitHub Actions checks on Node 24 using fixture services, a read-only
`db:verify` audit of migration history and required identity/account schema, a
repeatable production-fixture performance command, and RELEASE.md with exact Fish
reconciliation commands, browser/inbox acceptance and production gates.

Fresh Neon branch `cp16-release-rehearsal` (`br-rapid-darkness-aef70gft`) was copied
from production at CP12. The real migration script applied 0003; verification found
four matching migrations and the expected columns/indexes. A second migration run
succeeded without adding entries. Before/after fingerprints matched for all original
user fields, both accounts (including balances/ownership), and all four trades.
Production was not migrated or modified. No Auth provisioning, deployment or merge.

Verified locally: 28 tests, lint, typecheck/build, signed-out access, recovery/auth
HTTP checks, two-user isolation, real Neon concurrency and migration/audit rehearsal.
Production fixture first/warm timings are documented separately from live Neon or
browser measurements. Chromium downloads (including headless shell) returned invalid
archives, so automated browser execution remains unverified here. CI includes this
as a failing gate, not a silent skip. Real inbox delivery and laptop browser acceptance
remain required before public release. Check the PR for remote CI status.

## Preparation before CP17 — pagination regression tests

Basic pagination already exists: 25 rows per page, one extra row to determine
whether Next is available, and entry time + UUID descending order. CP17 should
extend this with filtering rather than introduce pagination from scratch.

Two small test-only increments cover exact-full-page/overflow/empty-later-page
boundaries, plus tied timestamps across multiple accounts and interleaved owners.
The tests verify that ownership is applied before pagination and unchanged data
produces repeatable pages. Focused repository tests, typecheck and lint passed.
No app behavior, dependencies, migrations or live database changes were needed.

Offset pagination can still shift during concurrent inserts or edits. These tests
prove ordering on unchanged data, not a snapshot across multiple requests. Cursor
pagination is a future option if journal size or browsing behavior warrants it.

## CP17 — journal filters with preserved pagination

Adds exact case-insensitive symbol, direction, lifecycle status and inclusive UTC
entry-date filters to /trades. A GET form stores selections in the URL, resets to
page 1 when applied, and preserves filters in Previous/Next links. Clear returns
to the complete journal. Invalid/duplicate filters show errors without fetching an
unfiltered list; empty filtered pages offer clear/first-page navigation.

The repository combines every filter with the authenticated user's ownership
predicate before applying the existing 25-row pagination. Closed still means both
exit price and exit time are present; incomplete legacy closes remain in Open /
incomplete. The through date uses an exclusive next-midnight bound to include the
whole UTC day. Dashboard metrics continue to cover the whole journal.

Verified: 34 tests, typecheck, lint, clean production build, signed-out access and
full-app HTTP isolation/filter tests. Coverage includes literal wildcard/injection
text, tied rows across filtered pages, UTC boundaries, malformed URLs and owner
isolation. Browser filter apply/clear checks are included in the CI browser suite;
local browser execution was unavailable in this workspace. The first build hit an
existing Turbopack persisted-cache panic; rebuilding with a fresh cache passed.
No dependency, migration, environment or live database changes.

Local verification: switch to codex/cp17-journal-filters, run npm test and npm run dev.
At /trades filter a known symbol, combine direction/status/dates, refresh, and clear.
For more than 25 matches, verify Next/Previous preserve selections; applying a new
filter from page 2 returns to page 1. Both entry-date boundaries use UTC.

## CP18 — performance by setup and symbol

Adds the authenticated /performance page, linked from dashboard and history.
All-time tables show total trades, open/incomplete trades, closed trades missing
P&L, measured sample size, win rate and total recorded P&L per setup and symbol.
Rows are alphabetical; sample sizes and denominator definitions are explicit.
Unmeasured groups display dashes for results, distinguishing missing data from zero.

Dashboard and breakdowns share aggregate expressions and lifecycle calculations.
Only closed trades with recorded P&L contribute to performance; break-even trades
remain in the win-rate denominator. Ownership is applied before grouping across
accounts. Symbols ignore case; setups are trimmed but retain case. NULL/blank setups
form a missing-label group without absorbing a literal label with the same display
text. Amounts remain PostgreSQL decimal strings through formatting. All included
accounts must use the same currency; currency conversion is not implemented.
History filters do not affect these all-time tables.

Verified: 35 tests, lint, typecheck/build, full-app HTTP performance/isolation tests,
and signed-out access checks for six protected pages. Tests cover mixed outcomes,
missing P&L, incomplete closes, multiple accounts, other owners, empty journals and
exact aggregate cents beyond JavaScript's safe integer-cent range. The HTTP fixture
now preserves SQL result columns by position, avoiding duplicate aggregate column
names overwriting each other. Browser page/empty-state checks are added to CI;
local Chromium execution remains unavailable. No migration, dependencies, environment
or live database changes. The owner's local authentication acceptance remains pending
by agreement; CP18 does not claim those checks passed.

Local check: switch to codex/cp18-performance, run npm test and npm run dev, then
open Performance from the dashboard. Compare a known setup/symbol with its trades;
confirm open-only groups have no measured result. A closed win, loss and break-even
trade yield a sample of three and a 33.3% win rate. Next planned checkpoint: structured
trade reviews (CP19), subject to its own bounded implementation and verification.

## CP19 — structured trade reviews

Each trade detail page now has a separate review: explicit plan adherence,
what went well, and what to improve next time. At least one reflection is required;
each is capped at 2,000 characters. Open and closed trades can be reviewed. A save
replaces the previous review and records its UTC save time; this is not an audit
history or an immutable pre-trade plan. Existing rationale and notes remain intact.

A dedicated authenticated Server Action validates inputs and updates review fields
only, with the owner predicate inside the SQL update. Trade edits preserve reviews.
Migration 0004 adds nullable fields; old trades remain unreviewed. db:verify now
checks the review columns as well as migration history and existing auth schema.
No dependency or environment changes and no live database changes.

Acceptance remains pending by the owner's request, including prior checkpoints.
When ready: follow MIGRATIONS.md, open an existing trade, save a review, refresh,
edit it, and check that rationale/P&L remain intact. Try an empty reflection for a
validation error and confirm another signed-in account cannot access the trade.
Automated browser coverage for save/refresh is included in the CI fixture suite.

Verified for CP19: 37 tests, lint, production build including TypeScript,
signed-out access checks, and full-app HTTP review validation/save/reload/replacement,
cross-owner and signed-out denial, plus existing journal/performance isolation.
The initial build hit the previously observed persisted Turbopack cache panic;
a fresh cache resolved it. Browser checks are committed for CI but were not run
locally. Live migration and laptop acceptance remain pending.

## CP20 — retry-safe trade creation

New-trade forms receive a server-generated UUID submission key. The action retains
it across validation/save errors, validates it independently of trade fields, and
resolves the account from the authenticated owner. A unique account/key index
arbitrates competing inserts. Replaying the same validated payload returns the
original trade; a different payload with a used key is rejected. A SHA-256 creation
fingerprint remains separate from editable trade data, so replay cannot undo later
edits. Equivalent decimal spellings are normalized without floating-point arithmetic.

This is per-submission protection, not content-based deduplication. Freshly loaded
forms have new keys and can intentionally save identical trades. After a reload or
new form, check history if a previous save was uncertain. No browser draft storage
or offline queue is introduced. Account reassignment/default-account switching is
not part of the current UI; future support must preserve the submission scope.

Migration 0005 adds nullable submission key/hash columns and their unique index.
Legacy records retain null values; no historical trades are merged. db:verify
checks these additions. No dependencies, environment variables or live DB changes.

Verified: 39 tests, lint, production build including TypeScript, signed-out access,
and full-app HTTP checks. The HTTP fixture commits a trade then returns a failed
insert response; retrying the returned form finds the original row. Tests also
cover concurrent replays, changed payloads, validation key retention, different
owners sharing a key, separate new keys and replay after editing. Existing review,
filter and performance checks still pass. Hydrated browser key/value retention
coverage is included for CI; it was not run locally. PGlite concurrency tests do
not replace a real Neon concurrency rehearsal.

Acceptance update: owner reports trade editing and review persistence working.
Private-window access with the same credentials is expected; separate-account
isolation remains a distinct check. Live password-reset email arrives but its link
loads indefinitely; recovery acceptance remains unresolved. CP20 does not fix or
claim to fix that issue. PR consolidation and production release remain pending.

## CP21 — conflict-safe trade and review edits

Trades now carry an integer revision, initially zero. Both trade edits and review
saves require the form's original revision and increment it in the same SQL UPDATE
that checks ownership. Exactly one competing save at a given revision can succeed.
An owned but newer row raises a conflict; missing/other-owner rows remain unavailable
without revealing their revision or content. Missing/malformed revisions are rejected.

One shared revision intentionally covers both forms: a review based on an outdated
rationale/outcome must not silently save after a trade edit, and vice versa. This is
optimistic concurrency control, not an edit history, automatic merge or live sync.
Create-submission replay remains independent and never increments the revision.

Conflicts retain draft fields and the original revision, disable repeat submission,
and provide an explicit full reload link labelled as discarding the draft. Copy
anything needed before loading the latest saved version and reapplying changes.
Review saves now show an inline success notice and advance their form revision,
allowing another review edit without a manual refresh. Stable component identity
keeps a server revalidation from silently replacing a stale draft/revision.

Migration 0006 adds revision NOT NULL DEFAULT 0; existing trade values and reviews
are preserved. db:verify checks the added column. No new dependencies/environment
variables and no live database changes. All writers must participate in revision
checks: an older app instance or direct SQL edit can bypass this application policy.

Verified: 41 tests, lint, production build including TypeScript, signed-out access,
and full-app HTTP conflict/save/recovery checks. Tests cover competing saves,
trade/review cross-conflicts, owner isolation, unchanged rows after rejection,
revision validation, stale draft retention in full-page responses, current-version
recovery, and successive review saves. CP20 lost-response/retry, filters, metrics
and review checks still pass. Hydrated two-tab tests are included for CI; Chromium
is unavailable locally, so local browser acceptance is not claimed.

Acceptance update: owner reports all 39 CP20 tests passed locally and db:verify
confirmed six migrations with zero pending. Password-reset link loading remains
unresolved; separate-account isolation acceptance and PR consolidation remain pending.
Next planned feature checkpoint: CP22 review queue/status filters, after reconciling
CP21 verification and the outstanding recovery issue.

## CP22 — preserve controlled forms after validation

CP21's remote browser gate failed on correcting an invalid create form and saving
again; unit, HTTP, auth and build gates passed. Controlled trade/review forms now
cancel the native reset fired when a React action completes, preserving selector
and input state until explicit navigation/reload. The browser regression checks
all entered fields after the server-side validation error, then corrects and saves.
No schema or dependencies change. Browser confirmation is delegated to CI because
workspace Chromium downloads return invalid archives. This repair takes priority
over adding archive/restore; the next increments are review queue and CSV export.

## CP23 — review queue and history status

History now filters Reviewed/Unreviewed and displays review links per row. Dashboard
and history link to Needs review: closed trades without a saved review. Both exit
fields are required for closed status. Review predicates apply with ownership and
all existing filters before pagination, with URL selections preserved. Saving a
review revalidates history and removes the trade from the queue. Reviewed means a
reflection was saved, not that it was written after the most recent trade edit.

Verified: 42 tests, lint, production build/typecheck, and HTTP queue/save/ownership
checks. Tests cover >25 matches, incomplete/open trades, another owner, saved-review
removal, invalid filters and combined selections. No migration or dependencies.
CP22 browser validation recovery passed remotely; its later conflict check exposed
a textarea label lookup issue. Follow-up markup separates labels from textarea
content so labels remain stable after a controlled value changes.

## CP24 — private, filtered CSV export

History exports all matching trades across pages, in the same stable order and
with the same owner/filter predicates as the journal. Export is capped at 2,000
rows; larger selections return an explicit error without silently truncating.
CSV preserves recorded decimal strings and UTC timestamps, handles quotes and
multiline text, and prefixes formula-like text with an apostrophe. Numeric fields
remain numeric text, including negative P&L. Empty matches produce a header.

The authenticated download is private/no-store and excludes auth information,
submission keys/hashes and concurrency metadata. Notes and review text are included;
this is a journal export, not a full database backup. Invalid filters fail closed.
No dependencies, environment changes or migrations; CP21's revision migration
remains required (seven migrations total). No live database changes were made.

Verified: 44 unit/database tests, lint, production build/typecheck, seven signed-out
route checks, and full-app HTTP tests including all-page export, cross-owner denial,
invalid/duplicate filters, empty results, size limit and download headers. Browser
download and conflict checks are included in CI; see PR checks for their final result.

Acceptance: correct an invalid create form without losing its values; open Needs
review, save a closed trade's reflection and confirm it leaves the queue; export
a filtered journal and check matching trades from all pages and notes/reviews.
The previously reported real-provider password-reset link issue remains unresolved.

### Browser recovery follow-up

The remote browser checks exposed a genuine review-recovery issue: the reload
link included #review, causing same-document scrolling and retaining a stale
draft. Its target now omits the fragment so recovery reloads server data. Both
edit/review tests explicitly wait for DOMContentLoaded before inspecting the
recovered form; this prevents a premature assertion from hiding navigation bugs.

## CP25 — performance by entry-date period

Performance now accepts optional From/Through entry dates in UTC for both setup
and symbol breakdowns. SQL filters run before aggregation and remain combined
with account ownership. The end day is inclusive via an exclusive next-midnight
boundary; trades closed later still belong to their entry-date period. Blank
bounds are unrestricted. Dashboard totals remain all-time. Matching history links
carry the same dates, and All time clears the range and its form values.

Existing journal date validation rejects invalid, reversed and repeated dates;
invalid requests render errors without querying/rendering breakdown totals. Empty
periods have a distinct message. URLs preserve the range for refresh/bookmark use.
No schema, dependencies or environment changes. No live database writes performed.

Verified locally: 45 tests, lint, clean production build/typecheck, and full-app
HTTP checks for selected/empty/invalid ranges, matching history links and owner
scope. Boundary tests cover start/end midnight, one-sided ranges, later exits,
open trades, exact decimal totals and both grouping dimensions. Browser checks
apply an empty range then restore All time and verify the date input clears;
these run in GitHub CI because workspace Chromium installation is unavailable.

Acceptance: choose a period containing known entries, inspect both tables and
View matching trades; choose an empty period; reverse the dates; restore All time.
CP22–24 CI passed on 49b3827. Their live local acceptance, real-provider reset-link
recovery, and PR consolidation remain pending unless separately confirmed.

## CP26 — compare outcome size as well as win rate

Setup and symbol breakdowns now show average recorded P&L, average win, average
loss size, and profit factor for the selected entry-date period. Average P&L
includes break-even trades in the measured sample. Win/loss averages use only
their applicable outcomes; loss size is positive. Missing samples display dashes,
while measured zero averages display 0.00. Profits with no losses show an infinite
profit factor; break-even-only groups show a dash. Sample-size and currency
limitations remain visible. These are recorded outcomes, not a forecast or
risk-normalized expectancy.

Shared SQL aggregation computes and rounds averages and profit factor using
PostgreSQL numeric arithmetic, retaining decimal strings through rendering.
The dashboard's existing profit factor also uses that precise calculation rather
than JavaScript floats. Ownership, lifecycle exclusions and UTC period boundaries
apply before aggregation. No migration, dependency or environment changes.

Verified locally: 46 tests, lint, production build including TypeScript,
signed-out access, auth/recovery HTTP fixtures, and full-app HTTP isolation.
Coverage includes positive/negative half-cent rounding, profit factor 2.675 → 2.68,
no wins/losses, break-even samples, large totals, owner scope, period boundaries,
and a 66.7% win-rate group with negative average P&L. HTTP checks assert rendered
average cells; the Chromium gate checks headers and open-only missing values.
Local Chromium download failed with invalid archives; remote CI is the browser
acceptance gate and must pass before this feature is considered ready.

Acceptance: inspect a known setup over a chosen period, compare recorded P&L / its
measured sample with Average P&L, and compare winning/losing trade amounts with
their separate averages. An open-only group should display dashes; a break-even
group should display 0.00 for Average P&L. Horizontal table scrolling accommodates
the additional columns on narrow screens. See RELEASE.md to reconcile `main`.

## CP27 — inspect the trades behind a performance group

Setup and symbol labels on `/performance` now link to the corresponding journal
with the selected UTC entry dates. Missing-label groups have their own explicit
filter, distinct from a literal setup named "Not specified". The journal adds an
exact, case-sensitive setup field and a missing-label selector. These filters
combine with existing history filters and persist in pagination and CSV exports.
Contradictory exact/missing labels, repeated parameters and oversized setup labels
show validation errors; invalid CSV requests return 400 rather than broadening.

`tradeGroup` shares the SQL normalization between aggregation and repository reads:
ordinary surrounding spaces are removed, symbols ignore case, and setups retain
case. Drill-down includes the group's total sample, including open trades and
closed trades without P&L, so it can explain every count in the performance row.
Labels are URL-encoded and bound as SQL parameters. No migration, dependency or
environment changes; no live database writes.

Verified locally: 48 tests, lint, typecheck, production build, signed-out access
and full-app HTTP checks. Database tests compare every setup/symbol group's total
against its exported and paginated journal, including >25 matches, missing values,
literal "Not specified", mixed case/spaces, tabs, special characters, owner scope
and date boundaries. HTTP checks cover links, form values, scoped results, export
links and invalid requests. The CI browser gate follows a dated setup link, checks
the form/export range and clears filters; local Chromium remains unavailable.

Acceptance: choose dates on Performance, select a setup or symbol, and compare
the journal with its Total trades count. Export the selection or narrow it to
closed trades. Use Clear filters to restore the complete journal. CP27 builds on
CP26 (PR #13); fetch and switch to `codex/cp27-performance-drilldown` to try it.

## CP28 — compare outcomes by plan adherence

Performance now includes a plan-adherence breakdown using the latest saved review:
followed, partly followed, and did not follow. Unreviewed trades stay separate;
legacy reviewed rows without a valid assessment have their own group. Each row
links to its complete journal sample with UTC entry dates preserved. The journal
adds an adherence selector retained in pagination and CSV exports. Review saves
invalidate Performance as well as the journal and detail page.

Aggregation and drill-down share the same SQL classification, including open and
missing-P&L trades in total counts. Existing numeric outcome calculations and
owner scope apply unchanged. The page explains that these are self-assessments
and descriptive comparisons, not evidence of causation. No migration, dependency,
environment changes or live database writes.

Verified locally: 49 tests, lint, typecheck, production build, signed-out access
and full-app HTTP checks. Coverage includes every classification, malformed legacy
assessments, >25 matches, CSV/pagination parity, combined filters, entry-date
boundaries, owner isolation and regrouping after review edits without P&L changes.
HTTP checks verify dated links, selected filters, scoped CSV and invalid queries.
The CI browser gate follows an adherence link, checks dates/export and clears the
filter. Local Chromium remains unavailable; remote CI is the browser gate.

Acceptance: open Performance, choose dates, select a plan-adherence group and
compare its Total trades with the matching journal. Edit one trade's review,
return to Performance and confirm its group changed. CP28 builds on CP27 (PR #14);
fetch and switch to `codex/cp28-plan-adherence` to try it.

## CP29 — validate a trade CSV before importing

The journal now links to `/trades/preview`, a protected page that reads a selected
UTF-8 CSV entirely in the browser. It shows valid records, row-specific errors,
open/closed sample counts and repeated normalized rows, with expandable notes and
reviews. Changing or clearing the file removes the old preview. Files are limited
to 256 KiB and 500 data records. Malformed CSV structure rejects the whole file;
invalid trade values identify their logical CSV record without hiding valid rows.

Trade and review validation are shared with existing forms. CSV timestamps use
explicit UTC ISO seconds with optional three-digit milliseconds; the existing
minute-based trade forms retain their contract. The CSV reader handles BOM,
CRLF/LF, quoted commas, doubled quotes and multiline notes. Export metadata is
ignored, never used as ownership instructions. Protective text apostrophes remain
literal. Repeats compare normalized trade/review fields within the file only;
there is no journal lookup, deduplication or batch save in this checkpoint.

The downloadable `public/samples/rationaleai-mock-trades.csv` contains 36 synthetic
records: 30 valid, 6 deliberately invalid, 2 repeated. Counts include repeats:
5 open, 4 closed without P&L, 21 closed with P&L. Record 30 repeats record 4;
record 31 repeats record 2. Records 32–37 respectively exercise zero quantity,
partial closure, invalid calendar date, exit before entry, invalid adherence and
excess decimal precision. Record 5 contains quoted multiline notes. Header is
record 1; multiline fields do not increase record numbers. Remove the final six
records for valid-only testing. Data is fictional, not broker or market data.

Verified locally: 56 tests, lint, typecheck, production build, protected access
and full-app HTTP isolation. Added browser checks cover sample counts, errors,
repeats, multiline details, replacement/reset, no POST requests and unchanged
stored trades. Remote CI supplies Chromium acceptance; local Chromium remains
unavailable. No database migrations, dependencies or environment changes.

Acceptance: fetch and switch to `codex/cp29-csv-preview`, start the app, open Trade
history → Preview CSV, download the mock file and preview it. Expect the counts
above and no new trades in history. CP29 is stacked on CP28 (#15). Next checkpoint:
explicit batch confirmation with server-side revalidation, owner-derived account
selection, atomic insertion and retry protection before enabling CSV saves.

## CP30 — confirmed CSV imports with batch retry protection

The preview page now offers Confirm import only when every record is valid.
Saving requires explicit confirmation, plus a separate acknowledgement for repeats
within the file. The authenticated action re-parses and validates the complete CSV
on the server, derives the owner's default account and saves all records. Preview
alone still sends no CSV and performs no trade writes. Account balances and
existing trades are unchanged. Imported reviews use import time; CSV identity and
creation/review timestamps remain ignored metadata.

Migration 0007 adds owner-scoped batch receipts. A versioned SHA-256 fingerprint
covers normalized trade/review fields in record order, retaining exact decimals
and UTC milliseconds. Equivalent decimal spellings share a fingerprint. The
unique owner/payload index arbitrates concurrent claims. A single SQL statement
claims the receipt and inserts every trade; any insertion failure rolls back both.
A separate read obtains the winning receipt after a conflicting insert finishes.
Default-account resolution happens first and may leave an empty account on failure.

Replaying the same batch after a timeout, reload or later trade edit returns its
original receipt without inserting or reverting trades. This is not row-level
history deduplication: different or reordered files can overlap saved trades.
Repeated rows are intentionally preserved after acknowledgement. Receipt hashes
must remain stable across later code changes, and receipts must not be deleted to
clear UI state. The browser freezes file controls during a save and retains the
source for retries after an uncertain response.

Verified locally: 58 tests, lint, typecheck, production build, signed-out access
including the import action, and full-app HTTP isolation. Tests include validation
before writes, parallel requests, cross-owner scope, forged ownership, exact
values, reviews, retry after edits, migration replay, forced mid-batch rollback and
a committed import with a lost response. HTTP fixtures exercise the real Server
Action and transport; PGlite supplies the isolated SQL engine, not live Neon
concurrency timing. CI Chromium checks confirmation, saving, reload/replay and
journal visibility in addition to the previous preview-only checks.

Before local use, stop the app and follow MIGRATIONS.md's backup/disposable-copy
rehearsal. Apply migration 0007 with db:migrate and run db:verify; expect eight
verified migrations and zero pending. No live migration, dependency or environment
change was performed. Fetch and switch to `codex/cp30-csv-import` (stacked on CP29,
PR #16). Use a test account, remove records 32–37 from the CP29 mock file, preview,
acknowledge its intentional repeats and confirm. Expect 30 imported trades;
reloading and confirming the same file must leave the count unchanged.

Next useful checkpoint: import history with batch provenance so users can inspect
the receipt and the trades created by each batch after leaving the preview page.

## CP31 — inspect import history and the trades in a batch

`/trades/imports` lists the owner's receipts, newest first, 25 per page with stable
ID tie-breaking. Each row shows its import time, account, original saved count,
and a link to the currently associated trades. The journal's import-batch filter
combines with existing filters and survives Apply, pagination and CSV export.
Clear filters restores the full journal. Invalid or repeated batch IDs produce
filter errors (CSV returns 400); unknown or other-owner IDs return no records.

Migration 0008 adds `trade_import_rows`, linking each trade to at most one receipt,
with foreign keys and an import lookup index. New imports write receipt, trades
and links in one statement. Edits preserve the link and batch views show current
trade values. The CP30 fingerprint is unchanged, so retries still return their
original receipt. History and batch queries verify ownership and matching account
scope; malformed cross-account mappings cannot expose another owner's trades.

Older receipts are not backfilled by guessing timestamps or matching values.
Their original counts remain visible; absent links are explicitly unavailable.
Retrying an older batch neither creates new trades nor manufactures missing links.
The import success panel links to its batch and history, and successful imports
invalidate the history page. Preview-only and current journal flows remain intact.

Verified locally: 60 tests, lint, typecheck, production build, signed-out access
and full-app HTTP checks. Coverage includes >25 trades and >25 receipts, stable
pagination, exact journal/export membership, edits, owner isolation, malformed
cross-account links, legacy receipts/replay, invalid IDs and whole-batch rollback
when link creation fails. The CI browser gate follows a receipt into its journal,
narrows the batch while retaining the filter/export URL, and verifies another
signed-in user sees no history or trades from that batch. Live Neon timing and
migration execution are separate acceptance checks.

Local checkout must succeed before running migrations. A README checkout conflict
leaves the old branch active; a subsequent seven-migration result verifies that
old branch, not CP30/31. Preserve local README edits in a named stash, switch to
`codex/cp31-import-history`, and inspect `git branch --show-current` before proceeding.
Follow MIGRATIONS.md's disposable-copy rehearsal and intended database/Auth pairing.
Stop the app, run db:migrate then db:verify; CP31 expects nine verified migrations
and zero pending. No live migration, environment or dependency change was made.

Acceptance: import a new valid CSV on a test account, select Import history, open
its batch and verify counts, filters and exported membership. Edit one linked
trade and verify it remains in that batch. CP31 is stacked on CP30 (PR #17).
Next useful work: reconcile the pending PR stack and run local release acceptance
before adding more features.

## CP32 — verify the intended checkout before the database

`npm run release:verify -- --expect-ref <fetched-ref-or-commit>` requires an exact
HEAD match and a clean tracked/untracked working tree before invoking the existing
read-only database verifier. It rejects missing/invalid arguments, unresolved refs,
wrong commits and local changes without starting database access. Ignored private
environment files remain allowed and are not read or printed by the Git gate.
Detached HEAD at the expected commit works. A second Git check catches checkout
changes during database verification; database failure propagates a failing exit.

This directly addresses the failed README checkout followed by verification of
older code. RELEASE.md now gives success-chained Fish commands, retained README
stash guidance, current nine-migration expectations and CSV history acceptance.
The command never fetches, migrates, resets, merges or deploys. Fetch first or pass
an immutable reviewed SHA; using HEAD as the expected ref is not an upgrade check.
Database/Auth pairing, ignored configuration, complete schema equivalence and live
browser/email acceptance remain separate checks. Stop the app before upgrading.

Verified locally: all 64 tests, lint, typecheck and diff checks pass. Four new tests
use real temporary Git repositories to exercise clean/detached success, ignored
environment files, dirty/staged/untracked work, missing refs, wrong commits,
database failure and edits during verification. A direct CLI mismatch exited 1
before database access. The database callback is controlled in unit tests; no live
Neon verification or migration was performed. Remote CI runs the existing complete
build/access/auth/browser gates. No schema, environment or dependency changes.

CP32 is stacked on CP31. Local acceptance: fetch and switch successfully, inspect
the intended private environment, run release:verify against the fetched CP32 ref,
and expect nine verified migrations with zero pending. If migrations are pending,
follow MIGRATIONS.md's disposable-copy rehearsal, migrate explicitly and rerun.
Next priority: complete local acceptance and consolidate the reviewed PR stack
before expanding features.

## CP33 — inspect and export recorded outcomes

The journal now offers Wins, Losses, Break-even, Closed with P&L and Closed without
P&L. A shared SQL predicate keeps repository filters and performance metrics aligned:
both exit fields must be present; incomplete legacy rows with numeric P&L never
become measured results. SQL decimal comparisons retain exact zero/sign semantics.
Outcome labels remain separate from SQL so client-side URL helpers do not import
the database schema. Invalid/repeated outcomes and open-status conflicts fail
validation rather than broadening results. Batch/group/date/review filters compose
before pagination; CSV export uses the same predicates and owner scope.

Acceptance: choose Wins on Trade history, apply, paginate and export. Apply within
an imported batch and confirm the batch stays selected. Losses and break-even show
only closed records of that sign; closed missing P&L remains distinct from zero.
No schema, dependency, environment or live database changes. CP33 follows CP32.

Verified locally: all 66 tests, lint, typecheck, fresh production build and full-app
HTTP isolation pass, including outcome validation, exact sign/zero/missing values,
legacy incomplete rows, >25 matches, export parity, owner and batch scope. A corrupt
Turbopack cache was moved aside before the successful build. Browser CI additionally
selects Wins inside an imported batch and verifies its URL/export selection.

## CP34 — inspect the sample behind each performance count

Total, Open / incomplete, Closed without P&L and Closed with P&L counts now link
to their exact journal subsets in every setup, symbol and plan-adherence group.
The URL helper preserves label normalization, missing labels and entry-date bounds,
then adds status or outcome selection. Zero counts remain inspectable links to an
empty result. Accessible link names identify count, subset, dimension and group.
Existing group-title links still show all trades. Results use current saved values;
subsequent edits can change the counts between requests.

The journal and CSV reuse existing owner-scoped filtering. No additional database
queries, schema changes, dependencies or environment settings are introduced.
Acceptance: on Performance, select a date range and a measured or missing-P&L count;
verify the group/dates/outcome in Trade history, then export. Open-count links must
include incomplete trades and never masquerade as measured outcomes.

Verified locally: all 66 tests, lint, typecheck, production build and full HTTP
isolation pass. Expanded database tests compare each subset count with journal and
CSV membership across all three dimensions, zero samples, missing/literal labels,
owner scope and pagination. Browser CI follows zero and measured count links and
checks retained dates and export outcomes. No live database changes. Next priority
is release consolidation and local acceptance of the combined checkpoint stack.


## CP35 — consolidate the release baseline on main

Reviewed PRs #13–21: all exact heads had successful verify checks and were ready
for review. Merged in dependency order, retargeting each subsequent PR to main
without squashing individual checkpoint history. Main merge commit 086996c has
exactly the same source tree as tested CP34 fe4042f; no conflict edits were needed.
README and RELEASE now use origin/main for the current handoff and include outcome
and performance-sample acceptance. The final main SHA receives its own CI run.

Verification evidence: exact pre-merge head checks passed, source-tree equality
was verified with git diff --exit-code, and documentation diff checks passed.
No application code, packages, schema, credentials or live data changed. The
expected schema is still nine migrations. Live local acceptance remains pending;
this checkpoint does not claim deployment or verification on the user's laptop.

Next: run RELEASE.md's local acceptance on the consolidated main commit and resolve
any observed failures before choosing another product feature.


## CP36 — an import-ready fixture for local acceptance

Preview CSV now offers two clearly described downloads. The existing 36-record
validation fixture remains unchanged. The new rationaleai-import-ready.csv
preserves its 30 valid records, order, multiline notes and two intentional repeats.
Expected totals: five open trades, four closed without P&L, 21 closed with P&L.
No manual record removal is needed. Existing normalized batch fingerprints remain
unchanged, so a previously imported identical valid subset returns its old receipt.
Use a test account: synthetic records are saved only after explicit confirmation
and repeat acknowledgement. Preview still performs no writes.

Tests compare the parsed fixtures, require repeat acknowledgement before account
creation, and verify saving/replaying leaves 30 trades, 30 links, one receipt and
unchanged balance. Browser acceptance downloads the served file, previews the
advertised totals, finds the confirmation form and verifies no preview writes.
README and RELEASE use the new file for successful local-import acceptance.
No parser/import behavior, schema, dependency, environment or live database change.
CP35 laptop acceptance remains pending; this checkpoint makes it easier to perform.

Verified locally: all 68 tests, lint, typecheck, production build and diff checks
pass. Full browser verification is provided by the checkpoint's GitHub CI run.

## CP37 — dashboard journal follow-up

The dashboard now exposes three counted queues: open/incomplete trades, closed
trades missing P&L, and closed trades awaiting review. Links use the existing journal
URL helper and owner-scoped filters. Review count is added to the existing dashboard
aggregate query, so no extra round trip is introduced. Both exit fields are required
for a closed trade; reviewedAt determines whether a reflection has been saved.
Saving a review now explicitly invalidates the dashboard along with journal/detail
and performance pages. Zero queues remain inspectable; the empty-journal message is
separate from the no-follow-up message. Copy explains overlap and active open trades.

Tests compare counts against export and paginated queues for >25 matching records,
owner isolation, empty results and review-save transitions. The HTTP workflow checks
that a saved review reduces the dashboard queue while missing P&L remains unchanged.
Browser checks follow all three cards and a second user's zero queue. No schema,
dependency, environment or live database change. CP37 is stacked on CP36.

Acceptance: open Dashboard, follow each queue and compare its results. Save a review
on a closed unreviewed trade, return to Dashboard and confirm that only its review
queue membership changes. CP35's laptop acceptance remains unconfirmed.

Verified locally: all 68 tests, lint, typecheck, a fresh production build and full
HTTP isolation pass. The stale Turbopack cache was moved aside after an internal
cache-read failure. Browser navigation is verified by the checkpoint CI gate.

## CP38 — dashboard entry-date periods

Dashboard From/Through dates now scope the metric aggregate, follow-up counts and
recent trades to the same UTC entry period. Both boundary days are included;
blank bounds are unrestricted and All time clears the selection. Journal queue,
all-matching-trades and explicit performance links retain both bounds. Entries are
selected by entry time even if they closed later. Invalid, repeated or reversed
dates show errors without querying or displaying broader dashboard results.
The dashboard and performance aggregates share their date predicate builder.

Tests cover exact UTC boundaries, one-sided/empty periods, owner isolation,
entry-versus-exit semantics, decimal metrics and dashboard/journal queue parity.
HTTP checks cover retained links and invalid/empty states. Browser coverage applies
dates, follows the review queue and performance link, then clears the period.
No schema, dependency, environment or live database change. Nine migrations remain
required. CP38 is stacked on CP37; laptop acceptance is still unconfirmed.

Acceptance: choose a period containing known trades, compare the follow-up counts
with their linked journal results, open performance for those dates, and clear to
All time. Try a period with no entries and confirm zero/empty results.

Verified locally: all 68 tests, lint, typecheck, a fresh production build and full
HTTP isolation pass. A corrupt local Turbopack cache was moved aside before the
successful build. Full browser navigation is checked by the checkpoint CI gate.

## CP39 — retain journal context through trade review and editing

Trade history detail/review links now carry their canonical journal selection,
including filters, import batch and page. Detail and edit back links, edit-save
redirects and stale-draft reload links retain it. Returning queries current data:
a saved review leaves an unreviewed queue, and an empty later page still offers
the existing first-page recovery link. Direct trade URLs retain the default full
journal return. This increment covers journal-origin navigation.

A shared navigation helper accepts only the journal route and rebuilds known,
validated filters and bounded pagination. Invalid, repeated or external return
contexts fall back to /trades. Unknown parameters are discarded. The server action
normalizes the destination again before redirecting; authorization and revision
checks remain in place. No schema, dependency or environment changes.

Verified locally: 70 tests, lint, typecheck, production build, full HTTP isolation
and diff checks pass. HTTP coverage verifies filtered page-two detail/return links
and an unsafe destination fallback. Browser coverage follows a filtered review
link, saves a review, exercises stale edit/review reloads and an edit save, then
returns to the now-empty original queue. Full browser execution uses the CI gate.
CP39 is stacked on CP38. Nine migrations remain required; no live database changes
were made and laptop acceptance remains unconfirmed.

Acceptance: filter Trade history, open a trade, save a review or edit, then choose
Back to trades. Confirm the filters/page remain and membership reflects the save.
Next logical checkpoint: consolidate the pending checkpoints and run the laptop
acceptance sequence before adding another feature layer.


## CP40 — consolidate CP36–39 on main

Merged PRs #22–25 in dependency order with merge commits, preserving each bounded
checkpoint commit. Their exact heads had successful CI checks before merging.
The merged tree at 86d7709398ed5b684e183860be413453b524a660 is identical to the
CP39 branch at 728e9c07c9c3b3a3488e347d32fb031f1c7cf3c5. This brings the import-ready
CSV, dashboard follow-up queues and periods, and journal return context onto main.
No feature branch was deleted and no local work was discarded.

README and RELEASE now identify the consolidated baseline and add acceptance for
period-scoped queues and returning from reviews/edits. CP40's own file changes are
documentation only. Full CI on the final main commit is the integration gate;
individual feature CI does not substitute for that check or laptop acceptance.
No schema, dependency, environment or live database change; nine migrations remain
required through 0008_import_trade_links. No production deployment was performed.

Laptop acceptance is pending: follow RELEASE.md's success-chained Fish commands,
run release:verify against origin/main, and record the verified SHA and pass/fail
for the eight local checks. A failed checkout must stop the sequence. Never reset
local edits or rerun identity linking just to reconcile branches.

Next checkpoint should be driven by acceptance results: fix any reproduced issue
before extending the product. Local database/Auth pairing and email delivery can
only be confirmed in the user's environment.

## CP41 — journal matching-trade counts

Trade history now shows the owner-scoped total across matching pages and the
number of records displayed on this page. Filters include import batch, outcome,
review, adherence, labels, direction, lifecycle and UTC entry dates. Counts use
current saved records, not historical import receipt totals. Invalid filters skip
both reads and hide the count; an out-of-range page preserves its matching total
and the existing first-page recovery link. The result count is a status region.

A shared condition builder supplies list, count and export predicates. Only the
journal adds a SQL aggregate query, run alongside its existing bounded page read;
no full trade collection is transferred to calculate a count. List/count are
separate reads, not a transaction snapshot: concurrent writes may briefly change
membership between them. Existing pagination continues to use its lookahead row.
Dashboard and export queries are unchanged. No schema, dependency, environment or
live database change; nine migrations remain required.

Coverage extends the existing tests for multiple accounts/owners, exact-full and
overflow pages, UTC boundaries, all performance drill-down groups, import linkage
(including foreign and legacy links), review-save changes and totals exceeding
the export limit. HTTP checks verify first/second/out-of-range pages, invalid input
and another owner's empty results. Browser coverage checks one matching trade
becoming zero after a saved review and return to its unreviewed queue.

Acceptance: inspect an imported batch with more than 25 records; total should
remain the same across pages while the displayed count changes. Narrow filters,
then save a review and return to the unreviewed selection to confirm the new count.
CP40 laptop acceptance remains unconfirmed. Next priority is completing that local
acceptance and addressing any reproduced issues before broader product changes.

Verified locally: all 70 tests, the targeted export-limit count check, lint,
typecheck, final production build, full HTTP isolation and diff checks pass.
Full Chromium verification is provided by the checkpoint CI gate.

## CP42 — performance outcome counts and drill-downs

Performance setup, symbol and adherence groups now show Wins, Losses and Break-even
counts, linked to those exact journal/export subsets with selected entry dates.
Losses are counted in the existing SQL aggregate; break-even is the remainder of
the measured sample after wins and losses. Thus no extra aggregate query is added.
Missing P&L and incomplete trades cannot enter these outcome counts. Zero counts
remain inspectable. Monetary calculations retain PostgreSQL decimal precision.

Expanded fixture coverage compares all seven group subsets against journal,
count and export results, including empty groups, multiple owners, missing labels
and period boundaries. HTTP checks verify outcome links and Chromium checks follow
a winning and zero break-even sample. No schema, dependency or environment change.

The user reported everything seems good before this checkpoint; recorded as a
local smoke-check pass, not evidence that every RELEASE.md acceptance item ran.
Acceptance: select a period in Performance, check wins + losses + break-even equals
the measured sample, then follow a nonzero and zero outcome count.

Verified locally: 70 tests, lint, typecheck, production build, full HTTP isolation
and diff checks pass. Browser outcome navigation is covered by the CI gate.

## CP43 — export period-scoped performance summaries

Added an authenticated /performance/export CSV route and Performance download link.
The report reuses tradeBreakdown for setup, symbol and adherence groups with the
same inclusive UTC entry dates and owner scope as the page. Only dates apply;
other journal filters are ignored as they are on Performance. Each row records its
dimension, label, missing-label flag, bounds, counts and metrics. Missing metrics
are blank, measured zero stays zero, and profit-only groups retain the infinity
marker. Groups overlap across dimensions and the UI warns against adding totals.

Each dimension query returns at most 2,001 groups; the combined report rejects
more than 2,000 rows with 422, without partial CSV. Invalid/repeated/reversed dates
return 400, unavailable exports return generic 503, and signed-out users are sent
to sign-in. Responses use private/no-store headers. Shared CSV cell quoting now
serves both trade and summary exports, preserving existing formula protection and
exact signed decimal strings. No schema, dependency or environment change.

Tests exercise exact decimals, quoted/multiline/formula labels, missing versus
literal labels, absent metrics versus measured zeros, empty reports and the
combined cap. HTTP checks cover owner separation, date scope, invalid input,
private headers, empty/oversized exports and signed-out access. Chromium downloads
the file and checks its name and selected-period summary. Existing trade export
regressions also run. No live database mutation or production deployment.

Acceptance: export a known period, compare a group row's counts and metrics with
Performance, and verify the entry bounds. Use dimension when filtering the CSV;
never sum setup, symbol and adherence totals together. Nine migrations remain.

Verified locally: all 73 tests, lint, typecheck, production build, full HTTP
isolation and diff checks pass. Browser download verification uses the CI gate.
CP43 is stacked on CP42, which passed full CI including Chromium.

## CP44 — monthly performance cohorts

Added chronological UTC entry-month groups to Performance and its summary CSV.
Stored UTC entry timestamps determine the group; exit dates never move a trade
between cohorts. Months without entries are omitted. A shared month-period helper
intersects each group with the selected bounds before building journal links,
including outcome/sample drill-downs. This prevents partial-period links from
silently expanding to a full month. CSV rows retain the selected report bounds
and use dimension month with a YYYY-MM key. The existing combined export cap now
covers all four dimensions. One additional grouped read is made per report.

Tests cover leap days, December rollover, partial first/last months, absent months,
owner separation, entry versus exit dates, exact decimals and every journal/count/
export sample. HTTP checks verify month links and CSV rows; Chromium follows a
monthly outcome link while retaining a one-day selection. No schema, dependency,
environment or live database change. Nine migrations remain required.

Acceptance: select a period spanning parts of two months, compare the monthly
counts, follow a monthly sample and confirm its narrowed dates. Export and inspect
the month dimension separately from the other overlapping dimensions.

Verified locally: all 75 tests, lint, typecheck, clean production build, full HTTP
isolation and diff checks pass. Chromium verification runs in the CI gate.

## CP45 — quick UTC entry-date ranges

Dashboard and Performance share four quick links: Last 7 days, Last 30 days,
This month and Last month. A pure UTC helper computes inclusive calendar dates
without mutating its clock input. Rolling windows include today; this month is
month-start through today, and last month is complete. Server-rendered links use
explicit from/to parameters, so a saved URL retains its dates. Matching ranges
are marked current. Manual dates, All time, journal drilldowns and CSV exports
continue using the existing validated period contract. Invalid date pages also
show quick links for recovery. No database, schema, dependency or environment
changes; nine migrations remain.

Unit checks cover UTC offset rollover, year boundaries, leap February, inclusive
windows and input preservation. HTTP checks cover both pages, invalid-date
recovery and active ranges. Chromium selects a dashboard month, carries it into
Performance, switches to a rolling week, checks export bounds and resets All time.

Acceptance: choose Last month on Dashboard, open performance for those dates,
choose Last 7 days and inspect the export dates. Bookmark the resulting URL and
confirm its explicit dates; use All time to remove the bounds.

Verified locally: all 77 tests, lint, typecheck, production build with CI fixture
configuration, HTTP isolation and diff checks pass. Full Chromium verification
runs in CI. CP44 passed its full CI gate including the monthly browser drilldown.

## CP46 — journal reading and navigation design

The journal now uses a quieter charcoal/mint palette, a clear primary Log a trade
button and separate navigation, review and data-management actions. Filters sit in
a native disclosure, closed for an unfiltered journal and open for active filters
or errors. All ten controls remain available, grouped into trade, outcome/review
and entry-date sections. Active-filter chips remove one constraint, preserve the
others and return to page one. Guidance is available on demand.

Desktop entries retain a semantic table and add setup context, readable status
badges, UTC date/time separation and signed P&L tones only for closed trades.
Mobile uses the same entries as labelled cards without dropping fields. Medium
widths retain a horizontally scrollable table. Focus outlines and keyboard-native
controls remain available. Trade detail separates execution from rationale/notes
and provides a jump to the review form; context-preserving links are unchanged.

Verification: lint, typecheck, production build and full local HTTP/Chromium flows
pass. Desktop and 390px mobile screenshots were inspected. Browser checks cover
mobile overflow, filter opening/removal, export, detail navigation and review
anchors alongside the existing edit/conflict/import/ownership regressions. The
full remote CI gate runs before the PR is marked ready. No schema, runtime
package, environment or live-data changes.

Acceptance: open the journal on desktop and mobile; expand Filters, combine two
constraints, remove one chip and inspect the remaining selection. Open a trade,
jump to review and return to the journal. Export should match the visible filter
selection across all pages.

This user-requested design checkpoint takes CP46. The proposed AI roadmap moves
to CP47 consolidation/contract, CP48 evidence snapshot, CP49 first live review
and CP50 pilot evaluation; those remain proposals rather than implemented work.

## CP47 — consolidate the journal and prepare MT5 ingestion

PRs #26–31 were checked at their exact heads for passing CI, retargeted in
dependency order and merged with merge commits preserving each checkpoint.
The combined main commit 42612f708ff1da095d80d0161ef1819b9045295d has exactly the
same source tree as verified CP46 0ae582d5c353ff9811f00d926d2d797b79ccc3c0.
No conflict resolutions or application changes were necessary.

This checkpoint updates the release baseline and acceptance checklist and adds
MT5_IMPORT.md. The contract separates source executions from journal records,
requires stable account-scoped IDs for overlapping imports, exact financial and
timezone reconciliation, and preservation of human notes/reviews. Existing CSV
batch replay protection is explicitly insufficient for incremental source sync.

The next implementation depends on a sanitised sample from the actual MT5
broker/demo account; format, account mode and timezone must not be guessed.
TradingView remains a chart-analysis companion unless Paper Trading is chosen
as a distinct source. No parser, source schema, connector, broker credentials,
live database write or AI integration is introduced here. Nine migrations remain.

Verification: clean tree before consolidation, successful exact-head CI on all
six PRs, combined-tree equality, documentation/diff checks. The final main CI run
must pass before handoff. Laptop acceptance remains separate from fixture CI.

## CP48 — broker-neutral paper-trading CSV mapping

The user chose paper trading with a broker still undecided and authorised a
scoped implementation. This replaces the proposed MT5-specific CP48 parser with
a generic, local-only column mapper for files containing one row per journal
trade. The authenticated /trades/map-csv page is linked from Preview CSV.

A bounded shared CSV reader preserves existing strict Rationale import headers.
The mapper requires explicit mappings, unique source-column selection and a
whole-trade/currency acknowledgement. It supports LONG/SHORT or explicitly
selected entry-side BUY/SELL. Existing trade validation supplies date, decimal
and closing-field checks. Source record numbers, repeated rows and omitted
columns are visible. Formula-like text is protected consistently in preview and
download; numeric decimal signs remain unchanged.

Only an entirely valid conversion can be downloaded. Mapping/file changes clear
stale results; asynchronous reads are generation-guarded. The downloaded CSV
uses the established server-validated preview/confirmation path. No uploads,
database writes, broker APIs or automatic sync occur on the mapping page.
Order/fill reconstruction, timezone/lot/fee conversion and overlapping-source
deduplication remain out of scope and are explained in the UI.

The three-trade synthetic sample and PAPER_IMPORT.md provide a complete manual
acceptance path. Tests cover the new boundaries and preserve existing parser
behaviour; browser checks verify local-only conversion, exact download contents,
mapping invalidation, mobile width, errors/reset and import-preview handoff.
No schema, runtime dependency or environment change. Nine migrations remain.

Verified locally: all 84 tests, lint, typecheck, clean production build, protected
route checks and full HTTP/Chromium workflows pass. The mapped CSV preview was
inspected at 390px width. A stale Turbopack cache was moved aside before the clean
build. Final remote CI is required before marking the PR ready.

## CP49 — reusable paper CSV mapping settings

Adds explicit local JSON download/load for versioned column mappings. Settings
contain source header names, not positions, trade rows or account confirmation.
Names resolve against each new file, tolerating reordering while rejecting missing
or ambiguous mapped columns, unknown fields, duplicates, incomplete required fields,
invalid direction encodings and files over 16 KiB. No automatic browser persistence.
Loading clears results and acknowledgement; asynchronous reads are generation-guarded
and mapping controls are disabled while loading. Every file still needs validation.

Acceptance: save sample mapping, change a field, load settings, verify restored
choices and cleared confirmation, then validate again. Test reordered and renamed
headers. Existing preview/import and no-write mapping boundaries remain unchanged.
No schema, environment or dependency changes.

Verified locally: 86 tests, lint, typecheck, clean production build and full
HTTP/Chromium workflows passed, including preset download/load, fresh confirmation,
stale-result clearing and the unchanged no-write boundary. The existing restored
Turbopack cache was corrupt; moving it aside resolved the build without code changes.
