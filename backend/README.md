# Kanji Quest API

Express 5 + TypeScript, PostgreSQL on Neon, and Google sign-in. The existing frontend still serves the entire curriculum and runs the game without an account. Only account progress endpoints require authentication.

## Local setup

Use Node.js 24 and install both applications from the repository root:

```sh
npm ci
npm run backend:install
```

Copy `backend/.env.example` to `backend/.env` and replace the placeholders:

1. Create a Neon project and database. Copy its pooled connection string into `DATABASE_URL`, and its direct connection string into `DIRECT_DATABASE_URL`. The adapter enforces certificate verification for Neon. [Neon connections](https://neon.com/docs/connect/connection-pooling).
2. In Google Cloud / Google Auth Platform, configure the branding, audience, and a **Web application** OAuth client. Request only `openid`, `email`, and `profile`. Add test users if the consent screen is in testing mode. Register the exact redirect URI `http://localhost:5173/api/auth/google/callback` and put the client ID and secret in `backend/.env`. No Gmail inbox permission is requested. [Google setup](https://developers.google.com/identity/openid-connect/openid-connect).
3. Generate `COOKIE_SECRET` using the command in the example file. Keep it stable across API restarts and instances. `FRONTEND_URL` must match the frontend URL including any deployment base path.
4. Apply the schema, then start the API and frontend in separate terminals:

```sh
npm run db:migrate
npm run backend:dev
```

```sh
npm run dev
```

Open `http://localhost:5173`. Vite forwards `/api` to Express on port 3001. Keep this port/hostname consistent with Google, `FRONTEND_URL`, and `GOOGLE_REDIRECT_URI`. The app can still be played with the API unavailable, and shows that cloud saves are unavailable.

## Guest and account behavior

- Guests can access the whole website and play all game modes under the existing curriculum unlock rules. Guest progress is temporary, held in memory and `sessionStorage` for the current tab. Reloading that tab and the Google redirect preserve it; it is not a permanent save. Browser session restoration can retain session storage.
- **Continue with Google** both creates an account on first use and signs in on later visits. Gmail and other verified Google accounts work. Accounts are identified by Google's stable subject ID, never by matching an email supplied by the browser.
- After sign-in, a new account receives the current guest progress. If cloud and guest/device saves both exist and differ, the user explicitly chooses which to retain. No automatic addition of coins or duplicate run rewards occurs.
- Account changes save automatically. Each write includes the version it was based on. A stale write returns `409`, and the app presents the cloud/device choice without silently overwriting either version.
- Signed-in progress has an account-specific local cache for pending writes and retries. On a fresh page load, the server must verify the session before that cache is read. If offline at startup, the user can play temporarily as a guest and recover their account cache after reconnecting.
- Signing out revokes the server session and starts a fresh guest adventure. It does not delete cloud progress or pending account caches. Another account cannot load a previous user's cache through the app.
- The original `kanji-dash-v1` browser save remains untouched. Signed-in users can choose **Account → Import previous browser save**, then confirm which progress to retain.

This backend stores validated personal learning snapshots. Gameplay scoring and unlock calculations remain client-side; it is not an authoritative competitive leaderboard or anti-cheat service.

## Clean architecture

```text
src/domain/               Entities, save types, curriculum manifest, application errors
src/application/          Use cases, repository/provider ports, progress validation
src/infrastructure/auth/  Google OAuth adapter, cryptography
src/infrastructure/db/    PostgreSQL adapters, migrations, maintenance
src/interfaces/http/      Express routes, cookies, CSRF, error translation
src/server.ts             Dependency wiring, listener, graceful shutdown
```

Domain and application code do not depend on Express, PostgreSQL drivers, or Google SDKs. The composition root injects the adapters. HTTP controllers derive the account ID from the verified session; a request cannot choose a different owner.

Tables: `users`, `sessions`, `user_progress`, and `schema_migrations`. Saves use JSONB to preserve the existing complete SRS snapshot (kanji schedules, mastery, streaks, currency, runs, seals, unlocks, and selected road). Migrations are transactional, locked, checksummed, and explicitly invoked before deployment.

When the curriculum changes, regenerate the backend validation manifest and commit it:

```sh
npm run db:generate-curriculum --prefix backend
```

Tests check the manifest against the frontend curriculum. Periodically run `npm run db:cleanup-sessions --prefix backend` to remove expired session rows. Expired sessions are rejected even before cleanup.

## HTTP contract

All paths are relative to the API origin. Responses containing account data use `Cache-Control: no-store`; the PWA service worker does not cache these routes.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/health` | Process liveness |
| GET | `/api/ready` | Database/schema readiness; 503 if unavailable |
| GET | `/api/auth/google` | Start Google authorization with state, nonce, and PKCE |
| GET | `/api/auth/google/callback` | Validate Google identity, rotate session, return to configured frontend |
| GET | `/api/auth/session` | `{ user: null }` or `{ user: { id, email, name, picture }, csrfToken }` |
| POST | `/api/auth/logout` | Revoke current session; 204 |
| GET | `/api/progress` | `{ save: SaveData \| null, version: number }`; 401 for guests |
| PUT | `/api/progress` | `{ save: SaveData, expectedVersion: number }`; returns saved snapshot/version |

Use `credentials: "include"`. Mutations require `Origin` matching `FRONTEND_URL` and `X-CSRF-Token` from the session response. The frontend also supplies that token on progress reads to detect an account switch in another tab between identifying the user and loading progress. PUT requires `Content-Type: application/json`. A new save starts at expected version 0; the first stored version is 1. Stale writes return `{ error: { code: "PROGRESS_CONFLICT", message }, current: { save, version } }`. Other errors use `{ error: { code, message } }`; invalid payloads return 400, oversized bodies 413, and missing sessions 401.

OAuth credentials and tokens stay on the server. Session cookies are HttpOnly with absolute expiry; production uses Secure `__Host-` cookies. Only a SHA-256 hash of each random session token is stored. The OAuth transaction cookie is encrypted, authenticated, and expires after ten minutes. Google verification checks signature, issuer, audience, expiration, verified email, and nonce; state and PKCE bind the callback to its browser. No access or refresh tokens are retained.

## Deployment

Neon hosts PostgreSQL. Express is deployed separately on [Cloud Run](./CLOUD_RUN.md); GitHub Pages serves only the static frontend. The local test environment is configured as described in [TEST_ENVIRONMENT.md](./TEST_ENVIRONMENT.md).

1. Configure server environment values from `.env.example`, with `NODE_ENV=production` and HTTPS URLs. `GOOGLE_REDIRECT_URI` must reach the Express callback and be registered exactly in Google Cloud. Set `TRUST_PROXY_HOPS` to your actual proxy topology; do not trust arbitrary forwarded headers.
2. Run `npm ci --prefix backend`, `npm run db:migrate`, and `npm run backend:build` during the release process. Start with `npm run backend:start`. Alternatively build `docker build -t kanji-quest-api backend` and inject environment values at runtime; apply migrations separately before starting the container.
3. Prefer the frontend and API on the same site, such as `https://learn.example.com` and `https://api.example.com`, with `COOKIE_SAME_SITE=lax`, or reverse-proxy `/api` on the frontend origin. Configure public `VITE_API_URL=https://api.example.com/api` before building the frontend if it uses a separate API origin. It is a public endpoint, never a database URL or secret.
4. The Pages workflow reads the repository variable `VITE_API_URL`. With a deployment base path, use a `FRONTEND_URL` such as `https://learn.example.com/kanji-quest/`. Production builds do not include Vite's development proxy.
5. Truly cross-site hosting requires `COOKIE_SAME_SITE=none` plus HTTPS; browser third-party-cookie restrictions can still block sessions. Use same-site custom domains or a same-origin reverse proxy for reliable sign-in.
6. Check `/api/ready`, complete a real Google sign-in, play a run, refresh, and sign in on another device. Those live checks require your configured Google client and Neon database.

The sign-in rate limiter uses process memory. If running several API replicas, apply a shared rate limit at the gateway or replace its store. PostgreSQL sessions and save versions are shared across instances.

## Verification

```sh
npm run backend:typecheck
npm run backend:build
npm run backend:test
npm run typecheck
npm test
npm run test:pwa
```

Backend tests cover HTTP authentication, CSRF, session rotation/revocation, account isolation, save validation, and concurrent updates. Database tests execute the actual migration and repository SQL with embedded PostgreSQL via PGlite. To also exercise the `pg` network driver, set `TEST_DATABASE_URL` to a disposable PostgreSQL database; Neon requires a direct, non-pooled URL. The test creates and removes an isolated schema. Backend CI supplies PostgreSQL for this test. Browser account tests mock the API to cover guest storage, account migration, logout, offline recovery, and conflict handling; they do not impersonate a live Google login.
