# eurovafliai.com cutover — 5 October 2026

The existing Hostinger VPS at `185.230.64.48` now serves the site at
`https://eurovafliai.com`. The domain owner changed its `@` A record; `www`
remains a CNAME to the root. Authoritative DNS and public resolvers returned
the VPS address. The old `eurovafliai.labrium.online` record remains in place
for redirects.

The committed Nginx vhost serves the root and redirects `www` and the old
subdomain. It was installed on the VPS, passed `nginx -t`, and Certbot expanded
the existing certificate to cover all three names. The certificate expires on
3 January 2027 and retains its normal renewal. The production-only `.env` was
backed up on the VPS, then its two public URLs were changed to the root domain.
`deploy.sh` built and reloaded the app and worker at the merged main commit;
PocketBase remained healthy. No secrets were copied into the repository.

Public checks after the deploy:

| Check | Result |
|---|---|
| Root `/login` | HTTPS 200; page displayed in browser |
| Root `/pb/api/health` | 200 |
| Root `/pb/_/` | 403 |
| `www` and old subdomain `/login` | 301 to the root domain |
| Root `/auth/callback` without a code | 307 to root `/login?error=missing_code` |
| Root `/pb/api/realtime` | `PB_CONNECT` arrived before the six-second client timeout; stream stayed open |

The domain owner confirmed that the new callback URI was saved in the Google
OAuth client. A completed sign-in at the new domain has not yet been reported,
so that remains the user-facing verification step.

Certbot inserted empty spacer lines into the live redirect blocks. The deploy
script's canonical vhost comparison warned about those lines even though the
Nginx directives matched. The follow-up normalizer ignores empty lines, with
a regression test, so future deploys still warn for substantive changes such
as `proxy_buffering on`.
