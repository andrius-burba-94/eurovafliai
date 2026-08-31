#!/usr/bin/env bash
# Deploy Eurovafliai on the VPS. Run from the app directory, or let the
# GitHub Action (.github/workflows/deploy.yml) run it on push to main.
#
#   ssh hstgr '/var/www/eurovafliai/scripts/deploy.sh'
#
# Never patch in production: this script only ever moves the box to a commit
# that already exists on main and already passed CI. The one sanctioned
# emergency move is `git checkout <last-good-sha> && pm2 reload ecosystem.config.js`
# to buy time, followed by a real forward fix the same day.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/eurovafliai}"
PB_SERVICE="eurovafliai-pb"
NGINX_LIVE="/etc/nginx/sites-available/eurovafliai.labrium.online"

# Node 24 through fnm's `default` alias — see ecosystem.config.js for why this
# app must not use the box's system Node 22.
NODE_BIN_DIR="/root/.local/share/fnm/aliases/default/bin"
export PATH="$NODE_BIN_DIR:$PATH"

cd "$APP_DIR"

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
warn() { printf '\n\033[33m!!  %s\033[0m\n' "$*" >&2; }

say "Node in use"
node -v
npm -v

# ── 1. Move to the new code ──────────────────────────────────────────────────
#
# --ff-only, so a dirty or diverged working tree fails loudly here rather than
# producing a merge commit nobody asked for on a production box.
say "Pulling main"
BEFORE_SHA="$(git rev-parse HEAD)"
git pull --ff-only origin main
AFTER_SHA="$(git rev-parse HEAD)"

if [ "$BEFORE_SHA" = "$AFTER_SHA" ]; then
  echo "Already at $AFTER_SHA — continuing anyway (a rebuild is cheap and this"
  echo "makes a re-run after a failed deploy do the right thing)."
else
  echo "$BEFORE_SHA -> $AFTER_SHA"
fi

changed() {
  # True when $1 changed between the two commits. Always true on the first
  # deploy, when BEFORE == AFTER and we cannot tell.
  [ "$BEFORE_SHA" = "$AFTER_SHA" ] && return 0
  ! git diff --quiet "$BEFORE_SHA" "$AFTER_SHA" -- "$1"
}

# ── 2. Dependencies, only when the lockfile actually moved ───────────────────
#
# Tracked by a marker inside node_modules rather than by comparing the two
# commits: that way a manual `git pull` by a human, or a half-finished previous
# deploy, cannot leave the box running against stale dependencies.
#
# NOT `--omit=dev`: `next build` needs typescript and tailwind, and the worker
# runs through tsx. All three are devDependencies.
say "Dependencies"
LOCK_HASH="$(sha256sum package-lock.json | cut -d' ' -f1)"
MARKER="node_modules/.eurovafliai-lock-hash"
if [ ! -d node_modules ] || [ ! -f "$MARKER" ] || [ "$(cat "$MARKER")" != "$LOCK_HASH" ]; then
  echo "lockfile changed (or first run) — npm ci"
  npm ci
  printf '%s' "$LOCK_HASH" > "$MARKER"
else
  echo "lockfile unchanged — skipping npm ci"
fi

# ── 3. Build ─────────────────────────────────────────────────────────────────
say "Building"
npm run build

# ── 4. PocketBase migrations ─────────────────────────────────────────────────
#
# By restarting the service, not by running `pocketbase migrate up` alongside
# it. Two processes on one SQLite file is a bad idea, and worse, a PocketBase
# that is already running would not notice schema applied underneath it — its
# collection cache would be stale until something else restarted it.
#
# PocketBase applies pending migrations on boot, so a restart IS the migration
# step. It only happens when pb/pb_migrations/ actually changed, which is what
# keeps ordinary deploys from touching the database process at all.
if changed "pb/pb_migrations"; then
  say "Migrations changed — restarting $PB_SERVICE to apply them"
  systemctl restart "$PB_SERVICE"
  for _ in $(seq 1 30); do
    if curl -sf --max-time 2 http://127.0.0.1:8095/api/health > /dev/null; then
      echo "PocketBase healthy"
      break
    fi
    sleep 1
  done
  if ! curl -sf --max-time 2 http://127.0.0.1:8095/api/health > /dev/null; then
    echo "PocketBase did not come back healthy after its restart." >&2
    systemctl status "$PB_SERVICE" --no-pager --lines=20 >&2 || true
    exit 1
  fi
else
  say "No migration changes — leaving $PB_SERVICE alone"
fi

# ── 5. Reload the Node apps ──────────────────────────────────────────────────
#
# `reload`, not `restart`: PM2 brings the new process up before retiring the
# old one, so a deploy mid-lobby does not blank anybody's screen.
say "Reloading PM2"
pm2 reload ecosystem.config.js --update-env
pm2 save

# ── 6. Tell me if the vhost has drifted ──────────────────────────────────────
#
# The vhost is committed but installed by hand, so the two can diverge and the
# failure that causes — realtime dying because proxy_buffering came back — is
# invisible until draft night. Certbot legitimately rewrites the file on
# renewal, so this warns rather than fails.
if [ -f "$NGINX_LIVE" ]; then
  if ! diff -q "$NGINX_LIVE" deploy/nginx/eurovafliai.labrium.online.conf > /dev/null 2>&1; then
    warn "The installed nginx vhost differs from the one in git."
    warn "Expected after a certbot issue/renewal. Otherwise, reconcile them."
  fi
else
  warn "No nginx vhost installed at $NGINX_LIVE — see docs/runbooks/vps-setup.md"
fi

# ── 7. Prove it actually serves ──────────────────────────────────────────────
say "Smoke test"
for _ in $(seq 1 30); do
  if curl -sf --max-time 3 -o /dev/null http://127.0.0.1:3007/login; then
    echo "app responds on 127.0.0.1:3007"
    break
  fi
  sleep 1
done
if ! curl -sf --max-time 3 -o /dev/null http://127.0.0.1:3007/login; then
  echo "The app did not respond after the reload." >&2
  pm2 logs eurovafliai-web --lines 40 --nostream >&2 || true
  exit 1
fi
curl -sf --max-time 3 http://127.0.0.1:8095/api/health > /dev/null \
  && echo "PocketBase responds on 127.0.0.1:8095"

say "Deployed $AFTER_SHA"
