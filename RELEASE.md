# CP16: verification and release rehearsal

This is a reviewable development increment, not a production deployment.
CP14–16 have no new schema migration after CP13's `0003_auth_identity`.
The working user branch remains `cp13-auth`; do not replace its credentials with
those of a test branch. Do not rerun ownership linking for an already-linked journal.

## Reconcile locally (Fish)

Stop the old development server with Ctrl+C. Run only commands in these blocks;
Git's file summaries and terminal output are not commands.

```fish
cd ~/Desktop/Projects/rational-ai/rationale-ai
git status --short --branch
git fetch origin
git switch codex/cp14-cp16
npm ci --no-audit --no-fund
```

If the branch already exists, follow the switch with `git pull --ff-only`.
Your README edit can normally carry across; preserve it if Git reports a conflict.
Do not use reset/clean to resolve it. Keep the current working DATABASE_URL,
NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET. Add this to `.env.local`:

```dotenv
APP_ORIGIN=http://localhost:3000
```

Clear old shell overrides and verify the database before starting:

```fish
set -e DATABASE_URL
set -e NEON_AUTH_BASE_URL
set -e NEON_AUTH_COOKIE_SECRET
set -e APP_ORIGIN
npm run db:verify
npm run dev
```

`db:verify` performs SELECTs only. It checks ledger hashes/order/timestamps and
required identity/default-account columns/indexes. It is not a complete schema-diff
tool. If it reports pending migrations, follow MIGRATIONS.md on a disposable branch
first. Missing/conflicting history must be investigated; never manufacture ledger
rows or reset a populated database. A matching ledger alone cannot prove that every
schema object matches the source.

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

1. Review and merge dependencies in order: auth foundation, CP13, then CP14–16.
   These PRs are stacked. Confirm CI is green; configure branch protection to require
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
