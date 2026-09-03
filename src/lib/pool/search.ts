import Fuse, { type IFuseOptions } from "fuse.js";

import type { Position } from "@/lib/engine";

/**
 * The pool, filtered and searched — slice 3.3.
 *
 * Pure, and deliberately outside `src/lib/engine/`: it takes a dependency
 * (fuse.js), and the engine's purity test forbids any import that is not
 * relative to itself. That boundary is worth keeping. Nothing here decides
 * anything a draft depends on — who may pick, whether a pick is legal, whose
 * turn it is are all the server's, and `makePick` re-checks every one of them
 * on submission (invariant §1). This module only decides what a list *shows*.
 *
 * It lives apart from the component for the ordinary reason: "does typing
 * `valanciunas` find Valančiūnas, and does `valancinuas` still find him" is a
 * question about a function, and answering it through a rendered React tree
 * would be slower to write and worse at telling you which half broke.
 *
 * ## Why the pool arrives whole, drafted players included
 *
 * Because "hide drafted" is a *filter*, and a filter needs something to filter.
 * The blueprint asks for it defaulting to on, which only means anything if the
 * off state can show you that somebody already took Nunn — one of the questions
 * a draft room is actually asked out loud. 324 rows is small enough to send
 * once and narrow in the browser, which is also what makes the search instant.
 */

/** A player as the pool renders them. */
export type PoolPlayer = {
  readonly id: string;
  readonly name: string;
  /**
   * The `players.name_normalized` match key: lower-cased, diacritic-folded.
   *
   * Carried purely so fuse can match `valanciunas` against `Valančiūnas`
   * without this module owning a second folding implementation. Note ingestion
   * *sorts* the tokens in this field, so it is a match key and not a display
   * name — which does not matter to a fuzzy search over tokens, and is why it
   * is never shown.
   */
  readonly normalized: string;
  readonly club: string;
  readonly position: Position;
  /** `active`, `injured` or `doubtful`. `left` never reaches the pool. */
  readonly status: string;
  /** The member who holds them, or null if nobody has picked them. */
  readonly takenBy: string | null;
  /** The `overall_no` they went at, or null. */
  readonly takenAt: number | null;
};

export type PoolFilters = {
  /** Empty means every position. */
  readonly positions: readonly Position[];
  /** Empty string means every club. */
  readonly club: string;
  /** Default on, per the blueprint. */
  readonly hideDrafted: boolean;
  /** Hide anyone the feed lists as injured or doubtful. Default off. */
  readonly hideUnavailable: boolean;
  /**
   * Show only players the picker still has room for. Default **off**, and that
   * is a decision rather than an oversight: 3.2's wording is that an illegal
   * player is *muted*, not removed, and which guards are still out there
   * matters even when you cannot take one — it is what the rest of the table
   * is about to fight over. So the muting is always on and the hiding is opt-in.
   */
  readonly legalOnly: boolean;
};

export const NO_FILTERS: PoolFilters = {
  positions: [],
  club: "",
  hideDrafted: true,
  hideUnavailable: false,
  legalOnly: false,
};

/** A row, with the two things the list has to say about it. */
export type PoolRow = PoolPlayer & {
  /** Already picked by somebody. */
  readonly drafted: boolean;
  /**
   * The picker has no room left in this position. The server is still the
   * authority — this only mutes the row, and the pick button stays, because a
   * UI's opinion about legality is not evidence and a refusal that explains
   * itself is better than a control that silently is not there.
   */
  readonly noRoom: boolean;
};

/**
 * Fuse's own settings, in one place with the reasons.
 *
 * `threshold: 0.4` is the blueprint's "typo tolerance" made concrete: 0.2 is too
 * strict to survive a transposition ("valancinuas"), and past ~0.5 a three-letter
 * query starts matching most of the pool. `ignoreLocation` matters more than it
 * looks — without it fuse scores a match near the *start* of the string far
 * higher, and this pool stores "Surname, First", so searching for a first name
 * would rank badly for no reason a user could see.
 */
