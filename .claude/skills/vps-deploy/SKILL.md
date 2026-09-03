---
name: vps-deploy
description: Deployment runbook for Eurovafliai on the Hostinger VPS — deploy.sh flow, the two-app PM2 ecosystem (web :3007 + worker), PocketBase under systemd on 127.0.0.1:8095, the SSE-safe Nginx vhost, Certbot, backups, and the never-patch-in-production rule. Use when writing or reviewing deploy.sh, ecosystem.config.js, nginx config, GitHub Actions deploy workflows, systemd units, or when diagnosing a production-only problem such as realtime dropping behind the proxy.
---

# VPS deploy runbook

Production is `https://eurovafliai.labrium.online`. The pipeline is
`local → GitHub → VPS`, automated on merge to `main`.

> **Status:** the artifacts described here (`deploy.sh`, `ecosystem.config.js`,
> the vhost, the systemd unit, the deploy workflow) land in **Phase 1.5**. This
> runbook is the spec they must match — read it before writing them.

## Processes

| Process | Manager | Bind | Notes |
|---|---|---|---|
| `eurovafliai-web` | PM2 | `127.0.0.1:3007` | `next start`, behind Nginx |
| `eurovafliai-worker` | PM2 | — | pick timers, autodraft, nightly stats |
| PocketBase | **systemd** | `127.0.0.1:8095` | auto-restart on reboot |

PocketBase is **not** a PM2 app — it is a systemd service so it survives a
reboot independently of the Node processes. `deploy.sh` restarts it **only when
`pb/pb_migrations/` changed**, because PocketBase applies pending migrations on
boot and a restart therefore *is* the migration step; it health-checks the
service afterwards and fails the deploy if it does not come back. Every other
deploy leaves it alone and says so.

One consequence worth knowing before you retry a failed deploy: `changed()`
treats "I cannot tell" as "assume it changed", which is right for a first
deploy and means a **re-run against an already-current checkout restarts
PocketBase** — the pull is a no-op, so `BEFORE_SHA == AFTER_SHA`, so every
`changed()` answers true. Harmless (migrations are idempotent and the health
check guards it), but it is why a retry logs a migration restart for a slice
that shipped no migration.
Both PM2 apps live in one `ecosystem.config.js` and are reloaded together.

Check the ports are actually free before you claim them: `ss -tlnp` and
`pm2 ls`. This box hosts other apps.

## deploy.sh

Run on the VPS from the app directory. The flow, in order:

1. `git pull --ff-only origin main`
2. `npm ci` — but only when `package-lock.json` actually changed; track the
   lockfile hash in a marker inside `node_modules` so a manual pull cannot
   leave dependencies stale
3. `npm run build`
4. apply PocketBase migrations (they also apply on PB boot)
5. `pm2 reload ecosystem.config.js --update-env`

A GitHub Action on push to `main` SSHes in and runs it. Nothing reaches
production without passing CI first.

## Nginx — the SSE part

PocketBase realtime is Server-Sent Events, and default proxy buffering kills it
silently: the draft room simply stops updating, with no error anywhere. The
vhost must contain exactly this:

```nginx
location /pb/ {
    proxy_pass http://127.0.0.1:8095/;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_set_header Authorization $http_authorization;  # known pitfall
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 360s;
}
location /pb/_/ { return 403; }   # admin UI never public
```

- `proxy_buffering off` + `Connection ''` + HTTP/1.1 are all required. Two out
  of three still breaks realtime.
- Forwarding `Authorization` is easy to forget and produces "subscribed but
  never receives anything" for authenticated collections.
- The admin UI is reached by SSH tunnel:
  `ssh -L 8095:127.0.0.1:8095 <host>` → `http://127.0.0.1:8095/_/`.
- Client PB base URL is `https://eurovafliai.labrium.online/pb`; server-side
  Next and the worker use `http://127.0.0.1:8095`.

Vhost pitfalls that have bitten before: placeholder domains left in place,
duplicate `gzip` directives, the wrong upstream port.

**Realtime must be verified in production**, not just locally — it is part of
the Phase 1.5 definition of done.

## TLS / DNS

- Certbot (Let's Encrypt), auto-renewing.
- DNS records in Hostinger's panel.
- The vhost is committed in this repo and applied on the VPS by hand; the file
  on the box and the file in git must never diverge.

## Environment

- Production env lives on the VPS only, mode `600`, owned by the deploy user.
- `.env.example` is the committed source of truth for *which* variables exist —
  update it in the same PR that starts reading a new one.
- Never echo or log env values, not even at debug level.

## Backups

- Nightly `pb_data` backup (PB's backup API or a stop-copy-start window —
  never a naive `cp` of a live SQLite file), with retention.
- Do a restore drill at least once. An untested backup is not a backup.

## Never patch in production

No editing files on the VPS, no hotfix commits straight to `main`, no
schema clicked into the admin UI. The single sanctioned emergency move is
`git checkout <last-good-sha>` + `pm2 reload` to buy time — and it must be
followed by a proper forward fix (revert or fix-forward PR) the same day.

## Draft-night failure modes

- **Worker dies** → timers stop enforcing, nothing corrupts. PM2 restarts it;
  the commissioner can enter picks manually meanwhile, and the next pick — by
  hand or by the restarted worker — repairs anything a half-finished tick left.
  `deploy.sh` warns when a reload has left `eurovafliai-worker` down, because
  the app itself serves perfectly well without it and the loss is invisible
  until a clock runs out. A worker heartbeat is surfaced in the commissioner
  console (Phase 3.6).
- **PB down** → the app is read-broken but the data is intact; systemd restarts.
- **Realtime dropped** → clients show "reconnecting" and the SDK re-subscribes;
  state is re-read from the server on reconnect, never reconstructed locally.
