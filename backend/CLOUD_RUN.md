# Cloud Run deployment

Project: `nipporia-lp-493210` (Nipporia LP), region `asia-southeast1`, service `kanji-quest-api`.

## Current status — September 10, 2026

The backend is deployed. Revision `kanji-quest-api-00001-89z` receives 100% of traffic.

- [API health](https://kanji-quest-api-345401791489.asia-southeast1.run.app/api/health)
- [Database readiness](https://kanji-quest-api-345401791489.asia-southeast1.run.app/api/ready)
- [Cloud Run service](https://console.cloud.google.com/run/detail/asia-southeast1/kanji-quest-api?project=nipporia-lp-493210)
- [Container build](https://console.cloud.google.com/cloud-build/builds;region=asia-southeast1/4c3ac2df-3a19-4bff-895e-0c5e7fda36e2?project=nipporia-lp-493210)

The backend build and 13 backend tests passed before packaging. Live checks passed for health, Neon readiness, guest sessions, protected progress, CORS preflight, Google authorization with PKCE, secure OAuth cookies, and blocking environment-file access. Real Google sign-in completed with `auth=success` and created a session in Neon. Browser account tests separately cover guest progress transfer, account isolation, and save conflicts with a mocked API.

OAuth identity remains in the separate `kanji-quest-test` project under the `Kanji Quest Cloud Run Test` client. Its registered callback is `https://kanji-quest-api-345401791489.asia-southeast1.run.app/api/auth/google/callback`; its audience remains in Testing mode. This OAuth project does not require Cloud Run billing. Local development uses its existing separate client and ignored `backend/.env`.

## Deployment configuration

- Only `backend/` was built with its Dockerfile. `.gcloudignore` explicitly includes the required build files and source; `.dockerignore` also excludes environment files. The uploaded source archive was checked for credentials.
- Runtime identity: `kanji-quest-api@nipporia-lp-493210.iam.gserviceaccount.com`. It has Secret Accessor bindings on the three secrets listed below. Build identity: `kanji-quest-build@nipporia-lp-493210.iam.gserviceaccount.com`, with the Cloud Run Builder role.
- Private environment variables resolve from Secret Manager at startup, pinned to version 1: `DATABASE_URL` → `kanji-quest-database-url`, `GOOGLE_CLIENT_SECRET` → `kanji-quest-google-client-secret`, `COOKIE_SECRET` → `kanji-quest-cookie-secret`. Values are not stored in the public source or build image.
- Ordinary configuration is stored in Cloud Run environment settings: `NODE_ENV=production`, `HOST=0.0.0.0`, frontend URL, Google client ID, callback URL, `COOKIE_SAME_SITE=none`, `SESSION_DAYS=30`, and `TRUST_PROXY_HOPS=1`. Cloud Run supplies `PORT=8080`.
- Request-based CPU allocation, 1 CPU, 512 MiB memory, zero minimum instances, at most two instances, concurrency 40, and a 60-second request timeout. The startup probe calls `/api/health`.
- The Neon runtime login `kq_cloud_run` has only connect/schema usage and required table read/write privileges. It cannot create schema objects or write migration history. The migration-owner connection remains separate. Migrations were checked before deployment; run them again before revisions that change the schema.
- The frontend origin is `https://alzin.github.io`; its path is `/kanji-quest/`. This is cross-site with Cloud Run's default domain and needs `SameSite=None; Secure`. Browser third-party-cookie restrictions can still prevent sign-in persistence. A shared custom domain or same-origin proxy is preferable for a public production release.

The GitHub repository variable `VITE_API_URL` is set to `https://kanji-quest-api-345401791489.asia-southeast1.run.app/api`. The Pages workflow uses it to build and publish the frontend on pushes to `main`. Backend CI checks the API but does not deploy new Cloud Run revisions. No private values belong in any `VITE_` variable.

For later revisions, retain the runtime identity and secret references. Build from `backend/` with `gcloud run deploy kanji-quest-api --source backend --project nipporia-lp-493210 --region asia-southeast1 --build-service-account projects/nipporia-lp-493210/serviceAccounts/kanji-quest-build@nipporia-lp-493210.iam.gserviceaccount.com`. Manage secret changes in Secret Manager and explicitly select the new version on a new Cloud Run revision. Do not replace secret references with plain-text environment values.
