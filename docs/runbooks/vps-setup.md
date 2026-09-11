# VPS setup — one time only

Everything here happens **once**, by hand. Routine deploys are
`scripts/deploy.sh`, driven by `.github/workflows/deploy.yml` on every green CI
run against `main`.

The spec these artifacts implement is the `vps-deploy` skill. Read it first.

## The box

| | |
|---|---|
| Host | `srv837724.hstgr.cloud` — `185.230.64.48` |
| SSH | `ssh hstgr` (root, `~/.ssh/id_ed25519_vps`) |
| OS | Ubuntu 24.04 LTS |
| Ours | app `127.0.0.1:3007`, PocketBase `127.0.0.1:8095` |

**This box is shared.** It already runs eight other PM2 apps on 3000–3006 and
3100, and five other PocketBase instances on 8090–8094, behind the same nginx.
Check before claiming anything: `ss -tlnp` and `pm2 ls`. Nothing in this runbook
restarts nginx wholesale or touches another app's files.

## Already done

Recorded so nobody repeats them:

- **Deploy key.** `~/.ssh/eurovafliai_deploy` exists locally, its public half is
  in the box's `authorized_keys`, and `SSH_HOST` / `SSH_USER` / `SSH_KEY` are
  set as repository secrets.
- **Node 24.** Installed via fnm for root only, with `--skip-shell` so root's
  `.bashrc` and therefore the PM2 daemon are untouched — the other eight apps
  stay on system Node 22. Reachable at
  `/root/.local/share/fnm/aliases/default/bin/node`; `ecosystem.config.js` and
  `deploy.sh` both name it explicitly.

  Verify it is still isolated after any Node work on this box:

  ```bash
  ssh hstgr 'node -v'                                              # must say v22.x
  ssh hstgr '/root/.local/share/fnm/aliases/default/bin/node -v'   # must say v24.x
  ```

## 1. DNS

One A record, matching every sibling app:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `eurovafliai` | `185.230.64.48` | 3600 |

`labrium.online` is on Hostinger's nameservers (`ns1/ns2.dns-parking.com`), so
this is done in hPanel under **Domains → labrium.online → DNS Zone**.

```bash
dig +short eurovafliai.labrium.online A   # must print 185.230.64.48
```

Do not continue until it does — certbot cannot issue a certificate for a name
that does not resolve.

## 2. Check out the app

```bash
ssh hstgr
git clone https://github.com/andrius-burba-94/eurovafliai.git /var/www/eurovafliai
cd /var/www/eurovafliai
```

## 3. Production environment

`.env` lives on the VPS only, `600`, and is never committed. `.env.example` is
the committed source of truth for *which* variables exist.

```bash
cp .env.example .env
chmod 600 .env
nano .env
```

Production values that differ from local — getting these two backwards is the
mistake `AGENTS.md` warns about:

```ini
NEXT_PUBLIC_PB_URL=https://eurovafliai.labrium.online/pb   # browser, through nginx
PB_INTERNAL_URL=http://127.0.0.1:8095                      # server-side, direct
NEXT_PUBLIC_APP_URL=https://eurovafliai.labrium.online
```

`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are the same client as local, and
its authorized redirect URIs must already include
`https://eurovafliai.labrium.online/auth/callback`. Add it in Google Cloud
Console before testing sign-in, or you get `redirect_uri_mismatch`.

Pick a fresh `PB_SUPERUSER_PASSWORD`; do not reuse the local one.

## 4. PocketBase

```bash
cd /var/www/eurovafliai
./scripts/pb-download.sh
./pb/pocketbase superuser upsert "$PB_SUPERUSER_EMAIL" "$PB_SUPERUSER_PASSWORD" \
  --dir=pb/pb_data
```

Install the unit and start it. Migrations apply on boot, which is also how
`deploy.sh` applies them later.

```bash
cp deploy/systemd/eurovafliai-pb.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now eurovafliai-pb
systemctl status eurovafliai-pb --no-pager
curl -sf http://127.0.0.1:8095/api/health && echo OK
```

Prove the schema landed, rules and all:

```bash
export PATH=/root/.local/share/fnm/aliases/default/bin:$PATH
npm ci
npm run pb:verify
```

## 5. Nginx and TLS

Install the plain `:80` vhost first — certbot needs a working one to answer the
ACME challenge.

```bash
cp deploy/nginx/eurovafliai.labrium.online.conf \
   /etc/nginx/sites-available/eurovafliai.labrium.online
ln -sf /etc/nginx/sites-available/eurovafliai.labrium.online \
       /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

certbot --nginx -d eurovafliai.labrium.online
nginx -t && systemctl reload nginx
```

Certbot rewrites the vhost in place, adding the 443 block and the HTTP
redirect. Keep the committed file as plain `:80` — a post-certbot file would
make nginx refuse to start on a box that has no certificate yet. `deploy.sh`
strips certbot's lines (and the leftover HTTP stub) before comparing, so a
warning means a real edit, not that rewrite. **Re-read the file afterwards**
and confirm certbot did not disturb the `/pb/` block — `proxy_buffering off`,
`Connection ''`, `proxy_http_version 1.1` and the `Authorization` header must
all still be there.

## 6. First deploy

