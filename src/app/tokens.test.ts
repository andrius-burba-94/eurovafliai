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

/** Clamped linear sRGB for a token, ready to composite. */
const rgbOf = (name: string): number[] =>
  oklchToLinearRgb(token(name)).map((v) => Math.min(Math.max(v, 0), 1));

const luminanceOf = ([r, g, b]: number[]): number =>
  0.2126 * r! + 0.7152 * g! + 0.0722 * b!;

/** Linear sRGB → gamma-encoded sRGB, and back. */
const encode = (v: number): number =>
  v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
const decode = (v: number): number =>
  v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);

/**
 * A token at partial opacity, composited over an opaque one.
 *
 * This is what the board's position washes actually are — `bg-pos-g/10` is a
 * tenth of the guard hue over card stock — and until 3.1 this file had no way
 * to say so: every assertion compared one token against another, so an alpha
 * background was outside what it could express. That is not a small gap. The
 * board renders its numbers, its G/F/C letter and its column rules on top of
 * those washes, 156 slots at a time, and the wash costs roughly a tenth of
 * every ratio above it. The first version of the board put `ink-faint` numbers
 * (4.42:1) and same-hue letters on them, and this file was 13/13 green the
 * whole time.
 *
 * ## It composites in gamma-encoded sRGB, and the first version did not
 *
 * A browser blends translucent colour in the gamma-encoded space its pixels are
 * stored in, not in linear light. 3.1 wrote this helper blending in linear
 * light, which is more "physically correct" and is **not** what the screen
 * does — and it is wrong in the worst available direction: it reads about 0.2
 * too *high* on dark text over a light wash, so it lets a real failure pass.
 * It scored `pos-g` on its own wash at 4.50 and asserted ≥4.5; the browser
 * renders 4.30. Encode, blend, decode.
 */
const wash = (name: string, alpha: number, over: string): number[] => {
  const fg = rgbOf(name).map(encode);
  const bg = rgbOf(over).map(encode);
  return fg.map((v, i) => decode(v * alpha + bg[i]! * (1 - alpha)));
};

