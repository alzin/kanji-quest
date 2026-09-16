#!/usr/bin/env bash
# Bootstraps the production database from Cloud Shell.
#
# Prompts once for the Neon OWNER connection string, then does everything that
# depends on it without printing a secret or leaving one in shell history:
#
#   1. applies migrations as the owner, so the tables exist
#   2. creates the least-privilege kq_cloud_run role and grants on those tables
#   3. builds the pooled runtime URL and stores it in Secret Manager
#
# Order matters: GRANT ... ON ALL TABLES only affects tables that already exist,
# so migrations have to run before the grants, not after.
#
# Usage:  bash scripts/bootstrap-prod-db.sh

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-nipporia-lp-493210}"
SECRET_NAME="kanji-quest-prod-database-url"
DB_NAME="neondb"
RUNTIME_ROLE="kq_cloud_run"

command -v psql >/dev/null || { echo "psql not found. Run: sudo apt-get install -y postgresql-client" >&2; exit 1; }
command -v gcloud >/dev/null || { echo "gcloud not found." >&2; exit 1; }

if gcloud secrets describe "$SECRET_NAME" --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "Secret $SECRET_NAME already exists. Delete it first if you mean to recreate it." >&2
  exit 1
fi

read -rsp "Neon OWNER connection string (the DIRECT one, no -pooler): " OWNER_URL; echo
[ -n "$OWNER_URL" ] || { echo "Nothing entered." >&2; exit 1; }

case "$OWNER_URL" in
  postgresql://*|postgres://*) ;;
  *) echo "That does not look like a PostgreSQL URL." >&2; exit 1 ;;
esac
case "$OWNER_URL" in
  *-pooler.*) echo "That is the pooled URL. Migrations need the direct one." >&2; exit 1 ;;
esac

echo "==> Installing backend dependencies"
# Dev dependencies are needed: db:migrate runs through tsx, which is one of them.
( cd "$(dirname "$0")/../backend" && npm ci --no-audit --no-fund --loglevel=error )

echo "==> Applying migrations as the owner"
( cd "$(dirname "$0")/../backend" \
  && DIRECT_DATABASE_URL="$OWNER_URL" npm run --silent db:migrate )

echo "==> Creating $RUNTIME_ROLE and granting on the tables that now exist"
# Alphanumeric only, so the password never needs URL-encoding in the DSN.
# No `| head` here: head closes the pipe early, tr dies of SIGPIPE, and under
# `set -o pipefail` that silently kills the script. tr reads all of its input
# instead, and bash truncates afterwards.
ROLE_PW_RAW="$(openssl rand -base64 60 | LC_ALL=C tr -dc 'A-Za-z0-9')"
ROLE_PW="${ROLE_PW_RAW:0:40}"
[ ${#ROLE_PW} -eq 40 ] || { echo "Could not generate a password." >&2; exit 1; }

PGPASSWORD_SQL=$(cat <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$RUNTIME_ROLE') THEN
    CREATE ROLE $RUNTIME_ROLE WITH LOGIN PASSWORD '$ROLE_PW';
  ELSE
    ALTER ROLE $RUNTIME_ROLE WITH LOGIN PASSWORD '$ROLE_PW';
  END IF;
END \$\$;
GRANT CONNECT ON DATABASE $DB_NAME TO $RUNTIME_ROLE;
GRANT USAGE ON SCHEMA public TO $RUNTIME_ROLE;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO $RUNTIME_ROLE;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO $RUNTIME_ROLE;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO $RUNTIME_ROLE;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO $RUNTIME_ROLE;
SQL
)
echo "    (Neon suspends idle computes; a cold start here can take ~15s - let it run)"
printf '%s' "$PGPASSWORD_SQL" | PGCONNECT_TIMEOUT=30 psql "$OWNER_URL" -v ON_ERROR_STOP=1 --quiet >/dev/null
echo "    role ready"

echo "==> Confirming the role can only read and write, not alter schema"
PGCONNECT_TIMEOUT=30 psql "$OWNER_URL" -tAc "SELECT rolcreatedb OR rolcreaterole OR rolsuper FROM pg_roles WHERE rolname='$RUNTIME_ROLE';" \
  | grep -qx 'f' || { echo "Role has more privilege than expected." >&2; exit 1; }

# Neon's pooled endpoint is the direct host with -pooler on the endpoint id.
OWNER_HOST="${OWNER_URL#*@}"; OWNER_HOST="${OWNER_HOST%%/*}"; OWNER_HOST="${OWNER_HOST%%\?*}"
POOLED_HOST="$(printf '%s' "$OWNER_HOST" | sed -E 's|^(ep-[A-Za-z0-9-]+)\.|\1-pooler.|')"
[ "$POOLED_HOST" != "$OWNER_HOST" ] || { echo "Could not derive the pooled host from $OWNER_HOST." >&2; exit 1; }

RUNTIME_URL="postgresql://${RUNTIME_ROLE}:${ROLE_PW}@${POOLED_HOST}/${DB_NAME}?sslmode=require"

echo "==> Checking the runtime role can actually connect through the pooler"
PGCONNECT_TIMEOUT=30 psql "$RUNTIME_URL" -tAc 'SELECT 1;' >/dev/null

echo "==> Storing $SECRET_NAME"
printf '%s' "$RUNTIME_URL" \
  | gcloud secrets create "$SECRET_NAME" --project "$PROJECT_ID" \
      --data-file=- --replication-policy=automatic >/dev/null

unset OWNER_URL ROLE_PW RUNTIME_URL PGPASSWORD_SQL
echo "Done. $SECRET_NAME stored; no secret was printed."
