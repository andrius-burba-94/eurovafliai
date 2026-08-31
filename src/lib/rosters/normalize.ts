/**
 * Turning either front door's rows into the one shape the pipeline writes.
 *
 * Pure: no PocketBase, no I/O, no clock. Both ingestion paths — the Euroleague
 * API sync and the commissioner's CSV — converge here, which is what makes
 * "one canonical `players` table, two front doors" (blueprint D8) true rather
 * than aspirational.
 *
 * Words are CONTEXT.md's: a **club** is the real Euroleague side, a **position
 * bucket** is one of G/F/C, a **person code** is the Euroleague external id, and
 * a **normalized name** is the diacritics-folded key.
 */
import type { Position } from "@/lib/engine";

import type { NormalizedPlayer } from "./types";

/**
 * Letters Unicode's NFD decomposition will not take apart, because they are
 * single code points rather than a base letter plus a combining mark.
 *
 * Without these a fold leaves "sławomir" with its ł, and the key keeps a
 * character nobody searching for a player will ever type. Every one of these is
 * a name shape this league will actually meet: Polish, Serbian, Croatian,
 * Scandinavian, German, Turkish, Icelandic.
 */
const HARD_LETTERS: Record<string, string> = {
  ł: "l",
  ø: "o",
  đ: "d",
  ð: "d",
  þ: "th",
  ß: "ss",
  æ: "ae",
  œ: "oe",
  ı: "i",
  ħ: "h",
  ŋ: "n",
  ŧ: "t",
  ĸ: "k",
};

/**
 * The match-and-search key for a player's name.
 *
 * Two properties, both load-bearing:
 *
 * 1. **Diacritics are folded** — `Valančiūnas` becomes `valanciunas`, which is
 *    what somebody actually types (CONTEXT.md).
 * 2. **Word order is irrelevant.** Tokens are sorted, so the API's
 *    `"SIRVYDIS, DEIVIDAS"` and a hand-made CSV's `"Deividas Sirvydis"` produce
 *    the same key. Without that, every CSV row would look like a new player and
 *    the fallback match — the *common* path, since 13% of E2026 players have no
 *    person code — would never fire.
 *
 * The cost of sorting is that two different people whose names are anagrams of
 * each other collide. Across 324 players that has not happened, and the
 * `unique(name_normalized, club_code)` index would refuse it loudly rather than
 * merging two players quietly.
 *
 * Idempotent: normalising a key returns the key.
 */
export function normalizeName(input: string): string {
  const folded = input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split("")
    .map((char) => HARD_LETTERS[char] ?? char)
    .join("")
    .normalize("NFD")
    // Strip the combining marks NFD just separated out.
    .replace(/\p{M}+/gu, "")
    // Anything still outside a-z0-9 after all that (Cyrillic, Greek) is left as
    // itself rather than dropped: losing it would collapse distinct names.
    .trim();

  return folded.split(/\s+/).filter(Boolean).sort().join(" ");
}

/**
 * Title-case a name the API gives in shouting caps: "DE COLO" → "De Colo".
 *
 * Also collapses internal whitespace, because the passport fields sometimes
 * carry doubles — "BRUNO AFONSO  DAVID" is real E2026 data — and a double space
 * would be visible on the board.
 */
