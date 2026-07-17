#!/bin/bash

# NOTE: Bootstraps a fresh clone of this repo: initializes the backend/ai-service git submodule
# and creates .env files (from .env.example) for frontend and backend/central-server. Does not
# touch backend/storage-service or backend/ai-service/.env — run `task setup` separately for
# storage-service.

set -u

source "$(dirname "$0")/logging.sh"

die() {
    logerr "$1"
    exit 1
}

# Run from the repository root regardless of where the script was invoked from
cd "$(dirname "$0")/.." || exit 1

if ! command -v git >/dev/null 2>&1; then
    die "'git' is not installed or not on PATH."
fi

loginf "Initializing 'backend/ai-service' submodule..."
if ! git submodule update --init backend/ai-service; then
    die "Failed to initialize the 'backend/ai-service' submodule."
fi

ENV_DIRS=("frontend" "backend/central-server")

for dir in "${ENV_DIRS[@]}"; do
    if [ -f "$dir/.env" ]; then
        loginf "'$dir/.env' already exists, leaving it as is."
    elif ! cp "$dir/.env.example" "$dir/.env"; then
        die "Failed to create '$dir/.env' from .env.example."
    else
        loginf "Created '$dir/.env' from .env.example."
    fi
done

logsuccess "Bootstrap complete. Next: 'task setup' for storage-service, then 'task server' / 'task client'."
