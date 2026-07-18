#!/bin/bash

# NOTE: Restores the central-server Postgres database from a plain-SQL dump produced by
# scripts/backup-db.sh. The dump file must be given explicitly as the first argument (FILE=... via
# the task). Homebrew's postgresql formulae are keg-only, so their client tools are never linked
# onto PATH — this script resolves the installed formula's bin dir via brew and runs psql/pg_isready
# from there. Reads DB coordinates from backend/central-server/.env, refuses to run unless Postgres
# is accepting connections, and asks for confirmation before overwriting the database.

set -u

source "$(dirname "$0")/logging.sh"

die() {
    logerr "$1"
    exit 1
}

# Run from the repository root regardless of where the script was invoked from
cd "$(dirname "$0")/.." || exit 1
loginf "Running from repository root '$(pwd)'."

# --- Validate the dump file argument ---------------------------------------------------------
FILE="${1:-}"
loginf "Validating dump file argument..."
[ -n "$FILE" ] || die "No dump file given. Usage: task db:restore FILE=tmp/<dump>.sql"
[ -f "$FILE" ] || die "Dump file '$FILE' not found."
logsuccess "Will restore from '$FILE' ($(wc -c <"$FILE" | tr -d ' ') bytes)."

# --- Resolve Homebrew Postgres client tools (keg-only, not on PATH) -------------------------
loginf "Locating Homebrew Postgres client tools..."
command -v brew >/dev/null 2>&1 || die "Homebrew is not installed — this script expects a Homebrew-managed Postgres."
PG_FORMULA="$(brew list --formula 2>/dev/null | grep -E '^postgresql(@[0-9]+)?$' | sort -V | tail -1)"
[ -n "$PG_FORMULA" ] || die "No Homebrew postgresql formula installed (e.g. 'brew install postgresql@17')."
PG_BIN="$(brew --prefix "$PG_FORMULA")/bin"
[ -x "$PG_BIN/psql" ] || die "psql not found under '$PG_BIN' — is '$PG_FORMULA' installed correctly?"
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
    || die "Postgres is not accepting connections at $POSTGRES_HOST:$POSTGRES_PORT — start it before restoring."
logsuccess "Postgres is reachable."

# --- Confirm (destructive) -------------------------------------------------------------------
war "This OVERWRITES the '$POSTGRES_DB' database at $POSTGRES_HOST:$POSTGRES_PORT with '$FILE'."
printf "Type 'yes' to continue: "
read -r reply
[ "$reply" = "yes" ] || die "Restore cancelled."

# --- Restore ---------------------------------------------------------------------------------
loginf "Restoring '$POSTGRES_DB' from '$FILE' (psql, ON_ERROR_STOP=1)..."
if ! PGPASSWORD="$POSTGRES_PASSWORD" psql -v ON_ERROR_STOP=1 -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$FILE"; then
    die "psql restore failed."
fi

logsuccess "Restore complete from '$FILE'."
