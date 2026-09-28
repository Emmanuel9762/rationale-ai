# Database migrations

The checked-in sequence is `0000_amusing_oracle` (core tables) followed by
`0001_cool_peter_parker` (setup, rationale, notes). Preserve applied SQL and
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
