/**
 * Each EuroLeague club's colour, from its primary kit and crest (E2026; the
 * sources are named in docs/log/matchnight.md, S27). Lightness is held
 * between 0.46 and 0.86 so a bar reads on both grounds: navy clubs are lifted
 * to a mid blue, and black-and-white clubs are a neutral grey whose crest says
 * which club it is. Colour is never the only word: a club bar always sits
 * beside its crest.
 */
export const CLUB_COLORS: Readonly<Record<string, string>> = {
  ASV: "oklch(0.56 0.008 255)",
  BAR: "oklch(0.5 0.17 8)",
  BAS: "oklch(0.5 0.12 258)",
  BES: "oklch(0.48 0.008 255)",
  DUB: "oklch(0.64 0.008 255)",
  HTA: "oklch(0.55 0.2 29)",
  IST: "oklch(0.66 0.12 230)",
  MAD: "oklch(0.52 0.14 306)",
  MIL: "oklch(0.58 0.22 27)",
  MUN: "oklch(0.57 0.21 20)",
  OLY: "oklch(0.56 0.21 26)",
  PAM: "oklch(0.67 0.18 46)",
  PAN: "oklch(0.6 0.13 160)",
  PAR: "oklch(0.52 0.008 255)",
  PRS: "oklch(0.7 0.008 255)",
  RED: "oklch(0.6 0.22 26)",
  TEL: "oklch(0.82 0.16 88)",
  ULK: "oklch(0.84 0.17 100)",
  VIR: "oklch(0.6 0.008 255)",
  ZAL: "oklch(0.52 0.12 151)",
};

/** A club's colour, or the quiet ink for a club this season has not met. */
export function clubColor(code: string | null | undefined): string {
  return (code && CLUB_COLORS[code.toUpperCase()]) || "var(--color-ink-soft)";
}
