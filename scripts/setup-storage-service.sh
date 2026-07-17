#!/bin/bash

# NOTE: Fetches storage-service out of the external micro-yard repo into backend/storage-service.
# Only the three subtrees the service needs are pulled (sparse checkout): the service itself,
# go-shared (imported as github.com/navjot/go-shared), and ui-shared (its typography/fonts are
# embedded by web/embed.go). micro-yard's root go.work and Taskfile are not fetched, so this
# script generates a go.work for the flat layout and rewrites the '../ui-shared' path in the
# service's Taskfile to the vendored copy. Re-running refetches from scratch, keeping .env and
# uploaded files. If the layout changes upstream, update the config block below.
# Variables:
# REPO_URL      - URL of the micro-yard repository
# DEST          - where the assembled service is placed
# SERVICE_PATH  - subtree in micro-yard that becomes DEST itself
# VENDOR_PATHS  - subtrees copied in under DEST/
# KEEP_PATHS    - paths inside DEST preserved across re-runs (local config, uploaded files)

set -u

REPO_URL="https://github.com/NVJ9SINGHNAVJOT/micro-yard.git"
DEST="backend/storage-service"
SERVICE_PATH="storage-service"
VENDOR_PATHS=("go-shared" "ui-shared")
KEEP_PATHS=(".env" "storage")

source "$(dirname "$0")/logging.sh"

die() {
    logerr "$1"
    exit 1
}

# Run from the repository root regardless of where the script was invoked from
cd "$(dirname "$0")/.." || exit 1

for cmd in git go task; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        die "'$cmd' is not installed or not on PATH."
    fi
done

TMP="$(mktemp -d)" || die "Failed to create a temporary directory."
trap 'rm -rf "$TMP"' EXIT

loginf "Fetching ${SERVICE_PATH} ${VENDOR_PATHS[*]} from '$REPO_URL'..."
if ! git clone --depth 1 --filter=blob:none --sparse "$REPO_URL" "$TMP/src" >/dev/null 2>&1; then
    die "Failed to clone '$REPO_URL'."
fi
if ! git -C "$TMP/src" sparse-checkout set "$SERVICE_PATH" "${VENDOR_PATHS[@]}" >/dev/null 2>&1; then
    die "Failed to sparse-checkout '$SERVICE_PATH' and ${VENDOR_PATHS[*]} from '$REPO_URL'."
fi

for path in "$SERVICE_PATH" "${VENDOR_PATHS[@]}"; do
    if [ ! -d "$TMP/src/$path" ]; then
        die "'$path' not found in '$REPO_URL'. The micro-yard layout changed — update scripts/setup-storage-service.sh."
    fi
done

# Uploaded files and local config live inside DEST, which is wiped on every run.
if [ -d "$DEST" ]; then
    mkdir -p "$TMP/keep" || die "Failed to stage existing files from '$DEST'."
    for path in "${KEEP_PATHS[@]}"; do
        if [ -e "$DEST/$path" ]; then
            loginf "Preserving '$DEST/$path' across the refresh."
            mv "$DEST/$path" "$TMP/keep/" || die "Failed to preserve '$DEST/$path'."
        fi
    done
fi

rm -rf "$DEST" || die "Failed to remove the existing '$DEST'."
mkdir -p "$DEST" || die "Failed to create '$DEST'."
cp -R "$TMP/src/$SERVICE_PATH/." "$DEST/" || die "Failed to copy '$SERVICE_PATH' into '$DEST'."
for path in "${VENDOR_PATHS[@]}"; do
    cp -R "$TMP/src/$path" "$DEST/$path" || die "Failed to copy '$path' into '$DEST'."
done

for path in "${KEEP_PATHS[@]}"; do
    if [ -e "$TMP/keep/$path" ]; then
        rm -rf "${DEST:?}/$path"
        mv "$TMP/keep/$path" "$DEST/$path" || die "Failed to restore '$DEST/$path'."
    fi
done

# The server reads PORT from .env and otherwise falls back to 9000, which is also where
# central-server calls it (STORAGE_SERVICE_BASE_URL) — .env.example already matches.
if [ -f "$DEST/.env" ]; then
    loginf "'$DEST/.env' already exists, leaving it as is."
elif ! cp "$DEST/.env.example" "$DEST/.env"; then
    die "Failed to create '$DEST/.env' from .env.example."
else
    loginf "Created '$DEST/.env' from .env.example."
fi

# sync-shared copies the design assets out of ui-shared/, which sits next to the service in
# micro-yard but inside it here.
if ! grep -q '\.\./ui-shared' "$DEST/Taskfile.yml"; then
    die "'$SERVICE_PATH/Taskfile.yml' no longer references '../ui-shared' — update scripts/setup-storage-service.sh."
fi
if ! sed -i.bak 's#\.\./ui-shared#ui-shared#g' "$DEST/Taskfile.yml"; then
    die "Failed to rewrite the ui-shared path in '$DEST/Taskfile.yml'."
fi
rm -f "$DEST/Taskfile.yml.bak"

# Replaces micro-yard's root go.work: storage-service requires go-shared at v0.0.0, which only
# resolves through a workspace.
cat >"$DEST/go.work" <<'EOF'
go 1.25

use (
	.
	./go-shared
)
EOF

# task build depends on sync-shared (which embeds web/shared/, generated not committed) and
# compiles both binaries, so this both syncs assets and verifies the service builds.
loginf "Building storage-service in '$DEST'..."
if ! (cd "$DEST" && task build); then
    die "'task build' failed in '$DEST'."
fi

logsuccess "storage-service ready at '$DEST'. Run it with: task storage"
