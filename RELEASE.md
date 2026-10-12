# Verification and release rehearsal

This is a reviewable development increment, not a production deployment.
CP32 includes the CP26–31 feature stack and requires nine migrations through
`0008_import_trade_links`. Earlier consolidation evidence below describes its
historical commit only. Keep the existing database/Auth pairing; never rerun
ownership linking for an already-linked journal.

## Reconcile and verify locally (Fish)

Stop the development server with Ctrl+C. Preserve local work before switching.
If README.md is your only modified file, a named stash keeps it recoverable:

```fish
git status --short --branch
git stash push -m "README edits before CP32" -- README.md
```

Inspect and preserve any other changes separately; do not reset or clean them.
Then run this success-chained sequence from the repository:

```fish
git fetch origin
and git switch codex/cp32-release-preflight
and git merge --ff-only origin/codex/cp32-release-preflight
and npm ci --no-audit --no-fund
```

A failed checkout leaves the previous branch active. Stop if any command fails.
Keep the README stash until you deliberately reconcile its edits. Check the private
`.env.local` target and its existing Auth pairing before clearing a stale override:

```fish
set -e DATABASE_URL
npm run release:verify -- --expect-ref origin/codex/cp32-release-preflight
and npm run dev
```

`release:verify` requires an explicit expected ref or commit. It resolves that ref
locally, requires HEAD to match exactly, and rejects modified, staged or untracked
files before starting `db:verify`. Ignored files such as `.env.local` are allowed
and their contents are not printed. Detached HEAD at the exact commit is allowed.
It checks the checkout again after database verification and reports the full SHA.
It does not fetch: fetch immediately beforehand, or use a reviewed immutable SHA.
Passing HEAD merely compares the checkout with itself and is not an upgrade check.

`db:verify` performs SELECTs only, comparing migration hashes/order/timestamps and
required schema checks. Expect nine verified migrations, zero pending. Pending or
conflicting history exits unsuccessfully; the wrapper never applies migrations.
Follow MIGRATIONS.md's disposable-copy rehearsal before migrating the intended
database, then rerun release:verify. Missing/conflicting history needs inspection;
never manufacture ledger rows or reset a populated database.

This check cannot establish that the configured database/Auth pair is the intended
one, prove every schema object, validate ignored configuration, or replace CI and
browser acceptance. Do not modify the checkout while verification is running.
It neither merges PRs nor deploys code.

## Acceptance checks on the laptop

Use http://localhost:3000, not the LAN IP or 127.0.0.1.

1. Sign in and confirm your existing trades. Create, refresh, edit and close a test
   trade; confirm history and dashboard reflect it.
2. In a private window, register a second test account. It must have an empty
   journal. Paste the first account's trade URL and edit URL: neither may reveal
   the trade. Sign out and verify protected pages request sign-in.
3. In your normal account, request an email verification code. Check inbox/spam,
   submit a wrong code, then the correct code; account status should show Verified.
   Test resend and use the newest code. Keep mandatory verification disabled until
   delivery is confirmed. Use the code/OTP method with Neon's shared sender.
4. Sign out and use Forgot password with your email. Follow the email on the same
   localhost origin; set a new password. Confirm the old password fails, the new
   password succeeds, and reopening/reusing the reset link is rejected on submit.
   Your journal must remain unchanged. Never share reset URLs, passwords or codes.

5. On a test account, preview a valid CSV, confirm it and open Import history.
   Follow the new batch, narrow the journal and export it. Replaying the same CSV
   must not add trades. Edit a linked trade and confirm it remains in the batch.
   Older CP30 receipts can show unavailable links; do not infer their membership.

No automated tests send emails to your personal account. Inbox delivery, spam
placement and actual browser cookies must be validated in this environment.

## Automated checks

```fish
npm test
npm run lint
npm run typecheck
npm run build
npm run test:access
npm run test:auth
npm run test:isolation
npx playwright install chromium
npm run test:browser
```

The browser command includes the HTTP isolation suite, then runs two independent
Chromium contexts. Linux may require `npx playwright install-deps chromium` (system
package installation). OpenSSL is required for temporary fixture HTTPS certificates.
The CI workflow runs these gates on Node 24 with no live Neon secrets. Browser
installation/check failures fail CI; there is no silent skip. A green local run is
not evidence that the remote workflow has run successfully.

