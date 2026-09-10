#!/usr/bin/env bash
# Prove a PocketBase backup archive actually boots and still passes pb:verify.
#
#   npm run pb:backup                  # write an archive under pb/pb_data/backups/
#   npm run pb:restore-drill -- \
#     pb/pb_data/backups/eurovafliai-….zip
#
# Extracts into a disposable directory, boots the pinned binary from pb/VERSION
# on a spare localhost port, runs pb:verify against it, then tears everything
# down. Never touches the live pb/pb_data.
#
# The archive's superuser must match PB_SUPERUSER_EMAIL / _PASSWORD in .env —
# true for a local backup, and true for a production archive only when those
# credentials are the production ones.
set -euo pipefail

ARCHIVE="${1:-}"
if [ -z "$ARCHIVE" ] || [ ! -f "$ARCHIVE" ]; then
  echo "Usage: $0 <path-to-eurovafliai-*.zip>" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PB_BIN="$ROOT/pb/pocketbase"
PORT="${RESTORE_DRILL_PORT:-8096}"
VERSION_FILE="$ROOT/pb/VERSION"

if [ ! -x "$PB_BIN" ]; then
  echo "PocketBase binary missing at $PB_BIN — run: npm run pb:download" >&2
  exit 1
fi

if [ -f "$VERSION_FILE" ]; then
  echo "Pinned PocketBase $(cat "$VERSION_FILE"); binary: $($PB_BIN --version 2>/dev/null || echo unknown)"
fi

TMP="$(mktemp -d "${TMPDIR:-/tmp}/eurovafliai-restore-XXXXXX")"
PB_PID=""

cleanup() {
  if [ -n "$PB_PID" ] && kill -0 "$PB_PID" 2>/dev/null; then
    kill "$PB_PID" 2>/dev/null || true
    wait "$PB_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP"
}
trap cleanup EXIT

echo "Extracting $(basename "$ARCHIVE") into $TMP/pb_data"
mkdir -p "$TMP/pb_data"
unzip -q "$ARCHIVE" -d "$TMP/pb_data"

# A restored backup already carries its schema. Do not point --migrationsDir at
# the live tree: re-applying migrations against restored data is not the drill.
echo "Starting PocketBase on 127.0.0.1:$PORT"
"$PB_BIN" serve \
  --http="127.0.0.1:$PORT" \
  --dir="$TMP/pb_data" \
  >"$TMP/pb.log" 2>&1 &
PB_PID=$!

healthy=0
for _ in $(seq 1 60); do
  if curl -sf --max-time 1 "http://127.0.0.1:$PORT/api/health" >/dev/null; then
    healthy=1
    break
  fi
  if ! kill -0 "$PB_PID" 2>/dev/null; then
    echo "PocketBase exited before becoming healthy. Log:" >&2
    cat "$TMP/pb.log" >&2 || true
    exit 1
  fi
  sleep 0.5
done

if [ "$healthy" != "1" ]; then
  echo "PocketBase did not become healthy on :$PORT within 30s. Log:" >&2
  cat "$TMP/pb.log" >&2 || true
  exit 1
fi
echo "PocketBase healthy on 127.0.0.1:$PORT"

# --env-file does not override an already-exported variable, so this is what
# points pb:verify at the restored instance instead of the live one.
export PB_INTERNAL_URL="http://127.0.0.1:$PORT"
echo "Running pb:verify against the restored archive"
(cd "$ROOT" && npm run pb:verify)

echo "Restore drill passed for $(basename "$ARCHIVE")"
