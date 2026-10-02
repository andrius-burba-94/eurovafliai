/**
 * Readable URL segments: "Monikutės Naktys" → "monikutes-naktys". Pure; the
 * store (`./store.ts`) decides what is already taken.
 */

const LETTERS: Readonly<Record<string, string>> = {
  ß: "ss",
  æ: "ae",
  œ: "oe",
  ø: "o",
  ł: "l",
  đ: "d",
  ð: "d",
  þ: "th",
  ı: "i",
};

const MAX = 48;

export function slugify(text: string): string {
  const folded = text
    .toLowerCase()
    .replace(/[ßæœøłđðþı]/g, (letter) => LETTERS[letter] ?? letter)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const slug = folded.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug.length <= MAX ? slug : slug.slice(0, MAX).replace(/-+[^-]*$/, "") || slug.slice(0, MAX);
}

/**
 * The words a league's own pages use after `/l/<league>/`. A team cannot take
 * one, or `/l/<league>/stats` would mean two things.
 */
export const RESERVED_TEAM_SLUGS: ReadonlySet<string> = new Set([
  "draft",
  "export",
  "fantasy",
  "lineup",
  "matchday",
  "order",
  "players",
  "recap",
  "sheet",
  "standings",
  "stats",
  "teams",
  "transactions",
]);

/** The first of `base`, `base-2`, `base-3`, … nobody holds. */
function firstFree(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export function leagueSlug(name: string, taken: ReadonlySet<string>): string {
  return firstFree(slugify(name) || "league", taken);
}

export function teamSlug(name: string, taken: ReadonlySet<string>): string {
  const base = slugify(name) || "team";
  return firstFree(RESERVED_TEAM_SLUGS.has(base) ? `${base}-team` : base, taken);
}

/** Two players of one name are told apart by their club first, as people do. */
export function playerSlug(name: string, clubCode: string | null | undefined, taken: ReadonlySet<string>): string {
  const base = slugify(name) || "player";
  if (!taken.has(base)) return base;
  const club = slugify(clubCode ?? "");
  return firstFree(club ? `${base}-${club}` : base, taken);
}

/** A PocketBase record id, which a URL may still carry in place of a slug. */
export function looksLikeId(segment: string): boolean {
  return /^[a-z0-9]{15}$/.test(segment);
}
