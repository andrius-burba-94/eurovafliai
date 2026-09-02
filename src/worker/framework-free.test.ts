import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The worker's import closure, enforced rather than asserted.
 *
 * The worker is plain Node under tsx. Nothing in what it imports — however
 * deep — may reach for the framework: `next/*`, `server-only` and `react`
 * either throw outside a request graph or drag one in. `pipeline.ts` says so in
 * a comment, and `src/lib/engine/purity.test.ts` exists because a comment has
 * never stopped anybody.
 *
 * The breach is silent, which is the whole point of testing it. Adding
 * `import { revalidatePath } from "next/cache"` to `pipeline.ts` keeps
 * `npm run test` green — the specifier resolves fine under Node, and only
 * *calling* it outside a request throws — keeps `npm run build` green, and
 * fails for the first time when PM2 starts the worker on the VPS. Where the
 * loss is invisible until a clock runs out.
 *
 * So this walks the real graph from `index.ts`, following every relative and
 * `@/` import, and fails on a banned package anywhere in it.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "..");
const ENTRY = join(HERE, "index.ts");

const BANNED = [
  { pattern: /^next(\/|$)/, why: "Next.js is not available in the worker process" },
  { pattern: /^server-only$/, why: "`server-only` throws outside a React Server Component graph" },
  { pattern: /^react(-dom)?(\/|$)/, why: "React's cache/context does not exist here" },
];

/** Strip comments, so prose about a ban does not trip the ban. */
const codeOnly = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function specifiersIn(source: string): string[] {
  const code = codeOnly(source);
  return [
    ...[...code.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]),
    ...[...code.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]),
    // `import "server-only";` — no `from`, and the single most important form
    // to catch, since that is exactly how the two modules next door declare
    // themselves server-side. Missed on the first draft of this test, which is
    // why the test was tried against a deliberate breach before being trusted.
    ...[...code.matchAll(/^\s*import\s+["']([^"']+)["']/gm)].map((m) => m[1]),
  ];
}

/** Where a specifier points, or null when it is a bare package. */
function resolveLocal(fromFile: string, specifier: string): string | null {
  const base = specifier.startsWith("@/")
    ? join(SRC, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(fromFile), specifier)
      : null;
  if (base === null) return null;

  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`cannot resolve "${specifier}" from ${relative(SRC, fromFile)}`);
}

/** Every file the worker pulls in, transitively. */
function closure(): { files: string[]; packages: Map<string, string> } {
  const files: string[] = [];
  const packages = new Map<string, string>();
  const queue = [ENTRY];

  while (queue.length > 0) {
    const file = queue.pop()!;
    if (files.includes(file)) continue;
    files.push(file);

    for (const specifier of specifiersIn(readFileSync(file, "utf8"))) {
      const local = resolveLocal(file, specifier);
      if (local) queue.push(local);
      else if (!packages.has(specifier)) packages.set(specifier, relative(SRC, file));
    }
  }

  return { files, packages };
}

describe("the worker is framework-free", () => {
  const { files, packages } = closure();

  it("walked a real graph", () => {
    // Guards against the whole suite passing because the walker broke: the
    // worker reaches the engine, the pipeline and the config schema at least.
    expect(files.length).toBeGreaterThanOrEqual(8);
    expect(files.map((file) => relative(SRC, file))).toContain(
      "lib/drafts/pipeline.ts",
    );
    expect(packages.size).toBeGreaterThan(0);
  });

  it.each([...BANNED])("imports nothing from $pattern — $why", ({ pattern }) => {
    for (const [specifier, importer] of packages) {
      expect(specifier, `${importer} imports "${specifier}"`).not.toMatch(pattern);
    }
  });

  it("imports no test-only or component file", () => {
    for (const file of files) {
      expect(relative(SRC, file)).not.toMatch(/\.test\.ts$|\.tsx$/);
    }
  });
});
