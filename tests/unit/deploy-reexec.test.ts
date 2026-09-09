import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const stubSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "helpers/reexec-stub.sh"),
  "utf8",
);

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-c", "init.defaultBranch=main", ...args], {
    cwd,
    encoding: "utf8",
  });
}

function initRepo(dir: string, script: string): void {
  git(dir, "init");
  git(dir, "config", "user.email", "reexec@test");
  git(dir, "config", "user.name", "reexec");
  writeFileSync(join(dir, "deploy.sh"), script, { mode: 0o755 });
  git(dir, "add", "deploy.sh");
  git(dir, "commit", "-m", "v1");
}

describe("deploy.sh re-exec after pull", () => {
  it("runs the pulled script and keeps the pre-pull SHA", () => {
    const root = mkdtempSync(join(tmpdir(), "reexec-"));
    const origin = join(root, "origin");
    const clone = join(root, "clone");
    execFileSync("mkdir", [origin]);
    initRepo(origin, stubSource.replace("payload-new", "payload-old"));

    git(root, "clone", origin, clone);

    const v2 = stubSource.replace("payload-old", "payload-gone");
    writeFileSync(join(origin, "deploy.sh"), v2, { mode: 0o755 });
    git(origin, "add", "deploy.sh");
    git(origin, "commit", "-m", "v2");

    const before = git(clone, "rev-parse", "HEAD").trim();
    const after = git(origin, "rev-parse", "HEAD").trim();
    expect(before).not.toBe(after);

    const out = execFileSync("bash", [join(clone, "deploy.sh")], {
      encoding: "utf8",
    });

    expect(out).toContain("reexecing");
    expect(out).toContain("after-reexec");
    expect(out).toContain(`${before} -> ${after}`);
    expect(out).toContain("payload-new");
    expect(out).not.toContain("payload-old");
    expect(out).not.toContain("already-at");
  });

  it("does not exec when pull is a no-op", () => {
    const root = mkdtempSync(join(tmpdir(), "reexec-noop-"));
    const origin = join(root, "origin");
    const clone = join(root, "clone");
    execFileSync("mkdir", [origin]);
    initRepo(origin, stubSource);
    git(root, "clone", origin, clone);

    const out = execFileSync("bash", [join(clone, "deploy.sh")], {
      encoding: "utf8",
    });

    expect(out).toContain("already-at");
    expect(out).toContain("payload-old");
    expect(out).not.toContain("reexecing");
    expect(out).not.toContain("after-reexec");
  });
});