const FUSE_OPTIONS: IFuseOptions<PoolPlayer> = {
  keys: [
    { name: "name", weight: 2 },
    { name: "normalized", weight: 2 },
    { name: "club", weight: 1 },
  ],
  threshold: 0.4,
  ignoreLocation: true,
  minMatchCharLength: 2,
};

/**
 * Build the index once per pool, not once per keystroke.
 *
 * Exported so the component can memoise it against the pool array: fuse builds
 * an index up front, and rebuilding it on every character typed is the one way
 * to make a 324-row client-side search feel slow.
 */
export function poolIndex(pool: readonly PoolPlayer[]): Fuse<PoolPlayer> {
  return new Fuse([...pool], FUSE_OPTIONS);
}

/**
 * Everything the list shows, in the order it shows it.
 *
 * Filters first, then search — so a query never resurrects a player the filters
 * removed, which is the behaviour anyone who has just ticked "hide drafted"
 * expects. With no query the order is the pool's own (the server sorts by name);
 * with a query it is fuse's relevance, because a search that returns
 * alphabetical results has thrown away the only thing it computed.
 */
export function selectPool({
  pool,
  filters,
  query,
  needs,
  index,
}: {
  pool: readonly PoolPlayer[];
  filters: PoolFilters;
  query: string;
  /**
   * How many slots the *picker* has left per position — the member on the
   * clock, not necessarily the viewer, because a manager entering a pick for a
   * dead phone needs that member's legality and not their own. Null when nobody
   * is on the clock, which mutes nothing.
   */
  needs: Record<Position, number> | null;
  /** A prebuilt index over `pool`. Built here if absent, which tests do. */
  index?: Fuse<PoolPlayer>;
}): PoolRow[] {
  const roomFor = (position: Position): boolean =>
    needs === null || needs[position] > 0;

  const rows: PoolRow[] = pool
    .filter((player) => {
      const drafted = player.takenBy !== null;
      if (filters.hideDrafted && drafted) return false;
      if (filters.hideUnavailable && player.status !== "active") return false;
      if (filters.legalOnly && (drafted || !roomFor(player.position)))
        return false;
      if (
        filters.positions.length > 0 &&
        !filters.positions.includes(player.position)
      ) {
        return false;
      }
      if (filters.club && player.club !== filters.club) return false;
      return true;
    })
    .map((player) => ({
      ...player,
      drafted: player.takenBy !== null,
      noRoom: !roomFor(player.position),
    }));

  const needle = query.trim();
  if (needle.length === 0) return rows;

  // An exact club code is a filter, not a fuzzy search. Three letters is a very
  // loose fuzzy query — "PAN" scores a hit on "Shane" — so typing a club code
  // and getting half the league back is the literal behaviour of a good fuzzy
  // matcher and the wrong answer to what was asked. Codes are unambiguous, so
  // honour them exactly and keep the pool's own order.
  const asClub = needle.toUpperCase();
  if (rows.some((row) => row.club === asClub)) {
    return rows.filter((row) => row.club === asClub);
  }

  // Searching the *filtered* set, so the index is rebuilt when a query is
  // present. At 324 rows that is cheap; the alternative — search the whole pool
  // and intersect — makes a query undo the filters, which is the wrong answer.
  const searchable =
    rows.length === pool.length && index ? index : poolIndex(rows);
  const hits = searchable.search(needle);
  const keep = new Map(rows.map((row) => [row.id, row]));
  return hits
    .map((hit) => keep.get(hit.item.id))
    .filter((row): row is PoolRow => row !== undefined);
}

/** Every club in the pool, for the club filter. Sorted, deduplicated. */
export function clubsIn(pool: readonly PoolPlayer[]): string[] {
  return [...new Set(pool.map((player) => player.club))].sort();
}
