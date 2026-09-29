import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { TEAM_COLORS, TEAM_INK } from "@/lib/teams/identity";

/**
 * The design tokens have to clear WCAG AA on BOTH grounds, and that is checked
 * rather than eyeballed (ADR-0011).
 *
 * Matchnight ships a dark ground (the `@theme` block) and a light one (the
 * `prefers-color-scheme: light` block). Every floor below is asked once per
 * ground, parsed from globals.css so the test cannot drift from the values it
 * guards. A token that exists in one ground and not the other fails here,
 * because a phone in a lit room would render the dark value on a light page.
 */

const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

const themeBlock = /@theme \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
const lightBlock = /@media \(prefers-color-scheme: light\) \{\s*:root \{([\s\S]*?)\n  \}/.exec(css)?.[1] ?? "";

const GROUNDS = { dark: themeBlock, light: lightBlock } as const;
type Ground = keyof typeof GROUNDS;

type Oklch = [number, number, number];

function tokenIn(block: string, name: string): Oklch | null {
  const match = block.match(
    new RegExp(`--color-${name}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\)`),
  );
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** A ground's value, or the dark one where the ground inherits it (team colours). */
function token(ground: Ground, name: string): Oklch {
  const own = tokenIn(GROUNDS[ground], name) ?? tokenIn(themeBlock, name);
  if (!own) throw new Error(`token --color-${name} not found for ${ground}`);
  return own;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** OKLCH → linear sRGB, per the Oklab spec. */
function oklchToLinearRgb([l, c, h]: Oklch) {
  const hRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);
  const L = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const M = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const S = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ].map((v) => Math.min(Math.max(v, 0), 1));
}

const luminanceOf = ([r, g, b]: number[]): number => 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;

/* A browser blends translucent colour in gamma-encoded sRGB, so washes are
 * composited there: encode, blend, decode. Blending in linear light reads a
 * dark-on-wash pair about 0.2 too high and lets a real failure pass. */
const encode = (v: number): number => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
const decode = (v: number): number => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));

