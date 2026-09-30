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
using localhost through the workspace proxy. Actual browser acceptance remains
pending on the user's laptop because Chromium could not be downloaded. CP14 has not started. See AUTH_SETUP.md for
exact local reconciliation and ownership-link instructions.
