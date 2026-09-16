# Production environment

Production and the existing test environment live in **this repository**. They differ
only in build inputs and in which cloud resources they point at, so a commit that
passed testing is the same code that ships.

| | Test | Production |
| --- | --- | --- |
| Frontend | GitHub Pages, `https://alzin.github.io/kanji-quest/` | Cloud Run `kanji-quest-web`, `https://kanji.nipporia.com` |
| Frontend build | `npm run build:pages` (static) | `npm run build` (SSR, `Dockerfile`) |
| API | Cloud Run `kanji-quest-api` | Cloud Run `kanji-quest-api-prod`, `https://kanji-api.nipporia.com` |
| Database | Neon *Kanji Quest Test* | Neon *Kanji Quest Production* (`gentle-violet-12126837`) |
| Google OAuth | `kanji-quest-test` project, Testing mode | `kanji-quest-prod` project, published |
| Cookies | `SameSite=None` (cross-site) | `SameSite=Lax` (same-site) |
| Trigger | push to `main` | push to `production` |
| Workflow | `.github/workflows/deploy-pages.yml` | `.github/workflows/deploy-production.yml` |

## Why two subdomains of one domain

`kanji.nipporia.com` and `kanji-api.nipporia.com` share the registrable domain
`nipporia.com`, so browsers treat API calls between them as **same-site**. Session
cookies are first-party and work with `SameSite=Lax`, which removes the
third-party-cookie problem that makes sign-in unreliable on the Pages test site
(see [CLOUD_RUN.md](../backend/CLOUD_RUN.md)). CORS is still required, and the API
already allows exactly one origin via `FRONTEND_URL`.

> **Caveat worth knowing:** Google documents Cloud Run domain mappings as Preview,
> with extra latency, and "not supported at General Availability". They are free and
> fine for an MVP. If traffic or latency justifies it, move to a global external
> Application Load Balancer (~$20/month) without changing any application code —
> only the DNS records change.

---

# One-time setup

> **Provisioned and live as of 16 September 2026.** The steps below record how
> each piece was built, so they stay useful for rebuilding or for disaster
> recovery.
>
> | Resource | State |
> | --- | --- |
> | Domain ownership of `nipporia.com` | verified (pre-existing) |
> | Neon `Kanji Quest Production` | Singapore, PG18, 0.25-2 CU, migrated |
> | Neon role `kq_cloud_run` | created, read/write only, verified through the pooler |
> | GCP `kanji-quest-prod` consent screen | **In production**, External |
> | OAuth client `Kanji Quest Production` | created, origins and redirect set |
> | Artifact Registry `kanji-quest` | `asia-southeast1`, holds `web` and `api` images |
> | Deploy SA + Workload Identity Federation | bound, pinned to `refs/heads/production` |
> | Secret Manager | all three production secrets stored, runtime account granted |
> | Cloud Run `kanji-quest-web` | deployed, serving |
> | Cloud Run `kanji-quest-api-prod` | deployed, `/api/health` ok, `/api/ready` ready |
> | `kanji.nipporia.com` | **live**, Google-managed certificate |
> | `kanji-api.nipporia.com` | mapped, certificate provisioning |
> | `production` GitHub environment | required reviewer `alzin`, branch policy `production` |
>
> Remaining: confirm the API certificate, verify a real sign-in, then create the
> `production` branch so later releases go through the gated workflow.

## 1. Domain ownership (already done)

`nipporia.com` is already verified with Google — two `google-site-verification`
TXT records are on the domain, and `ai.nipporia.com` and `ai-api.nipporia.com`
are already mapped to Cloud Run through `ghs.googlehosted.com`. Nothing to do here.

If a mapping is ever refused as unverified, confirm the Cloud Shell account is one
of the verified owners:

```bash
gcloud domains list-user-verified
```

