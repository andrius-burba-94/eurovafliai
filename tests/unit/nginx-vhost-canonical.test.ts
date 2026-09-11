import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  canonicalizeVhost,
  vhostsEquivalent,
} from "../../scripts/nginx-vhost-canonical";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const committedPath = join(
  repoRoot,
  "deploy/nginx/eurovafliai.labrium.online.conf",
);

const CERTBOT_TLS = `    listen [::]:443 ssl ipv6only=on; # managed by Certbot
    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/eurovafliai.labrium.online/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/eurovafliai.labrium.online/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
`;

const CERTBOT_HTTP_STUB = `
server {
    if ($host = eurovafliai.labrium.online) {
        return 301 https://$host$request_uri;
    } # managed by Certbot


    listen 80;
    listen [::]:80;
    server_name eurovafliai.labrium.online;
    return 404; # managed by Certbot
}
`;

/**
 * What certbot actually does to the committed file.
 *
 * The first version of this helper only *appended* the TLS lines and the stub
 * and left `listen 80;` in place — so the suite was green while the real box
 * warned on every deploy. Certbot **replaces** the plain `listen 80;` with its
 * own `listen 443 ssl;`, and that missing line was the whole divergence. A
 * fixture that does not do what the tool does proves nothing.
 */
function withCertbot(committed: string): string {
  const rewritten = committed.replace(/^[ \t]*listen 80;[ \t]*\n/m, "");
  const lastBrace = rewritten.lastIndexOf("}");
  return (
    rewritten.slice(0, lastBrace) + CERTBOT_TLS + rewritten.slice(lastBrace) +
    CERTBOT_HTTP_STUB
  );
}

describe("canonicalizeVhost", () => {
  it("treats a post-certbot vhost as equal to the committed :80 file", () => {
    const committed = readFileSync(committedPath, "utf8");
    expect(vhostsEquivalent(withCertbot(committed), committed)).toBe(true);
  });

  it("still sees a /pb/ hand-edit", () => {
    const committed = readFileSync(committedPath, "utf8");
    const drifted = withCertbot(committed).replace(
      "proxy_buffering off;",
      "proxy_buffering on;",
    );
    expect(vhostsEquivalent(drifted, committed)).toBe(false);
  });

  it("ignores trailing whitespace", () => {
    const committed = readFileSync(committedPath, "utf8");
    const padded = committed.replace(
      "proxy_buffering off;",
      "proxy_buffering off;   ",
    );
    expect(vhostsEquivalent(padded, committed)).toBe(true);
  });

  it("does not swallow an extra non-certbot server block", () => {
    const committed = readFileSync(committedPath, "utf8");
    const extra = `${committed}\nserver {\n    listen 8080;\n    return 403;\n}\n`;
    expect(vhostsEquivalent(extra, committed)).toBe(false);
  });

  it("ignores a comment-only edit, which is not configuration", () => {
    // The live vhost is installed by hand, so a prose change in git leaves the
    // box's header stale for ever. Slice 8.0 rewrote exactly that header and
    // every deploy afterwards warned about a file whose directives matched.
    const committed = readFileSync(committedPath, "utf8");
    const reworded = committed.replace(
      /^# Eurovafliai.*$/m,
      "# Eurovafliai — a different sentence entirely",
    );
    expect(reworded).not.toBe(committed);
    expect(vhostsEquivalent(reworded, committed)).toBe(true);
  });

  it("ignores the listen line certbot rewrites", () => {
    // git carries `:80` on purpose — certbot needs it to answer the ACME
    // challenge and then replaces it. Neither side is wrong, so the line
    // cannot be compared.
    const committed = readFileSync(committedPath, "utf8");
    const tls = committed.replace("listen 80;", "listen 443 ssl;");
    expect(vhostsEquivalent(tls, committed)).toBe(true);
  });

  it("still sees a hand-edit hiding under an ignored comment", () => {
    // The comment rule must not become a smuggling route: a real directive
    // change on a line that also carries a comment is still a difference.
    const committed = readFileSync(committedPath, "utf8");
    const drifted = committed.replace(
      "proxy_buffering off;",
      "proxy_buffering on; # harmless, surely",
    );
    expect(vhostsEquivalent(drifted, committed)).toBe(false);
  });

  it("canonical of the committed file is stable", () => {
    const committed = readFileSync(committedPath, "utf8");
    expect(canonicalizeVhost(committed)).toBe(canonicalizeVhost(committed));
  });
});
