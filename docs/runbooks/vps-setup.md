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
redirect. That divergence from git is expected and `deploy.sh` only warns about
it. **Re-read the file afterwards** and confirm certbot did not disturb the
`/pb/` block — `proxy_buffering off`, `Connection ''`, `proxy_http_version 1.1`
and the `Authorization` header must all still be there.

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
file** — use PocketBase's own backup API, which snapshots consistently:

```bash
curl -X POST http://127.0.0.1:8095/api/backups \
  -H "Authorization: $SUPERUSER_TOKEN"
```

Do a restore drill once. An untested backup is not a backup.

> Not yet implemented. Tracked as debt in `docs/STATUS.md` — it belongs before
> draft night, not before the first deploy.

## Never patch in production

No editing files on the box, no hotfix straight to `main`, no schema clicked
into the admin UI. The one sanctioned emergency move buys time only:

```bash
cd /var/www/eurovafliai
git checkout <last-good-sha>
pm2 reload ecosystem.config.js
```

Follow it with a real revert or fix-forward PR the same day.
