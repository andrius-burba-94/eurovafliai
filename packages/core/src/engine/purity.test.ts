import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The purity invariant, enforced rather than asserted.
 *
 * §2 of the draft-engine invariants says this directory has zero PocketBase
 * imports, zero I/O and no implicit clock. Every other file here says so in a
 * comment, and a comment has never stopped anybody. This test reads the source
 * and fails the build.
 *
 * It matters because the breach is silent: importing the PocketBase SDK into the
 * engine would keep every existing test green, and the damage would only show up
 * when the worker imported the engine and dragged a database client into a
 * process that is supposed to be able to run without one.
 *
 * Test files are excluded — this file itself reads the filesystem, and the
 * autodraft tests are free to do whatever they need.
 */

const ENGINE_DIR = dirname(fileURLToPath(import.meta.url));

const sourceFiles = readdirSync(ENGINE_DIR)
  .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
  .sort();

const read = (name: string): string => readFileSync(join(ENGINE_DIR, name), "utf8");

/** Strip comments, so the prose describing a ban does not trip the ban. */
const codeOnly = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the engine is pure", () => {
  it("has source files to check", () => {
    // Guards against the test silently passing because the glob broke.
    expect(sourceFiles.length).toBeGreaterThanOrEqual(6);
    expect(sourceFiles).toContain("index.ts");
  });

  it.each(sourceFiles)("%s imports nothing outside the engine", (name) => {
    const code = codeOnly(read(name));
    const imports = [...code.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    for (const specifier of imports) {
      // Relative imports only, and only within this directory.
      expect(specifier, `${name} imports "${specifier}"`).toMatch(/^\.\/[\w-]+$/);
    }
  });

  it.each(sourceFiles)("%s does not touch PocketBase", (name) => {
    const code = codeOnly(read(name));
    expect(code).not.toMatch(/pocketbase/i);
    expect(code).not.toMatch(/getSuperuserClient|createUserClient|createPbClient/);
  });

  it.each(sourceFiles)("%s does no I/O", (name) => {
    const code = codeOnly(read(name));
    for (const forbidden of ["fetch(", "node:fs", "node:net", "node:http", "process.env"]) {
      expect(code, `${name} contains ${forbidden}`).not.toContain(forbidden);
    }
  });

  it.each(sourceFiles)("%s reaches for no implicit clock", (name) => {
    // Time comes in as an argument. A `Date.now()` buried in the engine is how
    // a pick deadline starts depending on which process asked.
    const code = codeOnly(read(name));
    expect(code).not.toContain("Date.now(");
    expect(code).not.toMatch(/new Date\(\s*\)/);
    expect(code).not.toContain("performance.now(");
  });

  it.each(sourceFiles)("%s does not import from the rest of the app", (name) => {
    const code = codeOnly(read(name));
    // The `@/` alias is how everything else in src/ imports. The engine may not.
    expect(code).not.toMatch(/from\s+["']@\//);
    expect(code).not.toContain("server-only");
  });

  it.each(sourceFiles)("%s uses no randomness, so a draft replays identically", (name) => {
    // Autodraft and pick legality are deterministic, forever (CLAUDE.md). The
    // roll's seeded shuffle lives in the action layer, not here.
    const code = codeOnly(read(name));
    expect(code).not.toContain("Math.random");
    expect(code).not.toContain("crypto.randomUUID");
  });
});
