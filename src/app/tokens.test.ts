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
 *
 * ## One ground again, since Phase 10
 *
 * 9.5 parameterized this file by ground and asked every ratio twice, because
 * the day and night boards were both live. ADR-0006 replaced both with the
 * midnight board, so the loop is gone and every ratio is asked once, of the
 * palette that actually ships. What is NOT gone is the reason the loop existed:
 * see `no second palette ships unmeasured` at the bottom, which is what stops a
 * future theme overriding `--color-*` somewhere this file cannot see.
 *
 * Three values in that palette were solved against a floor rather than picked,
 * and each has a test below that would fail if somebody "tidied" it:
 * `rule` against the PANEL (not the ground), `live-sunk` against faint chalk,
 * and `ink-soft` against both a panel wash and the marker on the live bay.
 */

const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

/** Read an `oklch(L C H)` token declaration. */
function token(name: string): [number, number, number] {
  const match = css.match(
    new RegExp(`--color-${name}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\)`),
  );
  if (!match) throw new Error(`token --color-${name} not found in globals.css`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

const round = (n: number) => Math.round(n * 100) / 100;

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
 * tenth of the guard hue over the ground — and until 3.1 this file had no way
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
function ratio(la: number, lb: number): number {
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Clamped linear sRGB for a token, ready to composite. */
const rgbOf = (name: string): number[] =>
  oklchToLinearRgb(token(name)).map((v) => Math.min(Math.max(v, 0), 1));

const contrast = (a: string, b: string): number =>
  ratio(luminanceOf(rgbOf(a)), luminanceOf(rgbOf(b)));

const wash = (name: string, alpha: number, over: string): number[] => {
  const fg = rgbOf(name).map(encode);
  const bg = rgbOf(over).map(encode);
  return fg.map((v, i) => decode(v * alpha + bg[i]! * (1 - alpha)));
};

/** Contrast between two already-composited colours. */
const contrastOn2 = (a: number[], b: number[]): number =>
  ratio(luminanceOf(a), luminanceOf(b));

/** Contrast of a token against an already-composited background. */
const contrastOn = (name: string, background: number[]): number =>
  ratio(luminanceOf(rgbOf(name)), luminanceOf(background));

describe("the two anchors are the colours the brief named", () => {
  // The ground and the accent are given rather than solved, so the only thing
  // that can go wrong with them is a conversion — and it did once: at three
  // decimal places the marker round-trips to #ff5502, which is invisible and
  // still not #FF5500. Asserted as sRGB bytes, the way a screenshot would see
  // them, because "oklch(0.6759 0.2175 38.8)" tells a reader nothing.
  const hexOf = (name: string): string =>
    "#" +
    oklchToLinearRgb(token(name))
      .map((v) =>
        Math.round(Math.min(Math.max(encode(Math.min(Math.max(v, 0), 1)), 0), 1) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("");

  it("the ground is #0b1120", () => {
    expect(hexOf("stock")).toBe("#0b1120");
  });

  it("the marker is #ff5500, which needs four decimal places", () => {
    expect(hexOf("live")).toBe("#ff5500");
  });
});

describe("text on the ground clears AA", () => {
  // 4.5:1 is the floor for body text and for anything that tells a user what to
  // do. Every one of these renders as words on the midnight ground.
  const bodyText = ["ink", "ink-soft", "ink-faint", "live"];

  for (const name of bodyText) {
    it(`--color-${name} is at least 4.5:1 on stock`, () => {
      const ratio = contrast(name, "stock");
      expect(round(ratio), `${name} was ${round(ratio)}:1`).toBeGreaterThanOrEqual(4.5);
    });
  }

  // The position colours carry the G/F/C letters. Colour never carries position
  // alone (PRODUCT.md), but the letter still has to be readable.
  for (const name of ["pos-g", "pos-f", "pos-c"]) {
    it(`--color-${name} is at least 4.5:1 on stock`, () => {
      const ratio = contrast(name, "stock");
      expect(round(ratio), `${name} was ${round(ratio)}:1`).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("chalk stays below the halation ceiling", () => {
    // The one assertion in this file with an UPPER bound, and it is deliberate.
    // Pure white on this ground is 18.8:1, and 9.5's argument against reaching
    // for it is the part of the night board that outlived the night board: a
    // ramp whose top shouts leaves the quiet inks nothing to be quiet against,
    // and full-strength white in a dark room is harder to read, not easier.
    // Without this, "improving" contrast is a one-character change.
    const ratio = contrast("ink", "stock");
    expect(round(ratio), `ink was ${round(ratio)}:1`).toBeGreaterThanOrEqual(12);
    expect(round(ratio), `ink was ${round(ratio)}:1`).toBeLessThanOrEqual(15);
  });
});

describe("text and rules on panel stock clear AA", () => {
  for (const name of ["ink", "ink-soft", "ink-faint", "rail", "live", "pos-g", "pos-f", "pos-c"]) {
    it(`--color-${name} is at least 4.5:1 on stock-panel`, () => {
      const ratio = contrast(name, "stock-panel");
      expect(round(ratio), `${name} was ${round(ratio)}:1`).toBeGreaterThanOrEqual(4.5);
    });
  }

  for (const name of ["rule", "rule-strong"]) {
    it(`--color-${name} is at least 3:1 on stock-panel`, () => {
      // This is the BINDING surface for the ruling, not the ground — see the
      // describe below. Phase 10 inverted which one is harder.
      const ratio = contrast(name, "stock-panel");
      expect(round(ratio), `${name} was ${round(ratio)}:1`).toBeGreaterThanOrEqual(3);
    });
  }

  it("a panel is lighter than the ground, not deeper", () => {
    // Depth on a dark ground is lightness, so "deeper stock" is not available
    // here. The token is named `stock-panel` rather than `stock-deep` for
    // exactly this reason, and the direction of the step is what makes the
    // panel the binding surface for `rule` above. Reverse it and two of the
    // assertions in this file start measuring the wrong thing while passing.
    expect(token("stock-panel")[0]).toBeGreaterThan(token("stock")[0]);
  });
});

describe("the draft board's slots clear AA on their position wash", () => {
  // Slice 3.1. A filled slot is tinted by its position — `bg-pos-*/10` over
  // the ground — and everything the slot says is written on that tint. These
  // are the pairings the board actually renders, so they are the ones asserted.
  const POSITIONS = ["pos-g", "pos-f", "pos-c"] as const;

  for (const position of POSITIONS) {
    const field = () => wash(position, 0.1, "stock");

    it(`a surname on a ${position} slot clears 4.5:1`, () => {
      const ratio = contrastOn("ink", field());
      expect(round(ratio), `ink was ${round(ratio)}:1`).toBeGreaterThanOrEqual(4.5);
    });

    it(`the pick number and the G/F/C letter on a ${position} slot clear 4.5:1`, () => {
      // Both are `ink-soft`, and the letter is the colour-blind fallback for
      // position — so this is an accessibility floor twice over, and since
      // Phase 10 made the hues vibrant it is the floor doing the actual work.
      const ratio = contrastOn("ink-soft", field());
      expect(round(ratio), `ink-soft was ${round(ratio)}:1`).toBeGreaterThanOrEqual(4.5);
    });

    it(`the column rule between two ${position} slots clears 3:1`, () => {
      // Which column a pick is in is meaning, so its boundary has the 3:1
      // floor. The board's separators are `rule-strong` for this reason.
      const ratio = contrastOn("rule-strong", field());
      expect(round(ratio), `rule-strong was ${round(ratio)}:1`).toBeGreaterThanOrEqual(3);
    });
  }

  it("the slot on the clock says its pick number in chalk, not in marker", () => {
    // DESIGN.md forbids marker text on the live tint by name, and 3.1 shipped
    // exactly that on the one slot that matters most. The marker clears the
    // floor on the bay; chalk remains the deliberately stronger pair, because
    // the marker's two jobs are semantic rather than a contrast workaround.
    const onBay = rgbOf("live-sunk");
    expect(round(contrastOn("live", onBay))).toBeGreaterThanOrEqual(4.5);
    expect(
      round(contrastOn("ink-soft", onBay)),
      `ink-soft on live-sunk was ${round(contrastOn("ink-soft", onBay))}:1`,
    ).toBeGreaterThanOrEqual(4.5);
    expect(contrastOn("ink-soft", onBay)).toBeGreaterThan(contrastOn("live", onBay));
  });
});

describe("position washes stay legible on panel stock", () => {
  for (const position of ["pos-g", "pos-f", "pos-c"] as const) {
    const field = () => wash(position, 0.1, "stock-panel");

    it(`chalk and metadata clear 4.5:1 on a ${position} panel wash`, () => {
      // This pairing is one of the two that FIXED `ink-soft`'s lightness. The
      // board is drawn inside a framed Bank, so a washed slot sits on panel
      // stock rather than on the ground, and 9.5's 5.79:1 soft ink measured
      // 4.3:1 here. Solved against this instead, it is 6.24:1 on the ground.
      for (const name of ["ink", "ink-soft"]) {
        const ratio = contrastOn(name, field());
        expect(round(ratio), `${name} was ${round(ratio)}:1`).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`a ${position} panel wash keeps its structural rule`, () => {
      const ratio = contrastOn("rule-strong", field());
      expect(round(ratio), `rule-strong was ${round(ratio)}:1`).toBeGreaterThanOrEqual(3);
    });
  }
});

describe("a position patch carries its own letter", () => {
  // Open question 7 left these eyeballed for two slices, and measured they were
  // failing: the patch sets its letter in the position's own colour on a 10%
  // wash of the same hue, which is the tightest pairing in the app. The letter
  // is the colour-blind fallback for position (PRODUCT.md), so this is an
  // accessibility floor twice over, and the pool renders about thirty of them
  // per screen.
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
  // the button's own marker label on the bay that strike brings with it. Chalk
  // remains the label because the marker's two jobs are semantic.
  const bay = () => rgbOf("live-sunk");

  it("keeps chalk stronger than the marker on the bay", () => {
    expect(round(contrastOn("live", bay()))).toBeGreaterThanOrEqual(4.5);
    const ratio = contrastOn("ink", bay());
    expect(round(ratio), `ink on live-sunk was ${round(ratio)}:1`).toBeGreaterThanOrEqual(4.5);
    expect(ratio).toBeGreaterThan(contrastOn("live", bay()));
  });

  it("bounds that action in full-strength marker, which clears the 3:1 boundary floor", () => {
    // The button *is* its border here: no fill, no radius, and no coloured
    // label either.
    const ratio = contrastOn("live", bay());
    expect(
      round(ratio),
      `live border on live-sunk was ${round(ratio)}:1`,
    ).toBeGreaterThanOrEqual(3);
  });

  it("keeps a muted row's own text readable when that row is the armed one", () => {
    // THIS is the assertion that fixes `live-sunk`'s lightness, and it is the
    // reason the bay is only 1.16:1 against the ground rather than the warmer,
    // better-looking field a first pass reaches for. A muted pool row is
    // written in faint chalk, and that row can be the armed one — so the bay
    // is the lightest warm field on which faint chalk still clears the floor.
    // Lift it and this is what goes under.
    const ratio = contrastOn("ink-faint", bay());
    expect(
      round(ratio),
      `ink-faint on live-sunk was ${round(ratio)}:1`,
    ).toBeGreaterThanOrEqual(4.5);
  });
});

describe("a control's own border is a boundary that means something", () => {
  // The last thing open question 7 left eyeballed. On a button the border *is*
  // the control — no fill, no radius, and in the pool no coloured label — and a
  // patch's border is the only thing making a patch a patch rather than a
  // coloured letter. Both were under the 3:1 floor and both were unasserted.
  it("a button's resting border clears 3:1 on stock", () => {
    // `ink/35` measured 2.10:1 on the old ground, and hover at 80% was the only
    // state that cleared the floor — which a phone never reaches.
    const ratio = contrastOn2(wash("ink", 0.5, "stock"), rgbOf("stock"));
    expect(round(ratio), `ink/50 on stock was ${round(ratio)}:1`).toBeGreaterThanOrEqual(3);
  });

  it("the primary action's border clears 3:1 on stock AND on the live bay", () => {
    // Both grounds are asserted because a `tone="live"` button can sit on the
    // bay (the room's sticky band is `slot-live`), and 3.4a's critique found
    // `border-live/60` at 2.60:1 three slices after the pass that fixed the
    // button beside it and never measured this one. Measuring the thing next to
    // the thing is not measuring the thing.
    for (const [ground, background] of [
      ["stock", rgbOf("stock")],
      ["the live bay", rgbOf("live-sunk")],
    ] as const) {
      const ratio = contrastOn2(
        wash("live", 0.8, ground === "stock" ? "stock" : "live-sunk"),
        background,
      );
      expect(round(ratio), `live/80 on ${ground} was ${round(ratio)}:1`).toBeGreaterThanOrEqual(3);
    }
  });

  it("an input's ruled line clears 3:1 on stock", () => {
    // DESIGN.md: the ruled line *is* the input — no box, no fill, no radius —
    // so it is the whole affordance and takes the boundary floor. `ink/30` was
    // 1.87:1, the lowest boundary in the app, and unasserted.
    const ratio = contrastOn2(wash("ink", 0.5, "stock"), rgbOf("stock"));
    expect(round(ratio), `ink/50 on stock was ${round(ratio)}:1`).toBeGreaterThanOrEqual(3);
  });

  it("a control's border clears 3:1 on panel stock too", () => {
    // Every framed Bank holds controls, so the panel is a ground a button is
    // actually drawn on — and it is lighter than the page, which costs contrast
    // for a light border rather than gaining it.
    const ratio = contrastOn2(wash("ink", 0.5, "stock-panel"), rgbOf("stock-panel"));
    expect(round(ratio), `ink/50 on a panel was ${round(ratio)}:1`).toBeGreaterThanOrEqual(3);
  });

  it("ink/50 clears 3:1 on the live bay, where the band's buttons sit", () => {
    // 3.7's critique measured `Cancel` in the on-the-clock band at 3.03:1,
    // clearing the floor by 0.03, because `ink/50` loses contrast on the bay
    // relative to the ground — and this file asserted it on the ground only.
    const ratio = contrastOn2(wash("ink", 0.5, "live-sunk"), rgbOf("live-sunk"));
    expect(round(ratio), `ink/50 on the bay was ${round(ratio)}:1`).toBeGreaterThanOrEqual(3);
  });

  for (const position of ["pos-g", "pos-f", "pos-c"] as const) {
    it(`a ${position} patch's border clears 3:1 against the wash it encloses`, () => {
      // The border separates the wash inside from the ground outside, so the
      // wash side is the binding comparison. `/55` failed both.
      const ratio = contrastOn2(wash(position, 0.8, "stock"), wash(position, 0.1, "stock"));
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
    expect(round(ratio), `rule was ${round(ratio)}:1`).toBeGreaterThanOrEqual(3);
  });

  it("--color-rule is solved against the panel, which is the harder surface", () => {
    // Phase 10 inverted this and it is the single easiest thing to get wrong
    // when editing the palette. Panel stock is LIGHTER than the ground, so a
    // mid-grey rule has less contrast on it — solved against the ground the way
    // the card-stock board was, `rule` came out at 2.46:1 on the panel, which
    // is the surface the board is actually drawn inside. So the panel is the
    // binding side, and the ground has margin to spare rather than the reverse.
    expect(contrast("rule", "stock-panel")).toBeLessThan(contrast("rule", "stock"));
    expect(round(contrast("rule", "stock-panel"))).toBeGreaterThanOrEqual(3);
  });

  it("--color-rule-strong clears 3:1 on stock", () => {
    // It was once only ever asserted relative to `rule`, which would let both
    // slide together. It is a boundary in its own right.
    const ratio = contrast("rule-strong", "stock");
    expect(round(ratio), `rule-strong was ${round(ratio)}:1`).toBeGreaterThanOrEqual(3);
  });

  it("--color-rule-strong is heavier than --color-rule", () => {
    // A board has a hierarchy: a frame and a filled slot read heavier than an
    // empty one. Same hue family, deliberately different weight.
    expect(contrast("rule-strong", "stock")).toBeGreaterThan(contrast("rule", "stock") * 1.3);
  });

  it("--color-rail clears 3:1 on stock", () => {
    const ratio = contrast("rail", "stock");
    expect(round(ratio), `rail was ${round(ratio)}:1`).toBeGreaterThanOrEqual(3);
  });

  it("--color-ink clears 3:1 on stock as a boundary", () => {
    // 3.4b's `slot-transit` draws a held row in 2px ink, so ink is a boundary
    // as well as text.
    const ratio = contrast("ink", "stock");
    expect(round(ratio), `ink was ${round(ratio)}:1`).toBeGreaterThanOrEqual(3);
  });
});

describe("the app's own voice in chat", () => {
  // 3.5 draws a system message in `--color-rail`, which already existed as the
  // rail's own colour and had no competing job. Marker was not available: it
  // has exactly two (who is on the clock, and the one act) and DESIGN.md calls
  // a third a regression.
  it("--color-rail clears 4.5:1 on stock as text", () => {
    const ratio = contrast("rail", "stock");
    expect(round(ratio), `rail as text was ${round(ratio)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  it("is distinguishable from the chalk a member's own message is set in", () => {
    // Colour is never the only carrier here — a system line also has no team
    // name — but if the two colours were near-identical the colour-coding would
    // be a lie rather than a redundancy.
    expect(Math.abs(contrast("rail", "stock") - contrast("ink", "stock"))).toBeGreaterThan(1);
  });
});

describe("the live slot is visibly live", () => {
  // There is deliberately no ratio assertion on `--color-live-sunk` itself. It
  // is a background against a background, so WCAG has no threshold for it, and
  // the boundary is what must carry the state. What is measured is everything
  // written on the tint — and, below, that the tint is there at all.
  it("chalk stays readable on the live field", () => {
    const ratio = contrast("ink", "live-sunk");
    expect(round(ratio), `ink on live-sunk was ${round(ratio)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  it("the bay is still a visible step off the ground", () => {
    // The bay's lightness is pinned from above by faint chalk, which pushes it
    // down toward the ground — so the opposite failure is now the plausible
    // one: a bay solved until it is invisible, leaving `slot-live` as a bare
    // rule and the row it marks unlocated. 1.16:1 is a field, not a ratio that
    // means anything to WCAG; what it must not be is 1.00.
    expect(contrast("live-sunk", "stock")).toBeGreaterThan(1.1);
  });
});

/**
 * Below here the assertions are about **shape**, not about a ratio: a rule's
 * weight, a material's uniqueness, and where a component reaches for its field.
 */

describe("the board's materials keep their shape", () => {
  it("defines the framed Bank as one panel stock with one structural rule", () => {
    const framed = css.match(/@utility bank-framed \{([^}]*)\}/)?.[1] ?? "";
    expect(framed).toContain("border: 1px solid var(--color-rule-strong)");
    expect(framed).toContain("background-color: var(--color-stock-panel)");
    // Radius arrives with the depth scale in 10.4; a glow never does.
    expect(framed).not.toMatch(/shadow|gradient/);
  });

  it("the live rule is heavier than every other rule", () => {
    // The state is carried by weight as well as colour, so a 1px marker rule
    // would be a regression even at full saturation.
    const live = css.match(/@utility slot-live \{([^}]*)\}/)?.[1] ?? "";
    const filled = css.match(/@utility slot-filled \{([^}]*)\}/)?.[1] ?? "";
    expect(live).toMatch(/border-top:\s*2px solid var\(--color-live\)/);
    expect(filled).toMatch(/border-top:\s*1px solid/);
  });

  it("refuses atmosphere anywhere in the stylesheet", () => {
    // The No-Atmosphere Rule, which is what survives of
    // Flatness-Is-Not-Negotiable. A dark ground is exactly where a glow, a
    // gradient or a blurred backdrop becomes tempting, and those are the three
    // things ADR-0006 kept refusing while it gave up the light ground.
    expect(css).not.toMatch(/linear-gradient|radial-gradient|backdrop-filter/);
    expect(css).not.toMatch(/text-shadow/);
  });
});

describe("a row in your hand says so in its own material", () => {
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
    const board = readFileSync(resolve(process.cwd(), "src/components/board.tsx"), "utf8");
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
    // material at all.
    expect(list).toMatch(/"slot-transit bg-stock"/);
    expect(list).toMatch(/dragging\s*\n?\s*\?\s*"waiting"/);
  });
});

/**
 * The patch's field is read out of the component, not out of the stylesheet.
 *
 * Everything else in this file is a number; this one is a *shape*, and the
 * shape is the fix. A `bg-pos-<hue>` at 10% alpha is a wash, so whatever row
 * the patch sits in decides the letter's contrast — on the live bay of an armed
 * pool row that composited to 4.10–4.18:1, under the floor, on the one element
 * that exists to be the colour-blind fallback for position. An opaque
 * `color-mix(…, stock)` field cannot do that, and no arithmetic over
 * `globals.css` can tell the two apart, because the difference is in
 * `board.tsx`. So this reads the source, the way `purity.test.ts` does.
 *
 * The `var(--color-stock)` inside that mix is a *token reference* rather than a
 * literal, which is what let the patch follow a second ground in 9.5 without
 * the component knowing there was one — and what lets it follow this one.
 */
describe("a position patch brings its own field", () => {
  const board = readFileSync(resolve(process.cwd(), "src/components/board.tsx"), "utf8");
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
          `decides the letter's contrast, which was 4.1:1 on the live bay`,
      ).not.toMatch(new RegExp(`bg-pos-${position}/`));
      expect(line).toContain(
        `color-mix(in_oklab,var(--color-pos-${position})_10%,var(--color-stock))`,
      );
    });
  }
});

/**
 * One ground, and it has to stay one ground — or start being measured.
 *
 * 9.5 declared its second palette as `--night-*` and pointed `--color-*` at it,
 * specifically so that the regex above (which reads the FIRST declaration of a
 * name) could not be fooled into measuring one ground twice. Phase 10 deleted
 * that palette, and with it the protection: a second `--color-stock:` anywhere
 * below the `@theme` block would now silently become the shipped ground while
 * every ratio in this file went on measuring the declared one.
 *
 * So the invariant is asserted directly. A future theme is welcome; it has to
 * arrive as a named palette and a loop over this file, the way 9.5's did.
 */
describe("no second palette ships unmeasured", () => {
  const TOKENS = [
    "stock",
    "stock-panel",
    "ink",
    "ink-soft",
    "ink-faint",
    "rule",
    "rule-strong",
    "rail",
    "live",
    "live-sunk",
    "pos-g",
    "pos-f",
    "pos-c",
  ] as const;

  it("every token this file measures is declared exactly once", () => {
    for (const name of TOKENS) {
      const declarations = css.match(new RegExp(`--color-${name}:`, "g")) ?? [];
      expect(
        declarations.length,
        `--color-${name} is declared ${declarations.length} times; a second ` +
          `declaration overrides the one every ratio here measures`,
      ).toBe(1);
    }
  });

  it("declares the palette's own color-scheme, so form controls follow", () => {
    // Without this a native select, a date picker and a scrollbar render light
    // chrome on a dark board.
    expect(css).toMatch(/:root\s*\{\s*color-scheme: dark/);
  });

  it("carries no leftover of the retired night board", () => {
    // Comments are stripped first, because this file's own prose explains what
    // was removed and naming a thing is not shipping it. The first cut of this
    // assertion failed on the paragraph above `:root` describing the palette it
    // had just deleted, which is a test measuring documentation.
    const declarations = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(declarations).not.toMatch(/--night-/);
    expect(declarations).not.toMatch(/prefers-color-scheme/);
    expect(declarations).not.toMatch(/data-theme/);
  });
});
