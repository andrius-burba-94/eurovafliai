#!/usr/bin/env bash
# Cursor counterpart of .claude/settings.json Impeccable hooks.
# Fail open: a missing install or a detector error must not block the agent.
# Stdin (hook payload) is drained and discarded; stdout is always valid JSON.

set -uo pipefail

cat >/dev/null || true

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOK="$ROOT/.claude/skills/impeccable/scripts/hook.mjs"

if [[ -f "$HOOK" ]] && command -v node >/dev/null 2>&1; then
  node "$HOOK" >/dev/null 2>&1 || true
fi

printf '%s\n' '{}'
exit 0
