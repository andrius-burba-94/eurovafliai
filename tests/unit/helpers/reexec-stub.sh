#!/usr/bin/env bash
# Miniature of deploy.sh's pull-then-exec prologue. The payload after it is
# what a length-changing pull would replace — here, git actually replaces it.
set -euo pipefail
cd "$(dirname "$0")"

if [ "${DEPLOY_REEXEC:-}" = "1" ]; then
  : "${BEFORE_SHA:?BEFORE_SHA must be set after re-exec}"
  : "${AFTER_SHA:?AFTER_SHA must be set after re-exec}"
  echo "after-reexec"
  echo "$BEFORE_SHA -> $AFTER_SHA"
  echo "payload-new"
else
  BEFORE_SHA="$(git rev-parse HEAD)"
  git pull --ff-only origin main
  AFTER_SHA="$(git rev-parse HEAD)"
  export BEFORE_SHA AFTER_SHA
  if [ "$BEFORE_SHA" != "$AFTER_SHA" ]; then
    echo "reexecing"
    DEPLOY_REEXEC=1 exec "$0" "$@"
  fi
  echo "already-at $AFTER_SHA"
  echo "payload-old"
fi
