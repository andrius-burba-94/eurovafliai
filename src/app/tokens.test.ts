import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The design tokens have to clear WCAG AA, and that has to be checked rather
 * than eyeballed.
 *
 * The first Phase 1.4 review caught two contrast failures a screenshot hides:
 * `--color-rule` at 1.36:1, which made the board's whole dashed-versus-solid
 * state language nearly invisible, and form labels at 2.96:1 — introduced by a
 * "fix" that made them fainter to differentiate them from a heading. Both were
 * choices that looked fine on this monitor. So the floor lives here, parsed
 * from globals.css so the test cannot drift from the values it is guarding.
 */

const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

/** Read an `--color-*: oklch(L C H)` declaration out of the stylesheet. */
function token(name: string): [number, number, number] {
  const match = css.match(
    new RegExp(
      `--color-${name}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\)`,
    ),
  );
  if (!match) throw new Error(`token --color-${name} not found in globals.css`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** OKLCH → linear sRGB, per the Oklab spec. */
function oklchToLinearRgb([l, c, h]: [number, number, number]) {
  const hRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  const L = l_ ** 3;
  const M = m_ ** 3;
  const S = s_ ** 3;

  return [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
}

/** WCAG relative luminance. Linear sRGB needs no further linearisation. */
function luminance(name: string): number {
  const [r, g, b] = oklchToLinearRgb(token(name)).map((v) =>
    Math.min(Math.max(v, 0), 1),
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const round = (n: number) => Math.round(n * 100) / 100;

describe("text on card stock clears AA", () => {
  // 4.5:1 is the floor for body text and for anything that tells a user what to
  // do. Every one of these renders as words on the stock ground.
  const bodyText = ["ink", "ink-soft", "ink-faint", "live"];

  for (const name of bodyText) {
    it(`--color-${name} is at least 4.5:1 on stock`, () => {
      const ratio = contrast(name, "stock");
      expect(
        round(ratio),
        `${name} was ${round(ratio)}:1`,
      ).toBeGreaterThanOrEqual(4.5);
    });
  }

  // The position patches carry the G/F/C letters. Colour never carries position
  // alone (PRODUCT.md), but the letter still has to be readable.
  for (const name of ["pos-g", "pos-f", "pos-c"]) {
    it(`--color-${name} is at least 4.5:1 on stock`, () => {
      const ratio = contrast(name, "stock");
      expect(
        round(ratio),
        `${name} was ${round(ratio)}:1`,
      ).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe("the board's ruling is perceivable", () => {
  // 3:1 is the AA floor for a meaningful non-text boundary. The rules ARE the
  // state language here: dashed means waiting, solid means filled, and if the
  // rule cannot be seen the surface has no states.
  it("--color-rule clears 3:1 on stock", () => {
    const ratio = contrast("rule", "stock");
    expect(round(ratio), `rule was ${round(ratio)}:1`).toBeGreaterThanOrEqual(
      3,
    );
  });

  it("--color-rule-strong clears 3:1 on stock", () => {
    // It was only ever asserted relative to `rule`, which would let both slide
    // together. It is a boundary in its own right.
    const ratio = contrast("rule-strong", "stock");
    expect(
      round(ratio),
      `rule-strong was ${round(ratio)}:1`,
    ).toBeGreaterThanOrEqual(3);
  });

  it("--color-rule-strong is heavier than --color-rule", () => {
    // A board has a hierarchy: a frame and a filled slot read heavier than an
    // empty one. Same hue family, deliberately different weight.
    expect(contrast("rule-strong", "stock")).toBeGreaterThan(
      contrast("rule", "stock") * 1.3,
    );
  });

  it("--color-rail clears 3:1 on stock", () => {
    const ratio = contrast("rail", "stock");
    expect(round(ratio), `rail was ${round(ratio)}:1`).toBeGreaterThanOrEqual(
      3,
    );
  });
});

describe("the live slot is visibly live", () => {
  // There is deliberately no ratio assertion on `--color-live-sunk`. It is a
  // background against a background, so WCAG has no threshold for it, and the
  // review agreed: the boundary is what must carry the state. The two tests
  // below are the ones that do the work — the 2px marker rule, and ink staying
  // readable on the tint.

  it("the live rule is heavier than every other rule", () => {
    // The state is carried by weight as well as colour, so a 1px marker rule
    // would be a regression even at full saturation.
    const live = css.match(/@utility slot-live \{([^}]*)\}/)?.[1] ?? "";
    const filled = css.match(/@utility slot-filled \{([^}]*)\}/)?.[1] ?? "";
    expect(live).toMatch(/border-top:\s*2px solid var\(--color-live\)/);
    expect(filled).toMatch(/border-top:\s*1px solid/);
  });

  it("ink stays readable on the live field", () => {
    const ratio = contrast("ink", "live-sunk");
    expect(
      round(ratio),
      `ink on live-sunk was ${round(ratio)}:1`,
    ).toBeGreaterThanOrEqual(4.5);
  });
});
