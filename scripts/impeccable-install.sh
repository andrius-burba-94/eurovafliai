#!/usr/bin/env bash
# Install the Impeccable design skill so Claude/Cursor hooks can run it.
# The pack is gitignored (third-party); CI uses `npx impeccable detect` instead.
# Idempotent: skips when hook.mjs is already present.

set -euo pipefail

cd "$(dirname "$0")/.."

HOOK=".claude/skills/impeccable/scripts/hook.mjs"

if [[ -f "$HOOK" ]]; then
  echo "Impeccable skill already installed at .claude/skills/impeccable/."
  exit 0
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "npx not found — skip Impeccable install. UI hooks will no-op until it is." >&2
  exit 0
fi

echo "Installing Impeccable into .claude/skills/impeccable/ (gitignored)."
if ! npx --yes impeccable install; then
  echo "Impeccable install failed — UI hooks will no-op until you re-run npm run setup:impeccable." >&2
  exit 0
fi