function titleCase(input: string): string {
  return input
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(
      /(^|[\s'’-])(\p{L})/gu,
      (_match, sep: string, letter: string) => sep + letter.toUpperCase(),
    );
}

const API_POSITIONS: Record<string, Position> = {
  Guard: "G",
  Forward: "F",
  Center: "C",
};

/**
 * The API's position vocabulary is exactly Guard / Forward / Center across all
 * 324 E2026 players — verified twice, most recently at the start of this slice
 * (docs/research/euroleague-api.md, finding 1). So this map is total, and an
 * unmapped value means the feed changed.
 *
 * It throws rather than defaulting, deliberately. A wrong bucket is not a
 * cosmetic error: `isLegalPick` counts buckets against the roster template, so a
 * silently mis-bucketed player makes the engine enforce the wrong thing.
 */
export function mapApiPosition(positionName: string): Position {
  const mapped = API_POSITIONS[positionName?.trim() ?? ""];
  if (!mapped) {
    throw new Error(
      `Unknown Euroleague position ${JSON.stringify(positionName)}. The API has only ever used Guard, Forward or Center; ` +
        "if that changed, decide the bucket deliberately rather than defaulting it.",
    );
  }
  return mapped;
}

/** Which bucket each token a spreadsheet might use belongs to. */
const CSV_POSITIONS: Record<string, Position> = {
  g: "G",
  guard: "G",
  pg: "G",
  sg: "G",
  "point guard": "G",
  "shooting guard": "G",
  f: "F",
  forward: "F",
  sf: "F",
  pf: "F",
  "small forward": "F",
  "power forward": "F",
  c: "C",
  center: "C",
  centre: "C",
};

/**
 * The CSV path's bucketing rule, which is where the blueprint's
 * "'Guard-Forward'-style listings map to a single bucket" actually applies — the
 * API never needs it, a hand-made spreadsheet absolutely will.
 *
 * The rule is **first listed wins**: a combined listing names the primary
 * position first by convention. It is a rule rather than a judgement so that
 * two imports of the same sheet cannot disagree; where it gets somebody wrong,
 * the commissioner corrects that player and `manual_lock` keeps the correction.
 */
export function mapCsvPosition(raw: string): Position {
  const cleaned = (raw ?? "").trim().toLowerCase();
  if (cleaned) {
    const direct = CSV_POSITIONS[cleaned];
    if (direct) return direct;

    for (const token of cleaned.split(/[^a-z]+/).filter(Boolean)) {
      const mapped = CSV_POSITIONS[token];
      if (mapped) return mapped;
    }
  }

  throw new Error(
    `Cannot bucket the position ${JSON.stringify(raw)} as G, F or C. ` +
      "Use G/F/C, a full position name, or a combined listing whose first part is one of those.",
  );
}

/** The subset of an api-live roster row this pipeline reads. */
export type ApiRosterRow = {
  person?: {
    code?: string | null;
    name?: string | null;
    passportName?: string | null;
    passportSurname?: string | null;
  } | null;
  type?: string | null;
  /** "Player" / "Coach" — carried for readability at call sites; `type` decides. */
  typeName?: string | null;
  positionName?: string | null;
  dorsal?: string | null;
  club?: { code?: string | null; name?: string | null } | null;
};

/**
 * One api-live roster row → the shared normalized shape.
 *
 * Refuses anything that is not `type: "J"`. The filter is an **inclusion** for a
 * reason: each club's response also carries its coach, and this file's research
 * had the coach's type code wrong (`T`, actually `E`) for a while — an exclusion
 * filter written from that would have drafted twenty coaches, while the
 * inclusion filter was right the whole time.
 */
export function normalizeApiRow(row: ApiRosterRow): NormalizedPlayer {
  if (row.type !== "J") {
    throw new Error(
      `Refusing a roster row of type ${JSON.stringify(row.type)}: only "J" (Player) belongs in the pool.`,
    );
  }

  const clubCode = row.club?.code?.trim();
  const clubName = row.club?.name?.trim();
  if (!clubCode) {
    throw new Error(
      "Roster row has no club code; nothing downstream could match it.",
    );
  }

  const surname = row.person?.passportSurname?.trim();
  const first = row.person?.passportName?.trim();
  const display =
    surname && first
      ? `${titleCase(surname)}, ${titleCase(first)}`
      : titleCase((row.person?.name ?? "").trim());

  if (!display) {
    throw new Error(`Roster row for club ${clubCode} has no name.`);
  }

  const personCode = row.person?.code?.trim();

  return {
    name: display,
    name_normalized: normalizeName(display),
    club_code: clubCode,
    club_name: clubName || clubCode,
    position: mapApiPosition(row.positionName ?? ""),
    // The API's `active` flag is about a contract window, not an injury, so it
    // is not a status source. Injuries arrive by hand or in Phase 4.
    status: "active",
    person_code: personCode ? personCode : null,
    source: "api",
    dorsal: row.dorsal?.trim() ?? "",
  };
}
