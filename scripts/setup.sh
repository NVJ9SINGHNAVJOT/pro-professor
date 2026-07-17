#!/bin/bash

# NOTE: Full project bootstrap for a fresh clone. Orchestrates the individual per-service setup
# scripts (ai-service, storage-service) and installs dependencies + .env files for frontend and
# backend/central-server. Fails fast on the first error.

set -u

source "$(dirname "$0")/logging.sh"

die() {
    logerr "$1"
    exit 1
}

# Run from the repository root regardless of where the script was invoked from
cd "$(dirname "$0")/.." || exit 1

for cmd in npm java; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        die "'$cmd' is not installed or not on PATH."
    fi
done

bash scripts/setup-ai-service.sh || die "ai-service setup failed."
bash scripts/setup-storage-service.sh || die "storage-service setup failed."

loginf "Installing frontend dependencies..."
if ! (cd frontend && npm install); then
    die "'npm install' failed in 'frontend'."
fi
if [ -f frontend/.env ]; then
    loginf "'frontend/.env' already exists, leaving it as is."
elif ! cp frontend/.env.example frontend/.env; then
    die "Failed to create 'frontend/.env' from .env.example."
else
    loginf "Created 'frontend/.env' from .env.example."
fi

loginf "Resolving backend/central-server Maven dependencies..."
if ! (cd backend/central-server && ./mvnw -q dependency:resolve); then
    die "Maven dependency resolution failed in 'backend/central-server'."
fi
if [ -f backend/central-server/.env ]; then
    loginf "'backend/central-server/.env' already exists, leaving it as is."
elif ! cp backend/central-server/.env.example backend/central-server/.env; then
    die "Failed to create 'backend/central-server/.env' from .env.example."
else
    loginf "Created 'backend/central-server/.env' from .env.example."
fi

logsuccess "Bootstrap complete. Next: 'task server' / 'task client' / 'task storage', and 'source backend/ai-service/.venv/bin/activate' for ai-service."
