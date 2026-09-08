import Fuse from "fuse.js";

import type { ExistingPlayer, NormalizedPlayer } from "./types";

/**
 * Deciding whether an arriving player is a *rename* of one already stored —
 * slice 4.2.
 *
 * Pure, and the most consequential comparison in the ingestion pipeline: a
 * wrong "yes" merges two humans into one row, and a wrong "no" splits one human
 * into a departed row and a duplicate. So nothing here decides anything on its
 * own. It **proposes**, a commissioner confirms, and until then the sync
 * touches neither side.
 *
 * ## The problem this exists for, measured rather than imagined
 *
 * 2.1's research recorded that 13% of E2026 players had no `person_code` yet
 * and that the count would fall "as clubs register". It did — and not the way
 * anybody expected. The clubs registered those players **under their passport
 * names**. So on 2026-09-08 a sync would have planned 18 adds and 22
 * departures against a real pool, and at least 13 of those adds were the same
 * human as one of the departures:
 *
 * | stored | the feed now says |
 * |---|---|
 * | `Burnell, Jason` | `Burnell, Jason Scott` |
 * | `Juzang, Johnny` | `Juzang, Jonathan` |
 * | `Lawson, Aj` | `Lawson, Anthony` |
 * | `Cardenas, Alvaro` | `Cardenas Torre, Alvaro` |
 * | `Bello, Rasheed` | `Bello, Abdulrasheed Olamilekan` |
 *
 * Every one of them a codeless stored row, so `diffRosters`' name+club fallback
 * missed and both halves fired. That is worse than untidy: box scores attach by
 * `person_code`, so they would land on the *new* row while a pick or a cheat
 * sheet still pointed at the departed one — and 4.3 fetches unattended, so
 * nobody would be watching when it happened.
 *
 * ## Why not fuse alone
 *
 * `src/lib/sheets/match.ts` fuzzy-matches cheat-sheet lines and reusing it here
 * was the plan. Measured against those thirteen real pairs and five
 * deliberately hard negatives, a single fuse threshold **cannot separate the
 * classes**: the true pairs score 0.008–0.568 and the false ones 0.485–0.777.
 * Any cut-off that catches `Duarte, Chris → Theoret Duarte, Christopher`
 * (0.531) also merges `Nunn, Kendrick` with `Nunn, Kevarrius` (0.509) — two
 * real Euroleague players, one silent identity error, and no way to notice.
 *
 * So the confident rule is **token containment**, which is explainable in one
 * sentence and had no false positives on that set: every token of the shorter
 * name is covered by a distinct token of the longer one, and at least one pair
 * of tokens matches exactly. `jason ⊂ {jason, scott}`; `rasheed` inside
 * `abdulrasheed`; `mo` a prefix of `mouhamadou`. `kendrick` and `kevarrius`
 * share only a first letter and are not related by prefix or substring, so they
 * are not proposed.
 *
 * Fuse still earns its place — for **ranking the leftovers**. A stored codeless
 * player that containment could not pair, sitting in a club that has an
 * unexplained arrival, is offered with candidates in fuse order for a person to
 * choose from. That is where `Juzang, Johnny → Juzang, Jonathan` gets resolved:
 * a nickname is not a string-distance problem, and pretending otherwise is how
 * you merge the wrong Nunn.
 */

/** How sure we are, and therefore what the surface asks of a person. */
export type RenameConfidence = "likely" | "candidate";

export type RenameProposal = {
  /** The stored row. Its id survives a merge — that is the whole point. */
  readonly existing: ExistingPlayer;
  /** The arriving row we think is the same person. */
  readonly incoming: NormalizedPlayer;
  readonly confidence: RenameConfidence;
  /** Why, in words a person can check against the two names. */
  readonly reason: string;
  /** Other arrivals in the same club, best first, for a `candidate`. */
  readonly alternatives: NormalizedPlayer[];
};

/**
 * Generational suffixes, which the two sources disagree about.
 *
 * `Moore Jr, Wendell` is stored; the feed now says `Moore, Wendell Horace` —
 * same person, code and all, and containment refused it only because nothing
 * covered `jr`. Measured on the live feed, so this is a real pattern rather
 * than a defensive guess.
 *
 * `v` is deliberately absent. `iv` and `iii` are unambiguous, but a bare `v`
 * is as likely to be part of a name, and being wrong here means merging two
 * people.
 */
