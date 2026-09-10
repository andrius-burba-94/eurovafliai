import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The backup units and the deploy warning must agree on names, or a rename of
 * one silently disables the other. Read the committed files off disk — same
 * shape as the nginx vhost canonical test — so the test and the shipped
 * artifacts cannot drift.
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

const timer = readFileSync(
  join(repoRoot, "deploy/systemd/eurovafliai-backup.timer"),
  "utf8",
);
const service = readFileSync(
  join(repoRoot, "deploy/systemd/eurovafliai-backup.service"),
  "utf8",
);
const deploy = readFileSync(join(repoRoot, "scripts/deploy.sh"), "utf8");
const drill = readFileSync(join(repoRoot, "scripts/restore-drill.sh"), "utf8");

describe("eurovafliai-backup units", () => {
  it("keeps Persistent=true so a box that was off at 03:15 still backs up", () => {
    expect(timer).toMatch(/^\s*Persistent=true\s*$/m);
  });

  it("fires nightly with a randomized delay", () => {
    expect(timer).toMatch(/^\s*OnCalendar=\*-\*-\* 03:15:00\s*$/m);
    expect(timer).toMatch(/^\s*RandomizedDelaySec=15m\s*$/m);
  });

  it("runs the committed backup script against the live app dir", () => {
    expect(service).toContain("WorkingDirectory=/var/www/eurovafliai");
    expect(service).toContain(
      "/var/www/eurovafliai/scripts/backup-pocketbase.mts",
    );
    expect(service).toContain("Requires=eurovafliai-pb.service");
  });

  it("is the same timer name deploy.sh warns about when disabled", () => {
    expect(deploy).toContain('BACKUP_TIMER="eurovafliai-backup.timer"');
    expect(deploy).toContain("eurovafliai-*.zip");
    expect(deploy).toContain("pb/pb_data/backups");
  });

  it("ships a restore drill that boots the pinned binary and runs pb:verify", () => {
    expect(drill).toContain("pb/pocketbase");
    expect(drill).toContain("pb:verify");
    expect(drill).toContain("PB_INTERNAL_URL");
    expect(drill).toMatch(/mktemp/);
  });

  it("stamps backup names without uppercase (PocketBase rejects ISO T/Z)", () => {
    const backup = readFileSync(
      join(repoRoot, "scripts/backup-pocketbase.mts"),
      "utf8",
    );
    expect(backup).toMatch(/\[-:TZ\.\]/);
    expect(backup).toContain("eurovafliai-${stamp}.zip");
  });
});
