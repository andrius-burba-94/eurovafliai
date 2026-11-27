import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The package is shared by the web server, the worker and the phone, so it may
 * depend on nothing any one of them lacks. `engine/purity.test.ts` holds the
 * engine to a stricter rule still; this one holds every other file to the
 * minimum: relative imports and zod, and no I/O.
 */

const ROOT = dirname(fileURLToPath(import.meta.url));

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

const files = sources(ROOT).map((path) => relative(ROOT, path)).sort();

const codeOnly = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the core package is pure", () => {
  it("has the modules it should", () => {
    expect(files).toContain("engine/index.ts");
    expect(files).toContain("nav/items.ts");
  });

  it.each(files)("%s imports only its own files and zod", (name) => {
    const code = codeOnly(readFileSync(join(ROOT, name), "utf8"));
    for (const [, specifier] of code.matchAll(/from\s+["']([^"']+)["']/g)) {
      expect(specifier, `${name} imports "${specifier}"`).toMatch(/^(\.{1,2}\/[\w./-]+|zod)$/);
    }
  });

  it.each(files)("%s does no I/O and reads no environment", (name) => {
    const code = codeOnly(readFileSync(join(ROOT, name), "utf8"));
    for (const forbidden of ["fetch(", "process.env", "pocketbase", "localStorage", "document."]) {
      expect(code, `${name} uses ${forbidden}`).not.toContain(forbidden);
    }
  });
});
