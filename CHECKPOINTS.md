# RationaleAI checkpoint handoff

Baseline: `027f5d3` (CP6B, persisted entries using IPv4 Neon HTTP).

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
