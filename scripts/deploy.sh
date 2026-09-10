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

# ── 1. Move to the new code, then run *that* copy of this file ───────────────
#
# bash reads a script by byte offset. `git pull` can replace this file while
# we are still in it, so a length change resumes mid-line, and a change to
# deploy.sh never applies to its own deploy. Pull, then exec the fresh copy
# exactly once. Pass the SHAs through: after exec, HEAD is already AFTER, and
# recomputing both would make changed() restart PocketBase on every deploy.
#
# --ff-only, so a dirty or diverged working tree fails loudly here rather than
# producing a merge commit nobody asked for on a production box.
if [ "${DEPLOY_REEXEC:-}" = "1" ]; then
  : "${BEFORE_SHA:?BEFORE_SHA must be set after re-exec}"
  : "${AFTER_SHA:?AFTER_SHA must be set after re-exec}"
  say "Deploy script after re-exec"
  echo "$BEFORE_SHA -> $AFTER_SHA"
else
  say "Pulling main"
  BEFORE_SHA="$(git rev-parse HEAD)"
  git pull --ff-only origin main
  AFTER_SHA="$(git rev-parse HEAD)"
  export BEFORE_SHA AFTER_SHA
  if [ "$BEFORE_SHA" != "$AFTER_SHA" ]; then
    say "Re-executing the pulled deploy.sh"
    DEPLOY_REEXEC=1 exec "$0" "$@"
  fi
  echo "Already at $AFTER_SHA — continuing anyway (a rebuild is cheap and this"
  echo "makes a re-run after a failed deploy do the right thing)."
fi

say "Node in use"
node -v
npm -v

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
# invisible until draft night. Certbot rewrites the live file in place (443 +
# HTTP redirect); the committed file stays :80 on purpose. Compare the
# canonical form so a warning means a real hand-edit, not certbot.
if [ -f "$NGINX_LIVE" ]; then
  if ! npx --no-install tsx scripts/nginx-vhost-canonical.ts \
      "$NGINX_LIVE" deploy/nginx/eurovafliai.labrium.online.conf; then
    warn "The installed nginx vhost differs from the one in git."
    warn "Certbot's TLS lines are ignored. Reconcile a real /pb/ (or other) edit."
  fi
else
  warn "No nginx vhost installed at $NGINX_LIVE — see docs/runbooks/vps-setup.md"
fi

# ── 6b. Tell me if nightly backups are off or stale ──────────────────────────
#
# The units are committed under deploy/systemd/ but installed by hand (same
# shape as the nginx vhost). A box that never enabled the timer, or a timer that
# is enabled but failing, would otherwise be silent: the oneshot has no
# OnFailure=, and nothing else reads pb/pb_data/backups/. Warn here so every
# deploy surfaces the gap. See docs/runbooks/vps-setup.md §8.
BACKUP_TIMER="eurovafliai-backup.timer"
BACKUP_DIR="$APP_DIR/pb/pb_data/backups"
if command -v systemctl >/dev/null 2>&1; then
  if [ "$(systemctl is-enabled "$BACKUP_TIMER" 2>/dev/null || true)" != "enabled" ]; then
    warn "$BACKUP_TIMER is not enabled — nightly backups are off."
    warn "Install steps: docs/runbooks/vps-setup.md §8"
  fi
fi
NEWEST_BACKUP="$(ls -t "$BACKUP_DIR"/eurovafliai-*.zip 2>/dev/null | head -n 1 || true)"
if [ -z "$NEWEST_BACKUP" ]; then
  warn "No eurovafliai-*.zip archives in $BACKUP_DIR — no backup has been proved on this box."
elif [ -n "$(find "$NEWEST_BACKUP" -mmin +2880 2>/dev/null)" ]; then
  warn "Newest backup is older than 48h: $NEWEST_BACKUP"
  warn "The timer may be enabled but failing — check: journalctl -u eurovafliai-backup.service"
fi

# ── 6c. Tell me if PM2 log rotation is missing or drifted ────────────────────
#
# PM2 itself never rotates. pm2-logrotate is a daemon-global module and would
# change logging for every app on this shared box, so it is not an option.
# out_file/error_file in ecosystem.config.js need a delete+start to take
# effect (reload does not re-open paths). The committed logrotate file is the
# one safe door: scoped to eurovafliai-*.log, copytruncate so PM2 keeps the
# same fd. Installed by hand to /etc/logrotate.d/ — warn until it matches.
LOGROTATE_LIVE="/etc/logrotate.d/eurovafliai"
LOGROTATE_GIT="$APP_DIR/deploy/logrotate/eurovafliai"
if [ ! -f "$LOGROTATE_LIVE" ]; then
  warn "No logrotate config at $LOGROTATE_LIVE — PM2 logs for eurovafliai-* are unbounded."
  warn "Install steps: docs/runbooks/vps-setup.md §9"
elif ! cmp -s "$LOGROTATE_LIVE" "$LOGROTATE_GIT"; then
  warn "Installed logrotate config differs from deploy/logrotate/eurovafliai."
  warn "Reconcile, then: logrotate -d $LOGROTATE_LIVE"
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

# The worker has no port to curl, and since slice 2.5 it is the only thing that
# enforces a pick deadline: a deploy that quietly left it stopped would give the
# league a draft where nobody ever times out and autodraft never fires. A warning
# rather than a failure, because the app itself is up and serving — but a
# warning that says exactly what is lost.
WORKER_PID="$(pm2 pid eurovafliai-worker 2>/dev/null | tr -dc '0-9')"
if [ -n "$WORKER_PID" ] && [ "$WORKER_PID" != "0" ]; then
  echo "worker is online (pid $WORKER_PID)"
else
  warn "eurovafliai-worker is NOT running — pick timers and autodraft are off."
  warn "Start it with: pm2 reload ecosystem.config.js --update-env"
fi

say "Deployed $AFTER_SHA"
