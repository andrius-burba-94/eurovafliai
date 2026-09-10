import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The committed logrotate file is the one safe door for PM2 log hygiene on a
 * shared box. Read it off disk — same shape as the backup-units and nginx
 * tests — so a rename or a dropped `copytruncate` cannot silently ship.
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const config = readFileSync(
  join(repoRoot, "deploy/logrotate/eurovafliai"),
  "utf8",
);
const deploy = readFileSync(join(repoRoot, "scripts/deploy.sh"), "utf8");

/** The paths a block's first line claims to rotate. */
function globsIn(block: string): string[] {
  const header = block.split("{", 1)[0] ?? "";
  // Comments may sit above the path line and name the install target; keep
  // only tokens that look like log globs.
  return header
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.startsWith("/") && token.includes(".log"));
}

describe("deploy/logrotate/eurovafliai", () => {
  it("uses copytruncate so PM2 keeps writing the live path", () => {
    expect(config).toMatch(/^\s*copytruncate\s*$/m);
  });

  it("rotates daily and keeps two weeks", () => {
    expect(config).toMatch(/^\s*daily\s*$/m);
    expect(config).toMatch(/^\s*rotate\s+14\s*$/m);
    expect(config).toMatch(/^\s*compress\s*$/m);
    expect(config).toMatch(/^\s*delaycompress\s*$/m);
    expect(config).toMatch(/^\s*missingok\s*$/m);
    expect(config).toMatch(/^\s*notifempty\s*$/m);
  });

  it("globs only eurovafliai PM2 logs, not a sibling app", () => {
    const globs = globsIn(config);
    expect(globs).toEqual(["/root/.pm2/logs/eurovafliai-*.log"]);

    const pattern = globs[0]!.replace(/\./g, "\\.").replace(/\*/g, ".*");
    const re = new RegExp(`^${pattern}$`);
    expect(re.test("/root/.pm2/logs/eurovafliai-web-out.log")).toBe(true);
    expect(re.test("/root/.pm2/logs/eurovafliai-worker-error.log")).toBe(true);
    expect(re.test("/root/.pm2/logs/foo-web-out.log")).toBe(false);
    expect(re.test("/root/.pm2/logs/other-app-error.log")).toBe(false);
  });

  it("is the same path deploy.sh warns about when missing or drifted", () => {
    expect(deploy).toContain('LOGROTATE_LIVE="/etc/logrotate.d/eurovafliai"');
    expect(deploy).toContain("deploy/logrotate/eurovafliai");
    expect(deploy).toContain("cmp -s");
  });
});
