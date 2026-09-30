# CP13: Neon authentication

This branch adds email/password registration, sign-in, sign-out, and server-validated
sessions. `npm run dev` now requires sign-in too; the shared development bypass is
removed. The SDK is pinned to `@neondatabase/auth@0.5.0-beta`. This is an incremental
integration, not a public-release approval. Account recovery/email verification UI,
OAuth, and CP14's complete two-user browser suite remain future work.

## Database and Auth must use the same Neon branch

Project: `falling-sky-47391280`.
Development branch: `cp13-auth` (`br-tiny-morning-aelqrv3b`).
Database: `neondb`.

Neon Auth and migration `0003_auth_identity` are enabled/applied **only on this
branch**. Production remains at CP12 with Auth disabled. The development branch
was copied with one legacy user, two accounts, and four trades. Later writes to
production do not appear here automatically. Do not use production's DATABASE_URL
with this branch's Auth URL.

In Neon, select `cp13-auth`, then **Connect**, and privately copy its current
connection string. Back up your existing `.env.local` locally (it is ignored by Git).
Set these values in `.env.local`:

```dotenv
DATABASE_URL=<cp13-auth connection string from Neon Connect>
NEON_AUTH_BASE_URL=https://ep-soft-wave-aeqmdo3m.neonauth.c-2.us-east-2.aws.neon.tech/neondb/auth
NEON_AUTH_COOKIE_SECRET=<a newly generated random secret>
```

Generate the cookie secret with `openssl rand -base64 32`. Keep it private and
stable between app restarts. It must have at least 32 characters. Never commit
these values or paste the DATABASE_URL/cookie secret into a chat.

Localhost is enabled on this Auth branch. Use `http://localhost:3000`; a LAN-IP
URL is not equivalent for secure authentication cookies. On browsers that reject
secure cookies on local HTTP, use Next's local HTTPS mode and register its origin
in the Auth branch. Do not weaken secure cookies to work around that.

## Local reconciliation (Fish)

Stop the old dev server. From the existing project directory:

```fish
git fetch origin
git switch codex/neon-auth-cp13
npm ci --no-audit --no-fund
```

If that local branch already exists, use `git pull --ff-only` after switching.
Git can carry your existing README edit across because this checkpoint does not
change README. If checkout reports a conflict, preserve/stash that edit first;
do not discard it.

After editing `.env.local`, remove shell overrides so dotenv reads the file:

```fish
set -e DATABASE_URL
set -e NEON_AUTH_BASE_URL
set -e NEON_AUTH_COOKIE_SECRET
npm run db:migrate
npm run dev
```

Migration should be a no-op against the prepared cp13-auth database. The command
now prints safe SQL/network error codes if it fails; it never prints credentials.
Do not blindly retry if it reports an existing relation or column.

## Link your existing journal once

1. Open `http://localhost:3000/sign-up`, register with your own email and password.
2. On **Your account**, copy the **Account reference**. This is the provider user ID,
   not a password, email address, or trade ID.
3. Before creating any new trades, run this in a second terminal in the same
   project directory (replace the example value):

```fish
npm run auth:link-legacy -- YOUR_ACCOUNT_REFERENCE
```

4. Refresh and select **Open journal**. The copied existing trades should appear.
5. Create/edit a trade, refresh, sign out, and confirm the journal asks for sign-in.

This operator-only command requires database-owner credentials; there is no public
claim-journal endpoint. It verifies the provider user exists in this database,
locks the relevant tables, and links the original internal owner. It does not
move/delete trades or accounts and does not change balances. It can safely move
the identity from a newly provisioned *empty* internal user; that empty row is
retained. It refuses an already-linked legacy owner or a new identity that already
owns any trading accounts. Repeating the same successful link is safe.

No automatic email matching is used. Email equality alone must never transfer
ownership. Identity is keyed by Auth issuer plus provider subject; changing an
email does not change ownership. Protected pages and every save action verify the
session independently, bypassing the SDK's cached session cookie for authorization.

## Verification

```fish
npm test
npm run lint
npm run typecheck
npm run build
npm run test:access
npm run test:auth
```

`test:auth` needs OpenSSL (available on Linux Mint). It creates a temporary HTTPS
provider and exercises the actual Next server, installed SDK, HTML forms, cookies,
registration, refresh, expiry, invalid credentials, and sign-out. It does not use
Neon or create live accounts. `test:access` uses unreachable test services and
checks signed-out page/action rejection. Unit/integration tests use PGlite for
identity mapping, no email takeover, legacy-link safety, migrations, and ownership.

Live HTTP testing also passed against the actual cp13-auth Neon provider through
this workspace's proxy: signup, session refresh, sign-out denying protected access,
and signing back in. Synthetic Auth-only test accounts remain on the isolated
branch; they do not own your journal. Use localhost, not 127.0.0.1 or the LAN IP,
for local Auth requests. The Chromium download failed here, so an actual browser
smoke test on your laptop remains a rollout gate before CP14 or deployment.

## Production rollout later

Do not switch production onto this code yet. Verify the development branch first.
Production needs its own Auth provisioning, trusted origin, cookie secret, migration,
and explicit owner link. Do not copy a test branch's identity mapping/issuer into
production. The existing production journal remains intact.

Resources: [Neon Next.js guide](https://neon.com/docs/auth/quick-start/nextjs-api-only),
[server SDK](https://neon.com/docs/auth/reference/nextjs-server).
