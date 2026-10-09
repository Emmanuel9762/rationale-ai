# Database migrations

The checked-in sequence is `0000_amusing_oracle` (core tables) followed by
`0001_cool_peter_parker` (setup, rationale, notes), then
`0002_default_accounts` (default-account flag, uniqueness and legacy backfill), and
`0003_auth_identity` (nullable identity mapping). Preserve applied SQL and
journal timestamps; add a new migration for future schema changes.

1. Install locked dependencies with `npm ci`.
2. Run `npm test` to replay migrations in an isolated, in-memory PostgreSQL
   engine (PGlite), insert a full trade, verify foreign keys, and rerun safely.
3. Set `DATABASE_URL` privately in `.env.local`, pointing to an empty disposable
   Neon database, then run `npm run db:migrate`.
4. Start the app and save a trade. Verify the row survives a refresh.

`db:migrate` loads the same database module as the app, including its IPv4
Undici dispatcher. Drizzle CLI transport is independent; the CLI generate
command only generates files and does not apply them.

Before using an existing database, inspect `drizzle.__drizzle_migrations` and
compare its entries with `drizzle/meta/_journal.json`. If tables exist without
migration history, or a prior migration partially failed, stop and reconcile
that database from a backup. Do not run `push`, drop tables, edit applied SQL,
or fabricate history to bypass an error. The Neon HTTP migrator is not an
atomic transaction over the entire migration sequence.

The isolated test verifies SQL and schema compatibility, not your network,
Neon credentials, or the live database's migration history. Live verification
must be performed separately before calling the deployment verified.


## Applying CP12 to an existing CP10 database

Stop the app and take a backup or disposable database branch before migration.
Verify that the existing history contains exactly the two original migrations
(or all three if CP12 has already been applied). In the Neon SQL editor:

```sql
SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at;
```

Compare that output with the checked-in migration hashes/timestamps, printed
locally with this read-only command:

```bash
node -e 'const {readMigrationFiles}=require("drizzle-orm/migrator"); console.table(readMigrationFiles({migrationsFolder:"./drizzle"}).map(m=>({hash:m.hash,created_at:m.folderMillis})))'
```

If the first two hashes or timestamps differ, the history table is absent, or
there are unexpected entries, stop and reconcile before applying anything.
Migration 0002 must be pending with no partially-created `is_default` column or
index. Apply to the disposable copy first with `npm run db:migrate` using that
copy's private DATABASE_URL. Verify account/trade counts and balances are intact,
and exactly one account per existing owner has `is_default = true`.

After verification, apply to the intended database while the app is stopped.
The existing HTTP migration runner is not atomic across the entire migration;
a partial failure needs inspection, not blind retries. The older app ignores the
new column, so retaining the additive schema while reverting app code is possible.
Do not drop the column/index as an automatic rollback.

## CP13 identity migration

`0003_auth_identity` adds nullable `users.auth_subject`/`auth_issuer` and a unique
index over their pair. It does not link or transfer existing records. It has been
applied to `cp13-auth` and disposable verification branches; production remains on
0002. Follow AUTH_SETUP.md to pair the correct database and Auth endpoint and
perform explicit operator-only legacy linking after registration.

Failure diagnostics now include safe SQLSTATE/network codes, not error messages,
query parameters or connection strings. For example, `28P01` is authentication,
`42P07` an existing relation, and `EAI_AGAIN` DNS resolution. Investigate before
retrying a partially applied migration.


## CP16 read-only verification

Run `npm run db:verify` with the intended branch's private DATABASE_URL. It compares
all applied migration hashes and timestamps in order, reports pending entries,
and verifies the identity/default-account columns and unique indexes. A nonzero
exit means investigate before starting the app; this command does not change SQL,
repair ledger entries, or replace a complete schema-diff review. See RELEASE.md
for the fresh-production-copy rehearsal and production rollout gates.

## CP19 trade reviews

`0004_trade_reviews` adds four nullable columns to `trades`: plan adherence,
what went well, what to improve, and the last review save time (UTC). Existing
trades start unreviewed. No ownership, balances, identity or financial values are
backfilled or changed. No new environment variables are required.

Stop the app before updating. Keep DATABASE_URL paired with the existing Auth
branch; do not swap only the database to an unrelated Auth branch. Rehearse on a
backup/disposable database copy before applying to the intended database:

```fish
set -e DATABASE_URL
npm run db:migrate
npm run db:verify
```

The first command removes a stale Fish environment override so the scripts use
`.env.local`; check that file's target privately first. Verification should report
five verified migrations, zero pending, and successful schema checks. Start the
app only after both commands succeed. Existing CP18 code can run with the added
nullable columns if code rollback is needed; do not drop columns or ledger rows.
No live Neon migration was performed as part of CP19 implementation.

## CP20 submission protection

`0005_trade_submissions` adds nullable `trades.submission_key` (UUID),
`submission_hash` (64-character SHA-256 text), and a unique index on
`(account_id, submission_key)`. Legacy trades remain unchanged with NULL submission
fields; historical duplicates are not removed. New application saves require keys.

Stop the dev server. Back up/rehearse on a disposable copy as above, keeping the
intended database and Auth pairing. With the correct target in `.env.local`:

```fish
set -e DATABASE_URL
npm run db:migrate
npm run db:verify
```

Expect six verified migrations, zero pending, and successful required schema
checks. Start the app only after success. No new environment variables or packages
are needed. Open a fresh new-trade form after upgrading; a previously open CP19
form has no submission key and will be rejected. Older app code remains compatible
with the additive schema but does not provide retry protection. Do not drop columns
or alter migration history during rollback. The migration sequence is not atomic;
inspect schema/history if applying it is interrupted. No live migration was run here.

## CP21 revision checks

`0006_trade_revision` adds `trades.revision integer NOT NULL DEFAULT 0` in one
ALTER TABLE. All existing rows start at zero; financial data, reviews and submission
keys remain intact. Stop old application instances before applying and starting
CP21. Previously open edit/review forms lack the new revision field and must be
reloaded; never silently treat a missing revision as the current one.

Use the existing backup/disposable-copy rehearsal procedure. With `.env.local`
pointing to the intended database and no stale shell override:

```fish
set -e DATABASE_URL
npm run db:migrate
npm run db:verify
```

Expect seven verified migrations and zero pending, followed by successful schema
checks. No new environment variables or dependencies. Old code can read the added
column but does not enforce/increment revisions when writing; do not run mixed
old/new writers or claim conflict protection during a code rollback. Direct SQL
maintenance must also coordinate writes and revisions. No live migration was run
as part of implementation.

Local acceptance: open one trade's edit page in two tabs. Save a change in tab A,
then submit a different change from tab B. B must show a conflict and retain its
draft; the stored value must still be A's. Copy B's desired changes, use Load latest
saved version, then reapply and save. Repeat with two review forms, and with a trade
edit versus a review. A fresh review form should allow successive successful saves.