/** Contrast between two already-composited colours. */
function contrastOn2(a: number[], b: number[]): number {
  const la = luminanceOf(a);
  const lb = luminanceOf(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Contrast of a token against an already-composited background. */
function contrastOn(name: string, background: number[]): number {
  const la = luminanceOf(rgbOf(name));
  const lb = luminanceOf(background);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

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

describe("the draft board's slots clear AA on their position wash", () => {
  // Slice 3.1. A filled slot is tinted by its position — `bg-pos-*/10` over
  // stock — and everything the slot says is written on that tint. These are the
  // pairings the board actually renders, so they are the ones asserted.
  const POSITIONS = ["pos-g", "pos-f", "pos-c"] as const;

  for (const position of POSITIONS) {
    const field = () => wash(position, 0.1, "stock");

    it(`a surname on a ${position} slot clears 4.5:1`, () => {
      const ratio = contrastOn("ink", field());
      expect(round(ratio), `ink was ${round(ratio)}:1`).toBeGreaterThanOrEqual(
        4.5,
      );
    });

    it(`the pick number and the G/F/C letter on a ${position} slot clear 4.5:1`, () => {
      // Both are `ink-soft`, and the letter is the colour-blind fallback for
      // position — so this is an accessibility floor twice over. Set in the
      // position's own hue it measured 4.5:1 at best and 4.2:1 at worst, which
      // is why the hue moved to the field and the text went to ink.
      const ratio = contrastOn("ink-soft", field());
      expect(
        round(ratio),
        `ink-soft was ${round(ratio)}:1`,
      ).toBeGreaterThanOrEqual(4.5);
    });

    it(`the column rule between two ${position} slots clears 3:1`, () => {
      // Which column a pick is in is meaning, so its boundary has the 3:1
      // floor. `rule` over a wash is 2.90:1 — under it — which is why the
      // board's separators are `rule-strong`.
      const ratio = contrastOn("rule-strong", field());
      expect(
        round(ratio),
        `rule-strong was ${round(ratio)}:1`,
      ).toBeGreaterThanOrEqual(3);
    });
  }

  it("the slot on the clock says its pick number in ink, not in marker", () => {
    // DESIGN.md forbids marker text on the live tint by name, and 3.1 shipped
    // exactly that on the one slot that matters most — where the pick number is
    // the slot's only text. Asserted here so it cannot come back.
    const onBlush = rgbOf("live-sunk");
    expect(round(contrastOn("live", onBlush))).toBeLessThan(4.5);
    expect(
      round(contrastOn("ink-soft", onBlush)),
      `ink-soft on live-sunk was ${round(contrastOn("ink-soft", onBlush))}:1`,
    ).toBeGreaterThanOrEqual(4.5);
  });
});

describe("a position patch carries its own letter", () => {
  // Open question 7 left these eyeballed for two slices, and measured they were
  // failing: the patch sets its letter in the position's own colour on a 10%
  // wash of the same hue, which is the tightest pairing in the app. The letter
  // is the colour-blind fallback for position (PRODUCT.md), so this is an
  // accessibility floor twice over, and 3.3's pool renders about thirty of
  // them per screen.
  for (const position of ["pos-g", "pos-f", "pos-c"] as const) {
    it(`--color-${position} clears 4.5:1 on its own 10% wash`, () => {
      const ratio = contrastOn(position, wash(position, 0.1, "stock"));
      expect(
        round(ratio),
        `${position} on its own wash was ${round(ratio)}:1`,
      ).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe("the pool's armed row", () => {
  // 3.3 struck the armed row in marker — correctly, it is the one act — and put
  // the button's own marker-red label on the blush that strike brings with it.
  // That is 4.15:1 and DESIGN.md forbids it by name, in two places. The test
  // below asserted the failure existed and stayed green while the pool rendered
  // it, which is the same shape of blind spot as the washes one slice earlier:
  // a pairing nobody thought to assert.
  const blush = () => rgbOf("live-sunk");

  it("labels its action in ink, because marker on the blush is 4.15:1", () => {
    expect(round(contrastOn("live", blush()))).toBeLessThan(4.5);
    const ratio = contrastOn("ink", blush());
    expect(
      round(ratio),
      `ink on live-sunk was ${round(ratio)}:1`,
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("bounds that action in full-strength marker, which clears the 3:1 boundary floor", () => {
    // `border-live/60` over the blush measures 2.40:1 — under the floor for a
    // boundary that means something, and the button *is* its border here: no
    // fill, no radius, and now no coloured label either.
    const ratio = contrastOn("live", blush());
    expect(
      round(ratio),
      `live border on live-sunk was ${round(ratio)}:1`,
    ).toBeGreaterThanOrEqual(3);
  });

  it("keeps a muted row's own text readable when that row is the armed one", () => {
    // A row can be both muted and armed, so `ink-faint` lands on the blush at
    // 4.37:1. The pool therefore does not fade an armed row.
    expect(round(contrastOn("ink-faint", blush()))).toBeLessThan(4.5);
  });
});

describe("a control's own border is a boundary that means something", () => {
  // The last thing open question 7 left eyeballed. On a button the border *is*
  // the control — no fill, no radius, and in the pool no coloured label — and a
  // patch's border is the only thing making a patch a patch rather than a
  // coloured letter. Both were under the 3:1 floor and both were unasserted.
  it("a button's resting border clears 3:1 on stock", () => {
    // `ink/35` measured 2.10:1, and hover at 80% was the only state that
    // cleared the floor — which a phone never reaches.
    expect(round(contrastOn("ink", rgbOf("stock")))).toBeGreaterThan(3);
    const ratio = contrastOn2(wash("ink", 0.5, "stock"), rgbOf("stock"));
    expect(
      round(ratio),
      `ink/50 on stock was ${round(ratio)}:1`,
    ).toBeGreaterThanOrEqual(3);
  });

  it("an input's ruled line clears 3:1 on stock", () => {
    // DESIGN.md: the ruled line *is* the input — no box, no fill, no radius —
    // so it is the whole affordance and takes the boundary floor. `ink/30` was
    // 1.87:1, the lowest boundary in the app, and unasserted.
    const ratio = contrastOn2(wash("ink", 0.5, "stock"), rgbOf("stock"));
    expect(
      round(ratio),
      `ink/50 on stock was ${round(ratio)}:1`,
    ).toBeGreaterThanOrEqual(3);
  });

  for (const position of ["pos-g", "pos-f", "pos-c"] as const) {
    it(`a ${position} patch's border clears 3:1 against the wash it encloses`, () => {
      // The border separates the wash inside from the stock outside, so the
      // wash side is the binding comparison. `/55` failed both.
      const ratio = contrastOn2(
        wash(position, 0.8, "stock"),
        wash(position, 0.1, "stock"),
      );
      expect(
        round(ratio),
        `${position}/80 against its own wash was ${round(ratio)}:1`,
      ).toBeGreaterThanOrEqual(3);
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
