# Production environment

Production and the existing test environment live in **this repository**. They differ
only in build inputs and in which cloud resources they point at, so a commit that
passed testing is the same code that ships.

| | Test | Production |
| --- | --- | --- |
| Frontend | GitHub Pages, `https://alzin.github.io/kanji-quest/` | Cloud Run `kanji-quest-web`, `https://kanji.nipporia.com` |
| Frontend build | `npm run build:pages` (static) | `npm run build` (SSR, `Dockerfile`) |
| API | Cloud Run `kanji-quest-api` | Cloud Run `kanji-quest-api-prod`, `https://kanji-api.nipporia.com` |
| Database | Neon *Kanji Quest Test* | Neon *Kanji Quest Production* |
| Google OAuth | `Kanji Quest Cloud Run Test`, Testing mode | `Kanji Quest` production client, published |
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

Run the `gcloud` blocks in **Cloud Shell** (open from the Cloud Console header).
Cloud Shell is already authenticated, so no keys are stored on your laptop.

```bash
export PROJECT_ID=nipporia-lp-493210
export PROJECT_NUMBER=345401791489
export REGION=asia-southeast1
gcloud config set project "$PROJECT_ID"
```

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

## 2. Create the production database on Neon

In the [Neon console](https://console.neon.tech) under the **Nipporia Launch** org:

1. **New Project** → name `Kanji Quest Production`, PostgreSQL 18, AWS Singapore
   (`ap-southeast-1`, same region as Cloud Run).
2. Keep the default `production` branch and `neondb` database.
3. Set the compute to autoscale 0.25–1 CU. Leave scale-to-zero **off** for
   production so the first request of the day is not slow.
4. From **Connection Details**, copy two strings and keep them somewhere safe for
   the next steps:
   - the **pooled** URL (hostname contains `-pooler`) → runtime
   - the **direct** URL (no `-pooler`) → migrations only

Then create a least-privilege runtime role, matching the test setup. In the Neon
**SQL Editor**, replace the password and run:

```sql
CREATE ROLE kq_cloud_run WITH LOGIN PASSWORD 'generate-a-long-random-password';
GRANT CONNECT ON DATABASE neondb TO kq_cloud_run;
GRANT USAGE ON SCHEMA public TO kq_cloud_run;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kq_cloud_run;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kq_cloud_run;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kq_cloud_run;
```

`kq_cloud_run` cannot create or drop tables and cannot rewrite migration history.
The runtime `DATABASE_URL` uses this role; migrations use the owner role.

## 3. Create the production Google OAuth client

In **Google Auth Platform** for project `nipporia-lp-493210`:

1. **Branding** — app name `Kanji Quest`, support email, app home page
   `https://kanji.nipporia.com`, privacy policy and terms URLs, and the app logo.
2. **Audience** — External, then **Publish app**. While it stays in Testing mode
   only listed test users can sign in and everyone sees an "unverified app" warning.
   Publishing with only the `openid`, `email` and `profile` scopes does not require
   Google's lengthy security review.
3. **Clients → Create client → Web application**, named `Kanji Quest Production`:
   - Authorised JavaScript origin: `https://kanji.nipporia.com`
   - Authorised redirect URI: `https://kanji-api.nipporia.com/api/auth/google/callback`
4. Keep the **client ID** (public, goes in Cloud Run env vars) and the **client
   secret** (goes only into Secret Manager, in step 5).

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

create_secret kanji-quest-prod-database-url        "Neon POOLED connection URL (kq_cloud_run role)"
create_secret kanji-quest-prod-google-client-secret "Google production client secret"
```

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

Run this from your laptop, using the Neon **direct** URL and the owner role — not
the `kq_cloud_run` role, which deliberately cannot alter schema:

```bash
DIRECT_DATABASE_URL="postgresql://OWNER:PASSWORD@HOST.neon.tech/neondb?sslmode=require" \
  npm run db:migrate
```

Repeat this step before any future deploy that adds a migration.

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
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository == 'alzin/kanji-quest'"

gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attributes/repository/alzin/kanji-quest"
```

The `attribute-condition` is what stops any other repository from assuming this
identity. The matching GitHub variables are already set on the `production`
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