```bash
cd /var/www/eurovafliai
./scripts/deploy.sh
pm2 startup    # print the systemd command, then run what it prints
pm2 save       # so both apps come back after a reboot
```

## 7. Definition of done

Phase 1.5 is not finished until realtime works **in production**. Local passes
prove nothing about nginx buffering.

1. `https://eurovafliai.labrium.online/login` loads over TLS.
2. Sign in with Google. Two different accounts, two devices — a phone and a PC.
3. One creates a league, the other joins with the invite code.
4. **The first person's member list grows without a reload**, and shows the
   other person's real name.

Step 4 is the one that catches a broken `/pb/` proxy. If the row only appears
on refresh, realtime is dead: re-read section 5.

Watch it happen:

```bash
ssh hstgr 'tail -f /var/log/nginx/access.log | grep /pb/'
ssh hstgr 'pm2 logs eurovafliai-web'
```

## 8. Backups

Nightly `pb_data` backup with retention. **Never a naive `cp` of a live SQLite
file** — use PocketBase's own backup API, which snapshots consistently. The
units and script are already in the repo:

- `deploy/systemd/eurovafliai-backup.service` — oneshot that runs
  `scripts/backup-pocketbase.mts` (keeps 14 `eurovafliai-*.zip` archives)
- `deploy/systemd/eurovafliai-backup.timer` — `03:15` local time,
  `Persistent=true`, 15-minute jitter so a shared box does not stampede

Install and enable on the VPS (same idiom as §4):

```bash
scp deploy/systemd/eurovafliai-backup.service \
    deploy/systemd/eurovafliai-backup.timer \
    hstgr:/etc/systemd/system/
ssh hstgr 'systemctl daemon-reload && systemctl enable --now eurovafliai-backup.timer'
ssh hstgr 'systemctl list-timers eurovafliai-backup.timer --no-pager'
```

Prove the oneshot itself once, without waiting for 03:15:

```bash
ssh hstgr 'systemctl start eurovafliai-backup.service && systemctl status eurovafliai-backup.service --no-pager'
ssh hstgr 'ls -lt /var/www/eurovafliai/pb/pb_data/backups/eurovafliai-*.zip | head'
```

`scripts/deploy.sh` warns on every deploy when the timer is not enabled, or when
the newest archive is older than 48 hours (a timer that is enabled but failing
would otherwise be silent — the oneshot has no `OnFailure=`).

### Restore drill

An untested backup is not a backup. The drill boots the pinned binary against a
disposable copy of an archive and runs `pb:verify` — never against the live
`pb_data`.

Locally (no VPS required to prove the mechanism):

```bash
npm run pb:backup
npm run pb:restore-drill -- pb/pb_data/backups/eurovafliai-<stamp>.zip
```

Against a production archive: scp one zip down, then add `--adopt-superuser`:

```bash
scp hstgr:/var/www/eurovafliai/pb/pb_data/backups/eurovafliai-<stamp>.zip /tmp/
npm run pb:restore-drill -- /tmp/eurovafliai-<stamp>.zip --adopt-superuser
```

`pb:verify` authenticates as a superuser, and a production archive carries
production's — which will not match the `.env` on your laptop. The flag upserts
the `.env` credentials into the **extracted copy** before it boots. Do not
reach for the other fix: copying production secrets onto a laptop to satisfy a
drill trades a real risk for a rehearsal. Nothing on the box, in the archive or
in the live database is touched, and `pb:verify` asserts collection rules and
unique indexes rather than anything about the superuser record.

Two limits worth knowing, not fixing here: archives land in
`pb/pb_data/backups/` on the **same disk as the database**, so this protects
against a bad delete and not against disk loss; and `backup-pocketbase.mts`
goes through `parseServerEnv`, which also requires the Google OAuth secrets, so
a `.env` that lost those would fail the backup too.

## 9. PM2 log hygiene

Both PM2 apps write to `/root/.pm2/logs/eurovafliai-{web,worker}-{out,error}.log`
with no size bound. `pm2-logrotate` is a **daemon-global** module and would
change logging for the eight sibling apps on this box — ruled out. Pointing
`out_file` / `error_file` in `ecosystem.config.js` would need a `pm2 delete` +
`start` to take effect (`reload` does not re-open log paths) — an outage to
move a file. So rotation is a logrotate file scoped to this app only:

- `deploy/logrotate/eurovafliai` → `/etc/logrotate.d/eurovafliai`
- Glob: `/root/.pm2/logs/eurovafliai-*.log` (nothing else)
- `copytruncate` is required: without it PM2 keeps writing the rotated inode
  and the live log silently stops growing

Install:

```bash
scp deploy/logrotate/eurovafliai hstgr:/etc/logrotate.d/eurovafliai
ssh hstgr 'chmod 644 /etc/logrotate.d/eurovafliai'
ssh hstgr 'logrotate -d /etc/logrotate.d/eurovafliai'
```

The dry run must mention the four `eurovafliai-*.log` files and must not name
another app's logs. `scripts/deploy.sh` warns when the file is missing or
differs from git.

## Never patch in production

No editing files on the box, no hotfix straight to `main`, no schema clicked
into the admin UI. The one sanctioned emergency move buys time only:

```bash
cd /var/www/eurovafliai
git checkout <last-good-sha>
pm2 reload ecosystem.config.js
```

Follow it with a real revert or fix-forward PR the same day.
