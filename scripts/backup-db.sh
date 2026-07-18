#!/bin/bash

# NOTE: Dumps the central-server Postgres database to a timestamped plain-SQL file under the
# repo-root tmp/ (gitignored). Homebrew's postgresql formulae are keg-only, so their client tools
# are never linked onto PATH — this script resolves the installed formula's bin dir via brew and
# runs pg_dump/pg_isready from there. Reads DB coordinates from backend/central-server/.env and
# refuses to run unless Postgres is accepting connections. The dump uses --clean --if-exists so it
# can be replayed over an existing database by scripts/restore-db.sh.

set -u

source "$(dirname "$0")/logging.sh"

die() {
    logerr "$1"
    exit 1
}

# Run from the repository root regardless of where the script was invoked from
cd "$(dirname "$0")/.." || exit 1
loginf "Running from repository root '$(pwd)'."

# --- Resolve Homebrew Postgres client tools (keg-only, not on PATH) -------------------------
loginf "Locating Homebrew Postgres client tools..."
command -v brew >/dev/null 2>&1 || die "Homebrew is not installed — this script expects a Homebrew-managed Postgres."
PG_FORMULA="$(brew list --formula 2>/dev/null | grep -E '^postgresql(@[0-9]+)?$' | sort -V | tail -1)"
[ -n "$PG_FORMULA" ] || die "No Homebrew postgresql formula installed (e.g. 'brew install postgresql@17')."
PG_BIN="$(brew --prefix "$PG_FORMULA")/bin"
[ -x "$PG_BIN/pg_dump" ] || die "pg_dump not found under '$PG_BIN' — is '$PG_FORMULA' installed correctly?"
PATH="$PG_BIN:$PATH"
logsuccess "Using client tools from '$PG_BIN' (formula: $PG_FORMULA)."

# --- Load database settings ------------------------------------------------------------------
ENV_FILE="backend/central-server/.env"
loginf "Loading database settings from '$ENV_FILE'..."
[ -f "$ENV_FILE" ] || die "'$ENV_FILE' not found. Run 'task init' first."
# shellcheck disable=SC1090
set -a
. "$ENV_FILE"
set +a
: "${POSTGRES_HOST:?not set in $ENV_FILE}"
: "${POSTGRES_PORT:?not set in $ENV_FILE}"
: "${POSTGRES_DB:?not set in $ENV_FILE}"
: "${POSTGRES_USER:?not set in $ENV_FILE}"
: "${POSTGRES_PASSWORD:?not set in $ENV_FILE}"
loginf "Target: database '$POSTGRES_DB' as user '$POSTGRES_USER' at $POSTGRES_HOST:$POSTGRES_PORT."

# --- Verify Postgres is running --------------------------------------------------------------
loginf "Checking Postgres is accepting connections at $POSTGRES_HOST:$POSTGRES_PORT..."
pg_isready -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" >/dev/null 2>&1 \
    || die "Postgres is not accepting connections at $POSTGRES_HOST:$POSTGRES_PORT — start it before backing up."
logsuccess "Postgres is reachable."

# --- Dump ------------------------------------------------------------------------------------
loginf "Ensuring 'tmp/' exists..."
mkdir -p tmp || die "Failed to create 'tmp/'."
OUT="tmp/${POSTGRES_DB}-$(date +%Y%m%d-%H%M%S).sql"

loginf "Dumping '$POSTGRES_DB' to '$OUT' (plain SQL, --clean --if-exists)..."
if ! PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists -f "$OUT"; then
    rm -f "$OUT"
    die "pg_dump failed."
fi

logsuccess "Backup written to '$OUT' ($(wc -c <"$OUT" | tr -d ' ') bytes)."
