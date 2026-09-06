import Fuse, { type IFuseOptions } from "fuse.js";

import type { Position } from "@/lib/engine";
import { normalizeName } from "@/lib/rosters/normalize";

import type { SheetLine } from "./parse";
import type { SheetRanking } from "./ranking";

/**
 * Matching a pasted cheat sheet to the pool — slice 3.4.
 *
 * A cheat sheet is written by a person, in whatever spelling they hold a player
 * in their head: "Nunn", "K. Nunn", "valanciunas", "Valančiūnas Jonas". The
 * pool stores "Surname, Firstname" with diacritics. So every line has to be
 * fuzzy-matched, and the blueprint asks for the one thing that makes that
 * honest: **a confirm step for ambiguous names.** A sheet drives autodraft, so
 * a silently wrong match is a player drafted for somebody who never wrote them
 * down — the failure this module exists to refuse.
 *
 * Three outcomes per line, and the middle one is the point:
 *
 * - **matched** — one player is clearly it.
 * - **ambiguous** — two or more are plausible. The line resolves nothing until
 *   a human picks, and the sheet can still be applied without it.
 * - **unmatched** — nobody in the pool is close. Said out loud rather than
 *   dropped: "Nunn is not in the pool" is a fact about the pool worth knowing
 *   the night before a draft.
 *
 * Deterministic, like everything a draft leans on: fuse scores are stable, and
 * every tie past them is broken by player id.
 *
 * It is not in `src/lib/engine/` for the same reason `src/lib/pool/search.ts`
 * is not — it takes a dependency, and the engine's purity test forbids any
 * import that is not relative to itself. Nothing here decides anything a draft
 * depends on either: it proposes a ranking, a person confirms it, and
 * `selectAutoPick` is still the only thing that turns a ranking into a pick.
 */

/** As much of a `players` record as matching needs. */
export type MatchablePlayer = {
  readonly id: string;
  readonly name: string;
  /**
   * Ingestion's `players.name_normalized`: lower-cased, diacritic-folded, and
   * with its tokens **sorted** — so "Valančiūnas, Jonas" and "Jonas
   * Valanciunas" both fold to the same key. That sorting is what makes an
   * exact match possible at all here, since nobody writing a cheat sheet
   * agrees about which name comes first.
   */
  readonly normalized: string;
  readonly club: string;
  readonly position: Position;
};

export type SheetEntryStatus =
  "matched" | "ambiguous" | "unmatched" | "duplicate";

/** One line of the sheet, and what the pool had to say about it. */
export type SheetEntry = {
  readonly line: SheetLine;
  readonly status: SheetEntryStatus;
  /** The player this line resolves to, or null until somebody chooses. */
  readonly playerId: string | null;
  /**
   * Who it might be, best first. Populated for `ambiguous` — the choices the
   * confirm step offers — and empty otherwise.
   */
  readonly candidates: readonly MatchablePlayer[];
};

/**
 * Fuse's settings for matching a *written* name, and they are deliberately
 * stricter than the pool's search (0.4).
 *
 * A search that returns a bad row costs a glance; a match that writes a bad row
 * into a sheet costs an autodraft pick. 0.32 still survives a transposition
 * ("valancinuas") because the normalized key is long, and it stops a
 * three-letter surname from matching half the league.
 */
const FUSE_OPTIONS: IFuseOptions<MatchablePlayer> = {
  keys: [
    { name: "name", weight: 2 },
    { name: "normalized", weight: 2 },
  ],
  threshold: 0.32,
  ignoreLocation: true,
  includeScore: true,
  minMatchCharLength: 2,
};

/**
 * How many alternatives a confirm step offers. Past four it is not a choice —
 * and the control that renders them adds "Leave this line out", so **three**
 * candidates is where the select reaches four options. The old value of 4 put
 * five in the list, one past this comment's own rule.
 */
const MAX_CANDIDATES = 3;

/**
 * How much better the best hit must be than the runner-up to be taken without
 * asking. Below this the two names are close enough that a person would look
 * twice, which is exactly when the sheet should make them.
 */
const DECISIVE_GAP = 0.12;

function bestHits(
  index: Fuse<MatchablePlayer>,
  typed: string,
): { player: MatchablePlayer; score: number }[] {
  const folded = normalizeName(typed);
  const scores = new Map<string, { player: MatchablePlayer; score: number }>();

  // Searched twice on purpose. The pool's two keys carry different information
  // — `name` has the diacritics, `normalized` has them folded and its tokens
  // sorted — and a query only ever resembles one of them. "valanciunas" scores
  // badly against "Valančiūnas, Jonas" and well against the folded key;
  // "Valančiūnas" does the reverse. Searching the raw text and the folded text
  // and keeping the better score means neither spelling is penalised for being
  // the one the writer happened to use.
  for (const query of folded && folded !== typed ? [typed, folded] : [typed]) {
    for (const hit of index.search(query)) {
      const score = hit.score ?? 1;
      const held = scores.get(hit.item.id);
      if (!held || score < held.score)
        scores.set(hit.item.id, { player: hit.item, score });
    }
  }

  return [...scores.values()].sort(
    (a, b) =>
      a.score - b.score ||
      // Total, so the same sheet resolves the same way on every machine.
      (a.player.id < b.player.id ? -1 : a.player.id > b.player.id ? 1 : 0),
  );
}

