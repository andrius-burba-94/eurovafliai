/**
 * A member's team identity: a colour from a curated set, a crest shape and a
 * monogram derived from the team name. Pure — the stored choice is read from
 * `league_members`, and a member who never chose gets a deterministic default
 * from their place in the league, so the same team looks the same on every
 * device from the first render.
 */

export const TEAM_COLORS = [
  "ember",
  "royal",
  "teal",
  "mustard",
  "violet",
  "crimson",
  "forest",
  "sky",
  "magenta",
  "lime",
  "slate",
  "sand",
] as const;

export type TeamColor = (typeof TEAM_COLORS)[number];

export const CREST_SHAPES = ["waffle", "shield", "roundel", "hex"] as const;

export type CrestShape = (typeof CREST_SHAPES)[number];

/** Which ink a monogram takes on each colour, solved for 4.5:1 in `tokens.test.ts`. */
export const TEAM_INK: Readonly<Record<TeamColor, "dark" | "light">> = {
  crimson: "light",
  ember: "dark",
  mustard: "dark",
  lime: "dark",
  forest: "light",
  teal: "dark",
  sky: "dark",
  royal: "light",
  violet: "light",
  magenta: "light",
  slate: "light",
  sand: "dark",
};

export type TeamIdentity = {
  readonly color: TeamColor;
  readonly shape: CrestShape;
};

export function isTeamColor(value: unknown): value is TeamColor {
  return typeof value === "string" && (TEAM_COLORS as readonly string[]).includes(value);
}

export function isCrestShape(value: unknown): value is CrestShape {
  return typeof value === "string" && (CREST_SHAPES as readonly string[]).includes(value);
}

/**
 * Up to two letters: the first letter of the first two words, or the first two
 * letters of a one-word name. Diacritics are kept — "Šeštadienio Tritaškiai"
 * is "ŠT", which is how the league would write it.
 */
export function crestMonogram(name: string): string {
  const words = name
    .trim()
    .split(/[\s\-_.]+/u)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toLocaleUpperCase("lt");
  return (words[0]![0]! + words[1]![0]!).toLocaleUpperCase("lt");
}

/** The default for the member at `index` (0-based) in the league's order. */
export function defaultIdentity(index: number): TeamIdentity {
  const safe = Number.isInteger(index) && index >= 0 ? index : 0;
  return {
    color: TEAM_COLORS[safe % TEAM_COLORS.length]!,
    shape: CREST_SHAPES[safe % CREST_SHAPES.length]!,
  };
}

/** A stored choice where it is valid, the default where it is not. */
export function identityOf(stored: { color?: unknown; shape?: unknown }, index: number): TeamIdentity {
  const fallback = defaultIdentity(index);
  return {
    color: isTeamColor(stored.color) ? stored.color : fallback.color,
    shape: isCrestShape(stored.shape) ? stored.shape : fallback.shape,
  };
}