Add missing owners in [Search Console](https://search.google.com/search-console)
under Settings → Users and permissions.

## 2. Production database on Neon (already created)

Project **Kanji Quest Production** exists in the **Nipporia** org (Launch plan):

| | |
| --- | --- |
| Project ID | `gentle-violet-12126837` |
| Region | AWS Asia Pacific 1 (Singapore), matching Cloud Run |
| Postgres | 18 |
| Branch | `production` (`br-soft-wind-b3g0odqc`), database `neondb` |
| Compute | `ep-wispy-lab-b3zv7ia6`, autoscale **0.25–2 CU** |

The 2 CU ceiling is a deliberate cost guard — Neon's default was 8 CU. Raise it
if real traffic needs it, but do so knowingly.

Still to do, because it involves credentials:

Run [`scripts/bootstrap-prod-db.sh`](../scripts/bootstrap-prod-db.sh) from Cloud
Shell. It prompts once for the Neon **owner** connection string (the direct one,
without `-pooler`) and then does the rest without printing a secret:

```bash
cd ~/kanji-quest && git pull && bash scripts/bootstrap-prod-db.sh
```

It applies migrations, creates `kq_cloud_run` with a generated 40-character
password, grants on the tables that now exist plus default privileges for future
ones, verifies the role cannot create schema objects, checks it can connect
through the pooler, and stores the runtime URL as `kanji-quest-prod-database-url`.

> **Order matters.** `GRANT ... ON ALL TABLES IN SCHEMA public` only affects
> tables that already exist. Migrations must run **before** the grants — an
> earlier draft of this runbook had the role created first, against an empty
> database, which would have granted nothing and left the API unable to read its
> own tables.

To do it by hand instead, run the migration from step 6 first, then:

```sql
CREATE ROLE kq_cloud_run WITH LOGIN PASSWORD 'generate-a-long-random-password';
GRANT CONNECT ON DATABASE neondb TO kq_cloud_run;
GRANT USAGE ON SCHEMA public TO kq_cloud_run;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kq_cloud_run;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kq_cloud_run;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kq_cloud_run;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO kq_cloud_run;
```

`kq_cloud_run` cannot create or drop tables and cannot rewrite migration history.
The runtime `DATABASE_URL` uses this role; migrations use the owner role.

## 3. Production Google OAuth client (done)

**Why a separate project.** `nipporia-lp-493210` already has an OAuth consent
screen, configured for an unrelated app (`n8n-sheets`, client `n8n local`). A GCP
project has exactly one consent screen, so reusing it would rebrand that app's
consent screen and change its publishing status. Google sign-in for Kanji Dash
therefore lives in its own project, `kanji-quest-prod` (project number
`673512470706`) — the same split already used for the test environment, and it
needs no billing of its own.

Compute stays in `nipporia-lp-493210`. An OAuth client works across projects; the
backend only ever sees a client ID and secret.

| | |
| --- | --- |
| App name | `Kanji Dash` |
| Publishing status | **In production**, user type External |
| User support email | `ghaithalzein05@gmail.com` (shown on the consent screen) |
| Developer contact | `info@nipporia.com` |
| Home page | `https://kanji.nipporia.com` |
| Privacy policy | `https://kanji.nipporia.com/privacy` |
| Terms of service | `https://kanji.nipporia.com/terms` |
| Authorised domain | `nipporia.com` |
| Client name | `Kanji Quest Production` (Web application) |
| JavaScript origin | `https://kanji.nipporia.com` |
| Redirect URI | `https://kanji-api.nipporia.com/api/auth/google/callback` |

Client ID, needed as `GOOGLE_CLIENT_ID` on Cloud Run — public, not a secret:

```
673512470706-3ghfk10qhrnpcdmmvdqgrci9tetfr1am.apps.googleusercontent.com
```

Verification was not required: only `openid`, `email` and `profile` are requested,
with one authorised domain and no logo. Adding a logo or a sensitive scope later
would trigger Google's review, so treat the consent screen as frozen unless there
is a reason to change it.

> **Client secret.** Google shows a client secret **once, at creation**, and masks
> it permanently afterwards. Add a fresh one under **Clients → Kanji Quest
> Production → Add secret** when you are ready to store it, and paste it straight
> into the Secret Manager prompt in step 5. Delete the unused original secret from
> that same screen afterwards so only one live secret exists.

The user support email is publicly visible on the consent screen. `info@nipporia.com`
is a Microsoft 365 mailbox, and Google only accepts a Google account or a Group
there, so it is currently a personal Gmail. Creating a Google Group for support
and selecting it is the fix if that matters.

Leave the existing test client alone — it keeps the Pages environment working.

## 4. Enable APIs and create the image repository

```bash
gcloud services enable \
  run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com \
  secretmanager.googleapis.com iamcredentials.googleapis.com sts.googleapis.com

gcloud artifacts repositories create kanji-quest \
  --repository-format=docker --location="$REGION" \
  --description="Kanji Quest production images"
```

## 5. Store the secrets

Each command prompts for a value that is **not echoed and not written to shell
history**. Paste at the prompt and press Enter.

```bash
create_secret() {
  read -rsp "$2: " v && echo
  printf '%s' "$v" | gcloud secrets create "$1" --data-file=- --replication-policy=automatic
  unset v
}

create_secret kanji-quest-prod-google-client-secret "Google production client secret"
```

`kanji-quest-prod-database-url` is not created here — the bootstrap script in
step 2 stores it, because it is the thing that generates the password.

The cookie secret is generated in place, so its value is never displayed:

```bash
openssl rand -base64 48 | tr -d '\n' \
  | gcloud secrets create kanji-quest-prod-cookie-secret --data-file=- --replication-policy=automatic
```

Create the runtime identity and give it read access to exactly those three secrets:

```bash
gcloud iam service-accounts create kanji-quest-api-prod \
  --display-name="Kanji Quest production API runtime"

RUNTIME_SA="kanji-quest-api-prod@$PROJECT_ID.iam.gserviceaccount.com"
for s in kanji-quest-prod-database-url kanji-quest-prod-google-client-secret kanji-quest-prod-cookie-secret; do
  gcloud secrets add-iam-policy-binding "$s" \
    --member="serviceAccount:$RUNTIME_SA" --role=roles/secretmanager.secretAccessor
done
```

## 6. Apply migrations

The bootstrap script in step 2 already runs these, as the owner role, before it
creates `kq_cloud_run`. Use this directly only for later migrations:

```bash
DIRECT_DATABASE_URL="postgresql://OWNER:PASSWORD@HOST.neon.tech/neondb?sslmode=require"   npm run db:migrate
```

Use the Neon **direct** URL and the owner role — not `kq_cloud_run`, which
deliberately cannot alter schema. Run this before any deploy that adds a
migration, and before pushing the `production` branch.

## 7. Bootstrap the two Cloud Run services

Runtime configuration is set **once**, here. Later deploys only swap the container
image, so no workflow ever needs to know a secret.

The API — substitute your production client ID:

```bash
gcloud run deploy kanji-quest-api-prod \
  --source backend --region "$REGION" \
  --service-account "kanji-quest-api-prod@$PROJECT_ID.iam.gserviceaccount.com" \
  --allow-unauthenticated \
  --set-env-vars "NODE_ENV=production,HOST=0.0.0.0,FRONTEND_URL=https://kanji.nipporia.com/,GOOGLE_CLIENT_ID=YOUR_PRODUCTION_CLIENT_ID,GOOGLE_REDIRECT_URI=https://kanji-api.nipporia.com/api/auth/google/callback,COOKIE_SAME_SITE=lax,SESSION_DAYS=30,TRUST_PROXY_HOPS=1" \
  --set-secrets "DATABASE_URL=kanji-quest-prod-database-url:1,GOOGLE_CLIENT_SECRET=kanji-quest-prod-google-client-secret:1,COOKIE_SECRET=kanji-quest-prod-cookie-secret:1" \
  --cpu=1 --memory=512Mi --concurrency=40 --timeout=60 \
  --min-instances=0 --max-instances=4
```

The web frontend needs `VITE_API_URL` at **build** time, so it is built through
Cloud Build rather than `--source`:

```bash
gcloud builds submit --config cloudbuild.web.yaml \
  --substitutions=_API_URL=https://kanji-api.nipporia.com/api,_TAG=bootstrap

gcloud run deploy kanji-quest-web \
  --image "$REGION-docker.pkg.dev/$PROJECT_ID/kanji-quest/web:bootstrap" \
  --region "$REGION" --allow-unauthenticated \
  --cpu=1 --memory=512Mi --concurrency=80 --timeout=60 \
  --min-instances=0 --max-instances=4
```

Check both service URLs before touching DNS:

```bash
gcloud run services list --region "$REGION" --format='table(SERVICE,URL)'
```

## 8. Map the custom domains

```bash
gcloud beta run domain-mappings create --service=kanji-quest-web \
  --domain=kanji.nipporia.com --region="$REGION"

gcloud beta run domain-mappings create --service=kanji-quest-api-prod \
  --domain=kanji-api.nipporia.com --region="$REGION"
```

Each command prints the DNS record to create. For subdomains it is a `CNAME` to
`ghs.googlehosted.com`. In **GoDaddy → nipporia.com → DNS**, add:

| Type | Name | Value | TTL |
| --- | --- | --- | --- |
| CNAME | `kanji` | `ghs.googlehosted.com` | 600 |
| CNAME | `kanji-api` | `ghs.googlehosted.com` | 600 |

Use whatever the command actually printed if it differs. Google then issues managed
TLS certificates automatically — this usually takes 15–60 minutes. Watch with:

```bash
gcloud beta run domain-mappings describe --domain=kanji.nipporia.com --region="$REGION"
```

## 9. Let GitHub Actions deploy without a key

Workload Identity Federation lets the workflow authenticate as a service account
with a short-lived token, so no JSON key is ever stored in GitHub.

```bash
gcloud iam service-accounts create kanji-quest-deploy \
  --display-name="Kanji Quest GitHub Actions deployer"
DEPLOY_SA="kanji-quest-deploy@$PROJECT_ID.iam.gserviceaccount.com"

for role in roles/run.developer roles/artifactregistry.writer roles/iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$DEPLOY_SA" --role="$role"
done

gcloud iam workload-identity-pools create github --location=global \
  --display-name="GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc kanji-quest \
  --location=global --workload-identity-pool=github \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository == 'alzin/kanji-quest' && assertion.ref == 'refs/heads/production'"

gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/alzin/kanji-quest"
```

The `attribute-condition` is the security boundary. Matching only on the
repository would let **any** workflow in `alzin/kanji-quest` mint a token for
the deployer - including one added in a pull request branch - so the condition
also pins the ref to `refs/heads/production`. With the required reviewer on the
`production` environment, a deploy then needs both a push to that branch and a
human approval.
environment; verify with `gh variable list --env production`.

## 10. Require an approval before production deploys

On GitHub: **Settings → Environments → production → Required reviewers**, add
yourself. Production deploys then wait for a click, while `main` keeps shipping to
the test site untouched.

---

# Day-to-day

## Promoting a release

Ship to `main` as usual and confirm it on the Pages test site. Then promote the
exact commit you tested:

```bash
git checkout production && git merge --ff-only main && git push origin production
```

The workflow type-checks, runs backend tests, builds both images tagged with the
commit SHA, waits for your approval, deploys, and smoke-tests both services.

If a release adds a migration, run step 6 **before** pushing to `production`.

## Rolling back

Traffic moves back to the previous revision without a rebuild:

```bash
gcloud run revisions list --service=kanji-quest-web --region="$REGION"
gcloud run services update-traffic kanji-quest-web \
  --to-revisions=REVISION_NAME=100 --region="$REGION"
```

## Rotating a secret

Add a version, then point a new revision at it explicitly — never replace a secret
reference with a plain-text env var:

```bash
read -rsp "New value: " v && echo
printf '%s' "$v" | gcloud secrets versions add kanji-quest-prod-cookie-secret --data-file=-
unset v
gcloud run services update kanji-quest-api-prod --region="$REGION" \
  --update-secrets COOKIE_SECRET=kanji-quest-prod-cookie-secret:2
```

Rotating `COOKIE_SECRET` signs every user out; rotate it only when necessary.
