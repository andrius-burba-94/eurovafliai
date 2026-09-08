/** Shared ceilings used by parsers, UI copy, and tests. */

/** Ranked players on one cheat-sheet paste. */
export const MAX_SHEET_LINES = 500;

/** Rows on one roster CSV paste. Twenty clubs fit well under this. */
export const MAX_ROSTER_CSV_LINES = 500;

/** Rows on one manual stat import. A round fits; a season pasted by mistake does not. */
export const MAX_STAT_CSV_LINES = 2_000;

/** Characters of pool search. A pasted document is not a useful Fuse query. */
export const MAX_POOL_QUERY_CHARS = 80;
