/**
 * What one import would do, worked out before anything is written.
 *
 * Pure: no PocketBase, no I/O, no clock. This is the module the commissioner's
 * preview renders and the module `roster_imports` stores the output of, so an
 * import is auditable and re-appliable whether or not it was applied
 * (blueprint D8).
 *
 * The rules here are the ones that prevent data loss, and every one of them is
 * a test in `diff.test.ts`:
 *
 * - match by **person code** when both sides have one, else by
 *   **normalized name + club**. Codes are the identity; 13% of E2026 players do
 *   not have one yet, so the fallback is the common path, not an edge case.
 * - an import **never nulls an existing person code**, and never replaces one
 *   code with a different one — a stats join in Phase 4 depends on it.
 * - a **locked** player is untouchable by either source, including being marked
 *   as having left.
 * - an incoming `active` may revive someone who **left**, but never overwrites a
 *   more specific local status like `injured`: the API has no injury feed, so
 *   every sync would otherwise quietly heal the squad.
 * - a player the source no longer lists is marked `left`, **never deleted** —
 *   picks, cheat sheets, memberships and stats all reference player ids.
 */
import type {
  ExistingPlayer,
  NormalizedPlayer,
  PlayerChange,
  PlayerStatus,
  RosterDiff,
} from "./types";

/** Statuses that carry local knowledge an ingest cannot have. */
const LOCAL_STATUSES: PlayerStatus[] = ["injured", "doubtful"];

/**
 * Fields an import may change. `source` is deliberately absent: it records who
 * wrote the row last, so diffing it would mark every row as changed the first
 * time the other front door ran. The apply step sets it.
 */
const COMPARED = [
  "name",
  "name_normalized",
  "club_code",
  "club_name",
  "position",
  "dorsal",
] as const;

const nameClubKey = (row: { name_normalized: string; club_code: string }) =>
  `${row.name_normalized}|${row.club_code}`;

export function diffRosters({
  current,
  incoming,
}: {
  current: ExistingPlayer[];
  incoming: NormalizedPlayer[];
}): RosterDiff {
  const byCode = new Map<string, ExistingPlayer>();
  const byNameClub = new Map<string, ExistingPlayer>();
  for (const player of current) {
    if (player.person_code) byCode.set(player.person_code, player);
    byNameClub.set(nameClubKey(player), player);
  }

  const diff: RosterDiff = {
    adds: [],
    changes: [],
    leaving: [],
    blocked: [],
    problems: [],
  };

  const matched = new Set<string>();
  const seen = new Set<string>();

  for (const row of incoming) {
    const key = row.person_code
      ? `code:${row.person_code}`
      : `nc:${nameClubKey(row)}`;
    if (seen.has(key)) {
      diff.problems.push(
        `${row.name} (${row.club_code}) appears twice in this import — the second row was ignored.`,
      );
      continue;
    }
    seen.add(key);

    // Code first, then name+club. The fallback still runs when the row HAS a
    // code that nothing matches: that is how a code gets filled in on a player
    // who was imported without one.
    const match =
      (row.person_code ? byCode.get(row.person_code) : undefined) ??
      byNameClub.get(nameClubKey(row));

    if (!match) {
      diff.adds.push(row);
      continue;
    }

    matched.add(match.id);

    if (
      row.person_code &&
      match.person_code &&
      row.person_code !== match.person_code
    ) {
      // Two different codes on a name+club match means the match itself is
      // suspect — a namesake, or a feed error. Refuse rather than corrupt
      // whichever player is real.
      diff.problems.push(
        `${match.name} (${match.club_code}) is stored with person code ${match.person_code} but this import says ${row.person_code}. ` +
          "Left alone: resolve it by hand.",
      );
      continue;
    }

    const fields: PlayerChange["fields"] = {};
    const before: Record<string, unknown> = {};

    // Generic rather than a cast: it keeps the key and its value type tied
    // together, so a field added to COMPARED cannot be assigned the wrong type.
    const record = <K extends (typeof COMPARED)[number]>(field: K): void => {
      fields[field] = row[field];
      before[field] = match[field];
    };

    for (const field of COMPARED) {
      if (row[field] !== match[field]) record(field);
    }

    // A code is only ever filled in, never blanked and never swapped.
    if (row.person_code && !match.person_code) {
      fields.person_code = row.person_code;
      before.person_code = null;
    }

    // `left` → `active` is a return and the source is the authority on it.
    // Anything more specific than `active` stays.
    if (
      row.status !== match.status &&
      !(row.status === "active" && LOCAL_STATUSES.includes(match.status))
    ) {
      fields.status = row.status;
      before.status = match.status;
    }

    const changedFields = Object.keys(fields);
    if (changedFields.length === 0) continue;

    if (match.manual_lock) {
      diff.blocked.push({
        id: match.id,
        name: match.name,
        fields: changedFields,
      });
      continue;
    }

    diff.changes.push({ id: match.id, name: match.name, fields, before });
  }

  for (const player of current) {
    if (matched.has(player.id) || player.status === "left") continue;
    if (player.manual_lock) {
      diff.blocked.push({
        id: player.id,
        name: player.name,
        fields: ["status"],
      });
      continue;
    }
    diff.leaving.push({
      id: player.id,
      name: player.name,
      club_code: player.club_code,
    });
  }

  return diff;
}

/**
 * How much of the pool an import would empty.
 *
 * A partial sheet is the CSV path's sharpest edge: every player missing from it
 * is "leaving", so a file with one line marks the other 323 as departed. That is
 * correct behaviour for a complete roster and a catastrophe for an incomplete
 * one — and the source that gets used in the 24 hours before the draft is
 * exactly the hand-made one most likely to be incomplete.
 *
 * This happened during development: a one-line test CSV marked 324 players as
 * left. Nothing was lost, because departures are a status and never a deletion
 * and the next sync revived all of them — but "the undo worked" is not a reason
 * to leave the trapdoor open.
 *
 * So beyond a threshold the caller must confirm. A quarter is deliberately low:
 * a real roster refresh changes a handful of players, and twenty clubs dropping
 * a quarter of their squads at once is not a thing that happens.
 */
export const DEPARTURE_ALARM_SHARE = 0.25;

export function assessDepartures(
  diff: RosterDiff,
  currentCount: number,
): { count: number; share: number; alarming: boolean } {
  const count = diff.leaving.length;
  const share = currentCount > 0 ? count / currentCount : 0;
  return { count, share, alarming: share > DEPARTURE_ALARM_SHARE };
}
