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

function withCertbot(committed: string): string {
  const lastBrace = committed.lastIndexOf("}");
  return (
    committed.slice(0, lastBrace) + CERTBOT_TLS + committed.slice(lastBrace) +
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

  it("canonical of the committed file is stable", () => {
    const committed = readFileSync(committedPath, "utf8");
    expect(canonicalizeVhost(committed)).toBe(canonicalizeVhost(committed));
  });
});