/**
 * Every line, matched against the pool, in the sheet's own order.
 *
 * Lines are resolved **in order**, and a player already claimed by an earlier
 * line makes a later one a `duplicate` rather than stealing them: a sheet that
 * names somebody twice meant the first place, and a ranking cannot hold the
 * same player at two ranks anyway — the ranking `selectAutoPick` walks would
 * offer them, fail legality on the second visit, and quietly rank everybody
 * else one place too low.
 */
export function matchSheet(
  rows: readonly SheetLine[],
  pool: readonly MatchablePlayer[],
): SheetEntry[] {
  const index = new Fuse([...pool], FUSE_OPTIONS);

  /** Exact folded key → every player holding it. Usually one; twins exist. */
  const byKey = new Map<string, MatchablePlayer[]>();
  for (const player of pool) {
    const key = player.normalized || normalizeName(player.name);
    const held = byKey.get(key);
    if (held) held.push(player);
    else byKey.set(key, [player]);
  }

  const claimed = new Set<string>();
  const entries: SheetEntry[] = [];

  for (const line of rows) {
    const exact = byKey.get(normalizeName(line.name)) ?? [];
    let candidates: MatchablePlayer[];
    let decisive: boolean;

    if (exact.length > 0) {
      // Two players really do share a folded name — the pool has held four
      // Willies and two Joneses. That is a choice for a human, not a coin toss.
      //
      // **Not** capped at `MAX_CANDIDATES`, unlike the fuzzy branch below, and
      // the asymmetry is deliberate: every one of these is an exact match on
      // the name that was typed, so truncating the list could remove the only
      // right answer and leave a member choosing between three wrong ones.
      // A fuzzy list is a ranking and its tail is noise; this list is a tie.
      candidates = [...exact].sort((a, b) => (a.id < b.id ? -1 : 1));
      decisive = exact.length === 1;
    } else {
      const hits = bestHits(index, line.name);
      candidates = hits.slice(0, MAX_CANDIDATES).map((hit) => hit.player);
      const best = hits[0];
      const runnerUp = hits[1];
      decisive =
        best !== undefined &&
        (runnerUp === undefined || runnerUp.score - best.score >= DECISIVE_GAP);
    }

    if (candidates.length === 0) {
      entries.push({
        line,
        status: "unmatched",
        playerId: null,
        candidates: [],
      });
      continue;
    }

    if (decisive) {
      const player = candidates[0]!;
      if (claimed.has(player.id)) {
        entries.push({
          line,
          status: "duplicate",
          playerId: null,
          candidates: [player],
        });
        continue;
      }
      claimed.add(player.id);
      entries.push({
        line,
        status: "matched",
        playerId: player.id,
        candidates: [],
      });
      continue;
    }

    entries.push({
      line,
      status: "ambiguous",
      playerId: null,
      // A candidate an earlier line already took is not a choice any more.
      candidates: candidates.filter((player) => !claimed.has(player.id)),
    });
  }

  return entries;
}

/**
 * The sheet as it will be stored, given whatever the confirm step decided.
 *
 * `choices` maps a line number to the player id a human picked for it — for an
 * ambiguous line, or an unmatched one they found by hand. An empty string means
 * "leave this line out", which is a real answer: a sheet is allowed to name
 * somebody who is not in this pool.
 *
 * A tier break is recorded wherever the tier column **changes** between two
 * surviving rows. That is the whole rule, and it is why the tier is kept as the
 * text it was written in: "1"→"2" and "elite"→"good" are the same event, and
 * neither needs to be a number for the break between them to be real.
 */
export function resolveSheet(
  entries: readonly SheetEntry[],
  choices: ReadonlyMap<number, string> = new Map(),
): SheetRanking {
  const ranking: string[] = [];
  const tiers: number[] = [];
  const used = new Set<string>();
  let previousTier: string | null = null;

  for (const entry of entries) {
    const chosen = choices.get(entry.line.lineNo);
    const playerId = chosen === undefined ? entry.playerId : chosen || null;
    if (!playerId || used.has(playerId)) continue;

    if (previousTier !== null && entry.line.tier !== previousTier) {
      tiers.push(ranking.length);
    }
    previousTier = entry.line.tier;

    used.add(playerId);
    ranking.push(playerId);
  }

  return { ranking, tiers };
}
