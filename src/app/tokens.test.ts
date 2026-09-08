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

/**
 * The patch's field is read out of the component, not out of the stylesheet.
 *
 * Everything else in this file is a number; this one is a *shape*, and the
 * shape is the fix. A `bg-pos-<hue>` at 10% alpha is a wash, so whatever row
 * the patch sits in decides the letter's contrast — on the live blush of an
 * armed pool row that composited to 4.10–4.18:1, under the floor, on the one
 * element that exists to be the colour-blind fallback for position. An opaque
 * `color-mix(…, stock)` field cannot do that, and no arithmetic over
 * `globals.css` can tell the two apart, because the difference is in
 * `board.tsx`. So this reads the source, the way `purity.test.ts` does.
 */
describe("a position patch brings its own field", () => {
  const board = readFileSync(
    resolve(process.cwd(), "src/components/board.tsx"),
    "utf8",
  );
  const patchMap = /const PATCH: Record<[^>]+> = \{([\s\S]*?)\};/.exec(board);

  it("the PATCH map is where this test thinks it is", () => {
    expect(patchMap, "PATCH map not found in board.tsx").not.toBeNull();
  });

  for (const position of ["g", "f", "c"] as const) {
    it(`pos-${position}'s field is opaque, not an alpha wash`, () => {
      const line = patchMap![1]!
        .split("\n")
        .find((row) => row.includes(`text-pos-${position}`));
      expect(line, `no pos-${position} row in PATCH`).toBeDefined();
      expect(
        line,
        `bg-pos-${position}/N is an alpha wash — the row behind the patch then ` +
          `decides the letter's contrast, which is 4.1:1 on the live blush`,
      ).not.toMatch(new RegExp(`bg-pos-${position}/`));
      expect(line).toContain(
        `color-mix(in_oklab,var(--color-pos-${position})_10%,var(--color-stock))`,
      );
    });
  }
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

  it("the primary action's border clears 3:1 on stock AND on the live blush", () => {
    // `border-live/60` measured **2.60:1** on stock — the primary action of six
    // surfaces, the login page's only button among them. Found by 3.4a's
    // critique measuring in a browser, three slices after the pass that fixed
    // `ink/35` in the same object and never looked at this one.
    //
    // Both grounds are asserted because a `tone="live"` button can sit on the
    // live blush (the room's sticky band is `slot-live`), and the blush is the
    // harsher of the two: `/70` clears stock at 3.07 and fails the blush at
    // 2.81. `/80` clears both.
    for (const [ground, background] of [
      ["stock", rgbOf("stock")],
      ["the live blush", rgbOf("live-sunk")],
    ] as const) {
      const ratio = contrastOn2(
        wash("live", 0.8, ground === "stock" ? "stock" : "live-sunk"),
        background,
      );
      expect(
        round(ratio),
        `live/80 on ${ground} was ${round(ratio)}:1`,
      ).toBeGreaterThanOrEqual(3);
    }
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

describe("the app's own voice in chat", () => {
  // 3.5 draws a system message in `--color-rail`, which already existed as the
  // rail's own colour and had no competing job. Marker was not available: it
  // has exactly two (who is on the clock, what just landed) and DESIGN.md calls
  // a third a regression.
  //
  // The token was previously asserted only as a **boundary** at 3:1. As body
  // text it has to clear the text floor, which is a stricter question nobody
  // had asked of it.
  it("--color-rail clears 4.5:1 on stock as text", () => {
    const ratio = contrast("rail", "stock");
    expect(
      round(ratio),
      `rail as text was ${round(ratio)}:1`,
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("is distinguishable from the ink a member's own message is set in", () => {
    // Colour is never the only carrier here — a system line also has no team
    // name — but if the two colours were near-identical the colour-coding would
    // be a lie rather than a redundancy.
    const rail = contrast("rail", "stock");
    const ink = contrast("ink", "stock");
    expect(Math.abs(rail - ink)).toBeGreaterThan(1);
  });
});

describe("a control's border on the live blush, not only on stock", () => {
  // 3.7's critique measured `Cancel` in the on-the-clock band at **3.03:1** —
  // clearing the 3:1 boundary floor by 0.03 — because `ink/50` loses contrast
  // on the blush relative to the 3.10:1 it gets on stock. And this file
  // asserted `ink/50` **on stock only**, so the near-miss was unasserted.
  //
  // Exactly the shape of the miss 3.4a's critique caught: that pass fixed
  // `border-ink/35` to `/50` and never measured `border-live/60` sitting beside
  // it in the same object, which was 2.60:1. Measuring the thing next to the
  // thing is not measuring the thing — so every button border the band renders
  // is asserted on the ground it is actually drawn on.
  it("ink/50 clears 3:1 on the live blush, where the band's buttons sit", () => {
    const ratio = contrastOn2(wash("ink", 0.5, "live-sunk"), rgbOf("live-sunk"));
    expect(
      round(ratio),
      `ink/50 on the blush was ${round(ratio)}:1`,
    ).toBeGreaterThanOrEqual(3);
  });

  it("the marker border clears 3:1 on the blush it encloses", () => {
    // `tone="liveOnField"` — the tone DESIGN.md invented because 3.3 shipped
    // marker *text* on this blush at 4.15:1. The border is the part that has to
    // carry the boundary.
    const ratio = contrastOn2(rgbOf("live"), rgbOf("live-sunk"));
    expect(
      round(ratio),
      `live on the blush was ${round(ratio)}:1`,
    ).toBeGreaterThanOrEqual(3);
  });
});

describe("a row in your hand says so in its own material", () => {
  // 3.4b's `slot-transit`. The whole state language depends on this rule being
  // both visible and distinguishable from the four beside it, because a held
  // row is the one thing on the surface that behaves differently from every
  // other row — dragging it moves it, and tapping another row moves it there.

  it("--color-ink clears 3:1 on stock as a boundary", () => {
    const ratio = contrast("ink", "stock");
    expect(round(ratio), `ink was ${round(ratio)}:1`).toBeGreaterThanOrEqual(3);
  });

  it("is 2px dashed ink — unsettled, and not the marker", () => {
    // Dashed because dashed is this system's word for unsettled, the same
    // argument `slot-standing` makes. Ink rather than marker because the marker
    // means one thing only, and a sheet is edited while a draft runs on the
    // same phone.
    const transit = css.match(/@utility slot-transit \{([^}]*)\}/)?.[1] ?? "";
    expect(transit).toMatch(/border-top:\s*2px dashed var\(--color-ink\)/);
  });

  it("is not confusable with the four rules it sits beside", () => {
    // Every slot rule must be a distinct (weight, style, colour) triple, or two
    // states look identical on a row and the material stops carrying anything.
    const rule = (name: string) =>
      (css.match(new RegExp(`@utility ${name} \\{([^}]*)\\}`))?.[1] ?? "")
        .replace(/\s+/g, " ")
        .trim();
    const transit = rule("slot-transit");
    expect(transit).not.toBe("");
    for (const other of [
      "slot-waiting",
      "slot-filled",
      "slot-live",
      "slot-standing",
      "slot-correction",
    ]) {
      expect(rule(other), `${other} matched slot-transit`).not.toBe(transit);
    }
  });

  it("is reached as a state, never composed onto another slot rule", () => {
    // The first version drew a held row as `slot-filled slot-transit` and
    // trusted source order to settle which `border-top` won. Tailwind v4 emits
    // `@utility` blocks alphabetically and the dev server splits them across
    // chunks, so the browser composited **1px dashed** — the width from one
    // rule, the style from the other, a material in neither. Two rules for one
    // border was the bug. This asserts the fix is still the fix: `Slot` maps a
    // state to exactly one rule, and `transit` is one of them.
    const board = readFileSync(
      resolve(process.cwd(), "src/components/board.tsx"),
      "utf8",
    );
    expect(board).toMatch(/transit:\s*"slot-transit"/);
    expect(board).toMatch(/type SlotState =[^;]*"transit"/);
    // And the held row reaches it as a state rather than stacking it onto one.
    const list = readFileSync(
      resolve(process.cwd(), "src/app/leagues/[id]/sheet/sheet-list.tsx"),
      "utf8",
    );
    expect(list).toMatch(/\?\s*"transit"/);

    // While the row is *travelling*, the material rides on the content and the
    // place it left reads as an empty one. Measured before this: the `<li>`
    // held the 2px dashed rule at y=393 while its content was at y=635 — 242px
    // apart, so the rule marked a hole and the row in somebody's hand had no
    // material at all. The content is a plain button rather than a `Slot`, so
    // carrying the class here composes with nothing and is the right seam.
    expect(list).toMatch(/"slot-transit bg-stock"/);
    expect(list).toMatch(/dragging\s*\n?\s*\?\s*"waiting"/);
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