const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv"]);

/** Tokens of a normalized name: lower-cased, folded, split on anything else. */
export function nameTokens(normalized: string): string[] {
  return normalized
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

/** The same tokens, without a generational suffix either side may carry. */
function comparableTokens(normalized: string): string[] {
  const tokens = nameTokens(normalized).filter(
    (token) => !SUFFIXES.has(token),
  );
  // A name that is *only* a suffix is not a name; keep the original rather
  // than compare an empty list against everything.
  return tokens.length > 0 ? tokens : nameTokens(normalized);
}

/**
 * Whether one token is the same name-part as another.
 *
 * The three relations, each earned by a real pair:
 *
 * - **equal** — `burnell` / `burnell`.
 * - **prefix**, at least two characters — `mo` / `mouhamadou`, `bo` / `bobi`,
 *   `chris` / `christopher`. Two is the shortest that is not an initial; a
 *   single letter would make every `a` match every `anthony`.
 * - **substring**, at least four characters — `rasheed` inside
 *   `abdulrasheed`. Four because three-letter substrings are everywhere: `ana`
 *   is in both `anastasiou` and `fontana`.
 */
export function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length >= 2 && long.startsWith(short)) return true;
  if (short.length >= 4 && long.includes(short)) return true;
  return false;
}

/**
 * Is every token of the shorter name covered by a distinct token of the longer,
 * with at least one exact match?
 *
 * "Distinct" matters: without it, a name whose tokens all matched the *same*
 * token of the other would pass — `{jon, jonathan}` against `{jonathan}`.
 */
export function looksLikeRename(
  storedNormalized: string,
  incomingNormalized: string,
): { same: boolean; reason: string } {
  const stored = comparableTokens(storedNormalized);
  const incoming = comparableTokens(incomingNormalized);
  if (stored.length === 0 || incoming.length === 0) {
    return { same: false, reason: "one of the names has no tokens" };
  }

  const [short, long] =
    stored.length <= incoming.length ? [stored, incoming] : [incoming, stored];

  const used = new Set<number>();
  const exact: string[] = [];
  const loose: string[] = [];

  for (const token of short) {
    const at = long.findIndex(
      (candidate, index) => !used.has(index) && tokensMatch(token, candidate),
    );
    if (at === -1) {
      return {
        same: false,
        reason: `"${token}" is in one name and nothing like it is in the other`,
      };
    }
    used.add(at);
    if (long[at] === token) exact.push(token);
    else loose.push(`${token} → ${long[at]}`);
  }

  if (exact.length === 0) {
    // Every token matched only loosely. `jon smi` against `jonathan smith` is
    // the sort of thing that would pass, and it is not evidence.
    return { same: false, reason: "no part of the two names matches exactly" };
  }

  const extra = long.length - short.length;
  return {
    same: true,
    reason:
      `${exact.join(", ")} matches exactly` +
      (loose.length > 0 ? `; ${loose.join(", ")}` : "") +
      (extra > 0
        ? `; the feed adds ${extra} more name part${extra === 1 ? "" : "s"}`
        : ""),
  };
}

/**
 * Pair up what a sync could not explain.
 *
 * Both inputs are the rows `diffRosters` was about to put in `adds` and
 * `leaving`. Every pair returned is removed from **both**, which is the
 * quarantine: the pool neither gains a duplicate nor loses a player while it
 * waits for a person.
 *
 * Two rules keep the quarantine narrow:
 *
 * - only a stored row with **no `person_code`** is a candidate. A stored row
 *   that has one and did not match by it is a different situation — a code
 *   changed, or two codes collide — and `diffRosters` already refuses that
 *   loudly rather than guessing.
 * - only an arriving row **with** a code is a candidate, because filling the
 *   code in is the entire point of the merge. A codeless arrival that happens
 *   to look similar is just a name.
 */
