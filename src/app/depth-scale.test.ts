import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The depth scale, enforced rather than described.
 *
 * This source guard exists
 * because of how the failure looks: **Tailwind emits an unknown utility as
 * nothing at all.** A stray `rounded-lg` on a button renders a rounded button;
 * a hand-rolled `card-block-2` renders a plain `<li>` with no border, no fill
 * and no corner — and both look plausible in a screenshot, which is exactly the
 * position `--color-rule` was in at 1.36:1 before `tokens.test.ts` existed.
 *
 * `tokens.test.ts` can measure a value. It cannot see a class string. So this
 * reads the source, the way `purity.test.ts` and the `PATCH` assertions do.
 */

const SRC = resolve(process.cwd(), "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    // Test files are excluded: this file's own assertions quote the very class
    // names it forbids, and a guard that fails on its own error message is a
    // guard nobody keeps.
    if (/\.test\.tsx?$/.test(entry)) return [];
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

const files = sourceFiles(SRC).map((path) => ({
  path: path.slice(process.cwd().length + 1),
  text: readFileSync(path, "utf8"),
}));

describe("the corner scale", () => {
  it("finds source files to check", () => {
    // If the walk breaks, every assertion below passes vacuously.
    expect(files.length).toBeGreaterThan(50);
  });

  it("uses only the named corners", () => {
    // ADR-0011: small corners for controls, a card radius for panels, full
    // circles for marks and pills. An arbitrary radius is how two panels end
    // up almost-but-not-quite matching.
    const CORNER = /\brounded-(?!(?:(?:[trbl]{1,2}|[se]{1,2})-)?(?:block|card|md|lg|xl|2xl|full)\b)[a-z0-9[]/;
    const offenders = files.filter(({ text }) => CORNER.test(text));
    expect(offenders.map((f) => f.path), "use the named corner scale (DESIGN.md, Shapes)").toEqual([]);
  });
});

describe("atmosphere lives in named utilities, never at a call site", () => {
  // ADR-0011 allows a team-colour field, the waffle lattice and the hardwood,
  // each as one named utility in globals.css. What stays refused in component
  // code is the ad hoc version: a one-off gradient, a glow, a glass blur.
  const FORBIDDEN: ReadonlyArray<readonly [string, RegExp]> = [
    ["a shadow", /\bshadow-(?!none\b)[a-z0-9[]/],
    ["a gradient", /\bbg-(gradient|linear|radial|conic)-/],
    ["a blur", /\b(backdrop-)?blur-/],
    ["a drop shadow", /\bdrop-shadow-/],
  ];

  for (const [what, pattern] of FORBIDDEN) {
    it(`no component reaches for ${what}`, () => {
      const offenders = files.filter(({ text }) => pattern.test(text));
      expect(offenders.map((f) => f.path)).toEqual([]);
    });
  }
});

describe("there are exactly two levels, and one component owns each", () => {
  it("the card-block materials are applied only by board.tsx", () => {
    // The same argument as the `PATCH` assertions in `tokens.test.ts`: a
    // material spelled out at a call site is a material that will drift, and
    // here it would also be the way a block ends up inside a block. One
    // component applies the class, so "is this nested?" is a question about one
    // file rather than about forty.
    const offenders = files.filter(
      ({ path, text }) =>
        path !== "src/components/board.tsx" && /\bcard-block(-live)?\b/.test(text),
    );
    expect(
      offenders.map((f) => f.path),
      "reach for the CardBlock component rather than its class",
    ).toEqual([]);
  });

  it("the framed Bank material is applied only by board.tsx", () => {
    const offenders = files.filter(
      ({ path, text }) => path !== "src/components/board.tsx" && /\bbank-framed\b/.test(text),
    );
    expect(offenders.map((f) => f.path)).toEqual([]);
  });

  it("a card block cannot render another card block", () => {
    // Static, and narrow on purpose: it asserts that `CardBlock`'s own body
    // does not render a `CardBlock`. A caller nesting two across component
    // boundaries is still possible and is left to review — but the recursive
    // case, which is the one that turns a roster into a card stack, is closed.
    const board = files.find((f) => f.path === "src/components/board.tsx")!;
    const body = /export function CardBlock\(\{[\s\S]*?\n\}\n/.exec(board.text);
    expect(body, "CardBlock not found in board.tsx").not.toBeNull();
    expect(body![0]).not.toMatch(/<CardBlock/);
  });
});
