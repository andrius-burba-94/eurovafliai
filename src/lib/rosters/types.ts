/**
 * The ingestion pipeline's vocabulary.
 *
 * Pure types — no PocketBase record shapes. The pipeline is fed by two front
 * doors (the Euroleague API and the commissioner's CSV) and both produce
 * `NormalizedPlayer`, which is the only shape the apply step knows how to write.
 *
 * Names follow CONTEXT.md. Note `club_code` / `club_name` rather than the
 * blueprint §4 sketch's `team_code` / `team_name`: CONTEXT.md's "words we do not
 * use" is explicit that **team** is ambiguous — a Euroleague side is a **club**,
 * a member's fantasy squad is a roster — and CLAUDE.md says names in code match
 * that file. The blueprint defines the target; the glossary names it.
 */
import type { Position } from "@/lib/engine";

/** Which front door a player's current row came from. */
export type PlayerSource = "api" | "csv" | "manual";

/**
 * Whether a player can be expected to play.
 *
 * `left` is the terminal one and it is a status rather than a deletion: picks,
 * cheat sheets, roster memberships and game stats all reference player ids, so a
 * player who disappears from the authoritative source is marked, never removed
 * (blueprint 2.1).
 */
export type PlayerStatus = "active" | "injured" | "doubtful" | "left";

/** Which source is currently allowed to write. The other one runs report-only. */
export type RosterAuthority = "api" | "csv";

/** The shared row shape both front doors produce. */
export type NormalizedPlayer = {
  /** Display name, title-cased: "Cordinier, Isaia". */
  name: string;
  /** The diacritics-folded, order-insensitive match and search key. */
  name_normalized: string;
  /** The Euroleague club's three-letter code, e.g. "ZAL". */
  club_code: string;
  club_name: string;
  position: Position;
  status: PlayerStatus;
  /** The Euroleague external id, or null when the club has not registered one. */
  person_code: string | null;
  source: PlayerSource;
  /** Jersey number as text — it is an identifier, not a quantity. */
  dorsal: string;
};

/** A player as it exists in the table now, as much of it as the diff needs. */
export type ExistingPlayer = NormalizedPlayer & {
  id: string;
  /** A commissioner's correction. Neither source may overwrite a locked row. */
  manual_lock: boolean;
};

/** The fields an incoming row is allowed to change on an existing player. */
export type PlayerChange = {
  id: string;
  name: string;
  /** Only the fields that actually differ, so an apply writes nothing needless. */
  fields: Partial<Omit<NormalizedPlayer, "source">> & { source?: PlayerSource };
  /** What each changed field was, for the preview and the stored batch. */
  before: Record<string, unknown>;
};

/**
 * What one import would do, computed before anything is written.
 *
 * This is the commissioner's preview and, stored on the batch, the audit trail:
 * `roster_imports` keeps it whether or not the batch was applied.
 */
export type RosterDiff = {
  adds: NormalizedPlayer[];
  changes: PlayerChange[];
  /** Players in the table that the incoming roster no longer lists. */
  leaving: { id: string; name: string; club_code: string }[];
  /** Changes refused because the player carries `manual_lock`. */
  blocked: { id: string; name: string; fields: string[] }[];
  /** Rows the incoming set could not be read at all, with the reason. */
  problems: string[];
};