`npm run test:neon-concurrency` is optional and writes only synthetic data on an
explicit disposable branch configured in ignored `.env.isolation.local`:
ISOLATION_DATABASE_URL and ISOLATION_ALLOW_WRITES=1. It deletes only its own synthetic
owner/account in cleanup. Never supply your working or production branch URL.

## Production performance

`npm run test:performance` measures first and five subsequent full HTTP responses
against a production build with local HTTPS Auth/PGlite fixtures. On the workspace:

| Route | First request | Median of five warm requests |
| --- | ---: | ---: |
| Dashboard | 40 ms | 27 ms |
| History | 21 ms | 21 ms |
| Trade detail | 30 ms | 15 ms |

These are functional baselines, not live Neon timings or browser paint metrics.
They exclude development compilation. To evaluate your laptop/network:

```fish
npm run build
npm start
```

With the dev server stopped, sign in at localhost:3000. In browser DevTools Network,
compare document requests for dashboard/history/detail on first navigation and
five refreshes. Record TTFB/total duration separately; do not export a HAR containing
cookies/tokens. If warm requests remain slow, investigate Neon region/network and
query timing. Do not weaken session checks or cache private responses to mask it.

## Production rollout gates (not executed)

1. CP11–25 are merged in dependency order. The combined `main` commit `411ee2d`
   passed all CI gates, including Chromium workflows. Check the exact commit's CI
   for subsequent feature PRs; configure branch protection to require
   the `verify` job separately in GitHub settings (this workflow does not enable it).
2. Pick the hosting origin. Provision production's own Neon Auth, trusted HTTPS
   origin, cookie secret and email policy. Match DATABASE_URL and Auth URL to the
   same branch. Do not copy test issuer/subject mappings into production. Configure
   sender/domain and any custom SMTP before promising public email reliability.
3. Verify backup/restore availability. Rehearse on a fresh production copy, inspect
   migration history and data, apply pending migrations once, and verify again.
   Drizzle's HTTP migration sequence is not one atomic rollback unit. If interrupted,
   inspect both schema and ledger before retrying. Never blindly reset or downgrade.
4. Arrange a maintenance window for production migration and explicit legacy-owner
   linking, since the prior shared-development identity has been removed. Register
   the actual production owner and run the operator link using that account reference.
5. Deploy the verified commit with production-only secrets. Run the acceptance checks
   above. Keep the previous deployment available, but never roll back to a shared
   development-auth bypass. Coordinate restore/rollback with writes made since backup.
6. Check recovery, verification, ownership isolation, logs and measured warm response
   times before inviting other users. Avoid logging credentials, reset tokens or
   email codes. No deployment, production Auth change or merge was made by CP16.

## Rehearsal evidence (2026-10-01)

`cp16-release-rehearsal` (`br-rapid-darkness-aef70gft`) is a fresh production copy.
The real migration command upgraded its CP12 schema through 0003; db:verify found
four matching migrations and required columns/indexes. Rerunning migration succeeded
with four ledger entries. Fingerprints before/after matched for original user fields,
two complete accounts and four complete trades. No Auth identity was assigned.
This validates additive database migration/data preservation, not production login,
email delivery or deployment. The branch is retained for inspection; production and
the user's working `cp13-auth` journal were not changed.

## Consolidation and verification (2026-10-09)

PRs #2–12 are merged, preserving the separate checkpoint commits. `main` at
`411ee2d` has the same source tree as the tested CP25 stack. Its own CI run passed:
https://github.com/Emmanuel9762/rationale-ai/actions/runs/37888597656

A read-only audit of the working `cp13-auth` branch matched all seven local
migration hashes and timestamps, with zero pending. The exact schema query from
`db:verify` passed every identity/default-account/review/submission/revision check.
No live database writes were performed. Keep the existing working credentials.

The owner confirmed live password reset now works. That supersedes earlier
recovery-blocker notes in the historical checkpoint entries. Fixture/browser CI
establishes controlled-provider behavior; independent local account isolation and
real inbox verification acceptance remain distinct from the database audit.
