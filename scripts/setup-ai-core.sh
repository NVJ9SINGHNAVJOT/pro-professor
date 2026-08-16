#!/bin/bash

# NOTE: Sets up backend/ai-core: initializes the git submodule, runs its own `task setup`
# (venv + pip install), and creates its .env from .env.example. All actions here only touch
# gitignored artifacts (.venv, .env) inside the submodule via its own documented tooling — no
# git-tracked file in that repo is created, edited, or deleted.

set -u

source "$(dirname "$0")/logging.sh"

die() {
    logerr "$1"
    exit 1
}

# Run from the repository root regardless of where the script was invoked from
cd "$(dirname "$0")/.." || exit 1

for cmd in git task; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        die "'$cmd' is not installed or not on PATH."
    fi
done

loginf "Initializing 'backend/ai-core' submodule..."
if ! git submodule update --init backend/ai-core; then
    die "Failed to initialize the 'backend/ai-core' submodule."
fi

loginf "Running 'task setup' in 'backend/ai-core' (venv + dependencies)..."
if ! (cd backend/ai-core && task setup); then
    die "'task setup' failed in 'backend/ai-core'."
fi

if [ -f backend/ai-core/.env ]; then
    loginf "'backend/ai-core/.env' already exists, leaving it as is."
elif ! cp backend/ai-core/.env.example backend/ai-core/.env; then
    die "Failed to create 'backend/ai-core/.env' from .env.example."
else
    loginf "Created 'backend/ai-core/.env' from .env.example."
fi

logsuccess "ai-core ready at 'backend/ai-core'. Activate with: source backend/ai-core/.venv/bin/activate"
