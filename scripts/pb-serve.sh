#!/usr/bin/env bash
# Serve PocketBase for local development.
#
# Exists because PocketBase is a binary, not a Node process: nothing loads .env
# for it. The Google OAuth2 migration reads GOOGLE_CLIENT_ID / _SECRET from the
# environment at apply time, so those values have to be present here. On the VPS
# the systemd unit supplies them instead (see the vps-deploy skill).
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

if [[ ! -x ./pb/pocketbase ]]; then
  echo "PocketBase binary missing. Run: ./scripts/pb-download.sh" >&2
  exit 1
fi

exec ./pb/pocketbase serve \
  --http=127.0.0.1:8095 \
  --dir=pb/pb_data \
  --migrationsDir=pb/pb_migrations