export function proposeRenames({
  departing,
  arriving,
}: {
  departing: readonly ExistingPlayer[];
  arriving: readonly NormalizedPlayer[];
}): { proposals: RenameProposal[]; pairedIncoming: Set<NormalizedPlayer> } {
  const proposals: RenameProposal[] = [];
  const pairedIncoming = new Set<NormalizedPlayer>();

  const candidates = departing
    .filter((player) => !player.person_code)
    // Deterministic, like everything else the pipeline decides: id order, so
    // two runs over the same data propose the same pairs in the same order.
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));

  const open = arriving.filter((row) => row.person_code);

  /**
   * **Two passes, and the order is the point.**
   *
   * A single pass in id order let a weak `candidate` claim an arrival before
   * the confident pair for the same person had even been considered — so
   * `Burnell, J` (nothing matches, offered as a candidate) took
   * `Burnell, Jason Scott` and then `Burnell, Jason` matched it too, and one
   * arrival appeared in two proposals. Confirming both would have written the
   * same `person_code` onto two players. Caught by this module's own test
   * before any of it was wired to a database.
   *
   * So: every containment pair is found first and claims its arrival
   * exclusively; only what is left over is offered as a question.
   */
  const undecided: ExistingPlayer[] = [];

  for (const player of candidates) {
    const sameClub = open.filter(
      (row) => row.club_code === player.club_code && !pairedIncoming.has(row),
    );
    const confident = sameClub
      .map((row) => ({
        row,
        verdict: looksLikeRename(player.name_normalized, row.name_normalized),
      }))
      .filter((entry) => entry.verdict.same);

    if (confident.length === 1) {
      const only = confident[0]!;
      pairedIncoming.add(only.row);
      proposals.push({
        existing: player,
        incoming: only.row,
        confidence: "likely",
        reason: only.verdict.reason,
        alternatives: sameClub.filter((row) => row !== only.row),
      });
      continue;
    }

    if (confident.length > 1) {
      // Two arrivals both look like this one stored row. That is exactly when
      // a machine must not choose: a squad with two brothers, or a feed that
      // listed somebody twice. It claims neither.
      proposals.push({
        existing: player,
        incoming: confident[0]!.row,
        confidence: "candidate",
        reason: `${confident.length} arrivals at ${player.club_code} look like this player — ${confident
          .map((entry) => entry.row.name)
          .join(", ")}`,
        alternatives: rank(player, sameClub),
      });
      continue;
    }

    undecided.push(player);
  }

  for (const player of undecided) {
    // Arrivals a confident pair has already claimed are gone; what remains is
    // genuinely unexplained. A nickname change takes this shape —
    // `Juzang, Johnny` → `Juzang, Jonathan` — and it is a question for a
    // person, not a string-distance guess.
    const sameClub = open.filter(
      (row) => row.club_code === player.club_code && !pairedIncoming.has(row),
    );
    if (sameClub.length === 0) continue;

    const ranked = rank(player, sameClub);
    proposals.push({
      existing: player,
      incoming: ranked[0]!,
      confidence: "candidate",
      reason:
        "no part of the names matches, but this player has no person code and " +
        `${player.club_code} has ${sameClub.length} arrival${sameClub.length === 1 ? "" : "s"} nothing else explains`,
      alternatives: ranked,
    });
  }

  return { proposals, pairedIncoming };
}

/**
 * Order candidates best-first with fuse, generically.
 *
 * Ranking only — never deciding. The measurement that put it here is in this
 * file's header: fuse's scores overlap between real renames and different
 * people, so a threshold cannot be trusted, but the *order* it produces is
 * still the most useful order to show somebody. Exported because 4.2's
 * unmatched-code list needs exactly the same ranking over a different shape,
 * and two fuse configurations would be two behaviours.
 *
 * Anything fuse does not return keeps its own order behind the ranked ones, so
 * nothing is ever silently dropped from a list somebody is choosing from.
 */
export function rankCandidates<T>(
  queryNormalized: string,
  items: readonly { key: string; value: T }[],
): T[] {
  if (items.length <= 1) return items.map((item) => item.value);
  const fuse = new Fuse([...items], {
    keys: ["key"],
    includeScore: true,
    threshold: 1,
    ignoreLocation: true,
  });
  const ordered = fuse.search(queryNormalized).map((hit) => hit.item);
  for (const item of items) {
    if (!ordered.includes(item)) ordered.push(item);
  }
  return ordered.map((item) => item.value);
}

function rank(
  player: ExistingPlayer,
  candidates: readonly NormalizedPlayer[],
): NormalizedPlayer[] {
  return rankCandidates(
    player.name_normalized,
    candidates.map((row) => ({ key: row.name_normalized, value: row })),
  );
}