function ratio(la: number, lb: number): number {
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function palette(ground: Ground) {
  const rgb = (name: string) => oklchToLinearRgb(token(ground, name));
  const wash = (name: string, alpha: number, over: string) => {
    const fg = rgb(name).map(encode);
    const bg = rgb(over).map(encode);
    return fg.map((v, i) => decode(v * alpha + bg[i]! * (1 - alpha)));
  };
  return {
    rgb,
    wash,
    contrast: (a: string, b: string) => ratio(luminanceOf(rgb(a)), luminanceOf(rgb(b))),
    on: (name: string, background: number[]) => ratio(luminanceOf(rgb(name)), luminanceOf(background)),
    between: (a: number[], b: number[]) => ratio(luminanceOf(a), luminanceOf(b)),
  };
}

const TEXT = ["ink", "ink-soft", "ink-faint", "live", "gain", "loss", "gold", "pos-g", "pos-f", "pos-c", "rail"];
const SURFACES = ["stock", "stock-panel", "stock-high", "stock-sunk"];

for (const ground of Object.keys(GROUNDS) as Ground[]) {
  const p = palette(ground);

  describe(`${ground} ground: text clears AA on every surface`, () => {
    for (const surface of SURFACES) {
      for (const name of TEXT) {
        it(`--color-${name} is at least 4.5:1 on ${surface}`, () => {
          const value = p.contrast(name, surface);
          expect(round(value), `${name} on ${surface} was ${round(value)}:1`).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
  });

  describe(`${ground} ground: rules and controls are perceivable`, () => {
    for (const name of ["rule", "rule-strong"]) {
      for (const surface of ["stock", "stock-panel"]) {
        it(`--color-${name} clears 3:1 on ${surface}`, () => {
          expect(round(p.contrast(name, surface))).toBeGreaterThanOrEqual(3);
        });
      }
    }

    it("rule-strong is heavier than rule", () => {
      expect(p.contrast("rule-strong", "stock")).toBeGreaterThan(p.contrast("rule", "stock"));
    });

    it("the primary action's label clears 4.5:1 on its own fill", () => {
      expect(round(p.contrast("live-ink", "live"))).toBeGreaterThanOrEqual(4.5);
    });

    it("the LIVE bug's word clears 4.5:1 on its red", () => {
      expect(round(p.contrast("on-air-ink", "on-air"))).toBeGreaterThanOrEqual(4.5);
    });

    it("the accent clears the 3:1 boundary floor as a border on stock", () => {
      expect(round(p.between(p.wash("live", 0.8, "stock"), p.rgb("stock")))).toBeGreaterThanOrEqual(3);
    });
  });

  describe(`${ground} ground: the accent's field keeps its text`, () => {
    it("ink, soft ink and faint ink clear 4.5:1 on live-sunk", () => {
      for (const name of ["ink", "ink-soft", "ink-faint"]) {
        const value = p.contrast(name, "live-sunk");
        expect(round(value), `${name} on live-sunk was ${round(value)}:1`).toBeGreaterThanOrEqual(4.5);
      }
    });

    it("the accent itself clears 4.5:1 on its field", () => {
      expect(round(p.contrast("live", "live-sunk"))).toBeGreaterThanOrEqual(4.5);
    });

    it("the field is a visible step off the ground", () => {
      expect(p.contrast("live-sunk", "stock")).toBeGreaterThan(1.1);
    });
  });

  describe(`${ground} ground: positions stay legible on their washes`, () => {
    for (const position of ["pos-g", "pos-f", "pos-c"]) {
      it(`${position}'s letter clears 4.5:1 on its own 10% wash`, () => {
        const value = p.on(position, p.wash(position, 0.1, "stock"));
        expect(round(value), `${position} on its wash was ${round(value)}:1`).toBeGreaterThanOrEqual(4.5);
      });

      it(`ink and soft ink clear 4.5:1 on a ${position} slot, on stock and on a panel`, () => {
        for (const over of ["stock", "stock-panel"]) {
          for (const name of ["ink", "ink-soft"]) {
            const value = p.on(name, p.wash(position, 0.1, over));
            expect(round(value), `${name} on ${position}/${over} was ${round(value)}:1`).toBeGreaterThanOrEqual(4.5);
          }
        }
      });

      it(`a ${position} slot keeps its structural rule`, () => {
        expect(round(p.on("rule-strong", p.wash(position, 0.1, "stock")))).toBeGreaterThanOrEqual(3);
      });
    }
  });

  describe(`${ground} ground: surfaces step in the right direction`, () => {
    it("a raised surface is distinguishable from the panel it sits on", () => {
      expect(p.contrast("stock-high", "stock-panel")).toBeGreaterThan(1.05);
    });
  });
}

describe("dark ground: chalk stays below the halation ceiling", () => {
  // Pure white on the dark ground shouts, and full-strength white in a dark
  // room is harder to read, not easier. The upper bound keeps "improving"
  // contrast from being a one-character change.
  it("ink is between 12:1 and 17.5:1 on stock", () => {
    const value = palette("dark").contrast("ink", "stock");
    expect(round(value)).toBeGreaterThanOrEqual(12);
    expect(round(value)).toBeLessThanOrEqual(17.5);
  });
});

describe("team crests", () => {
  const p = palette("dark");
  for (const colour of TEAM_COLORS) {
    it(`a monogram clears 4.5:1 on ${colour}`, () => {
      const ink = `team-ink-${TEAM_INK[colour]}`;
      const value = p.contrast(ink, `team-${colour}`);
      expect(round(value), `${ink} on ${colour} was ${round(value)}:1`).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe("both grounds are complete", () => {
  const MEASURED = [
    "stock",
    "stock-panel",
    "stock-high",
    "stock-sunk",
    "ink",
    "ink-soft",
    "ink-faint",
    "rule",
    "rule-strong",
    "panel-border",
    "rail",
    "live",
    "live-sunk",
    "live-ink",
    "gain",
    "loss",
    "gold",
    "pos-g",
    "pos-f",
    "pos-c",
    "on-air",
    "on-air-ink",
    "wood",
    "wood-deep",
    "court-line",
  ];

  it("found both blocks", () => {
    expect(themeBlock.length).toBeGreaterThan(100);
    expect(lightBlock.length).toBeGreaterThan(100);
  });

  for (const name of MEASURED) {
    it(`--color-${name} is declared exactly once in each ground`, () => {
      for (const block of [themeBlock, lightBlock]) {
        const declarations = block.match(new RegExp(`--color-${name}:`, "g")) ?? [];
        expect(declarations.length).toBe(1);
      }
    });
  }

  it("each ground declares its own color-scheme, so form controls follow", () => {
    expect(css).toMatch(/:root\s*\{\s*color-scheme: dark/);
    expect(lightBlock).toMatch(/color-scheme: light/);
  });
});

/**
 * Below here the assertions are about **shape**: a rule's weight, a
 * material's uniqueness, and where a component reaches for its field.
 */

describe("the board's materials keep their shape", () => {
  it("the live rule is heavier than every other rule", () => {
    const live = css.match(/@utility slot-live \{([^}]*)\}/)?.[1] ?? "";
    const filled = css.match(/@utility slot-filled \{([^}]*)\}/)?.[1] ?? "";
    expect(live).toMatch(/border-top:\s*2px solid var\(--color-live\)/);
    expect(filled).toMatch(/border-top:\s*1px solid/);
  });

  it("never reaches for text-shadow or a blurred backdrop", () => {
    const declarations = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(declarations).not.toMatch(/text-shadow|backdrop-filter/);
  });

  it("guards every moment for reduced motion", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\[data-moment\]\[data-playing\]/);
  });
});

describe("a row in your hand says so in its own material", () => {
  it("is 2px dashed ink — unsettled, and not the accent", () => {
    const transit = css.match(/@utility slot-transit \{([^}]*)\}/)?.[1] ?? "";
    expect(transit).toMatch(/border-top:\s*2px dashed var\(--color-ink\)/);
  });

  it("is not confusable with the rules it sits beside", () => {
    const rule = (name: string) =>
      (css.match(new RegExp(`@utility ${name} \\{([^}]*)\\}`))?.[1] ?? "").replace(/\s+/g, " ").trim();
    const transit = rule("slot-transit");
    expect(transit).not.toBe("");
    for (const other of ["slot-waiting", "slot-filled", "slot-live", "slot-standing", "slot-correction"]) {
      expect(rule(other), `${other} matched slot-transit`).not.toBe(transit);
    }
  });

  it("is reached as a state, never composed onto another slot rule", () => {
    // Tailwind v4 emits `@utility` blocks alphabetically and the dev server
    // splits them across chunks, so two rules for one border once composited a
    // 1px dashed material that existed in neither. One state is the fix.
    const board = readFileSync(resolve(process.cwd(), "src/components/board.tsx"), "utf8");
    expect(board).toMatch(/transit:\s*"slot-transit"/);
    expect(board).toMatch(/type SlotState =[^;]*"transit"/);
    const list = readFileSync(resolve(process.cwd(), "src/app/leagues/[id]/sheet/sheet-list.tsx"), "utf8");
    expect(list).toMatch(/\?\s*"transit"/);
    expect(list).toMatch(/"slot-transit bg-stock"/);
    expect(list).toMatch(/dragging\s*\n?\s*\?\s*"waiting"/);
  });
});

/**
 * The patch carries its own opaque field. A 10% alpha wash let whatever row
 * the patch sat in decide the letter's contrast — 4.1:1 on the accent field of
 * an armed pool row — on the one element that exists to be the colour-blind
 * fallback for position. The mix references `--color-stock`, so it follows
 * whichever ground is showing.
 */
describe("a position patch brings its own field", () => {
  const board = readFileSync(resolve(process.cwd(), "src/components/board.tsx"), "utf8");
  const patchMap = /const PATCH: Record<[^>]+> = \{([\s\S]*?)\};/.exec(board);

  it("the PATCH map is where this test thinks it is", () => {
    expect(patchMap, "PATCH map not found in board.tsx").not.toBeNull();
  });

  for (const position of ["g", "f", "c"] as const) {
    it(`pos-${position}'s field is opaque, not an alpha wash`, () => {
      const line = patchMap![1]!.split("\n").find((row) => row.includes(`text-pos-${position}`));
      expect(line, `no pos-${position} row in PATCH`).toBeDefined();
      expect(line).not.toMatch(new RegExp(`bg-pos-${position}/`));
      expect(line).toContain(`color-mix(in_oklab,var(--color-pos-${position})_10%,var(--color-stock))`);
    });
  }
});
