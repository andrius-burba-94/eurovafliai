import type { Position } from "@/lib/engine";
import { gameDayOf } from "@/lib/time/local";

/**
 * Lineups, the captain, and what a night is actually worth — slice 9.3.
 *
 * Pure, and held to `src/lib/engine/`'s standard: no I/O, no clock, the caller
 * passes everything in. Three callers share it — the entry form validates
 * before it writes, `computeStandings` weighs a round with it, and the recap
 * and impact pages weigh the same way so no two surfaces disagree.
 *
 * ## Why this exists at all
 *
 * Official Draft Mode is Classic Mode without the head coach, so it keeps
 * captain ×2 and bench ×50%. Blueprint D4 cut all three as Classic-only; it
 * was right about the coach and wrong about the other two, and until this
 * module existed every standings total was a 100%-of-thirteen-players number
 * the league's own fantasy page would never print.
 *
 * ## The shape, and why the roster template is not it
 *
 * Thirteen players: 5 starters (one of them the captain), 1 sixth man,
 * 4 bench, 3 inactive. That is a *scoring* shape and it is not the roster
 * template — the roster template (5 G / 5 F / 3 C) is what the draft enforces
 * as pick legality. Conflating them would be a bug: a legal roster can be
 * arranged into many lineups, and only the lineup says who scored double.
 */

export type LineupTemplate = {
  readonly starters: number;
  readonly sixth: number;
  readonly bench: number;
  readonly inactive: number;
};

/** The official Draft Mode shape, and the league settings default. */
export const DEFAULT_LINEUP_TEMPLATE: LineupTemplate = {
  starters: 5,
  sixth: 1,
  bench: 4,
  inactive: 3,
};

/** Places in the lineup — 13 for the default, which is also the roster size. */
export function lineupSize(template: LineupTemplate): number {
  return (
    template.starters + template.sixth + template.bench + template.inactive
  );
}

export const LINEUP_ROLES = [
  "captain",
  "starter",
  "sixth",
  "bench",
  "inactive",
] as const;

export type LineupRole = (typeof LINEUP_ROLES)[number];

/**
 * The official multipliers. The captain doubles, the rest of the five and the
 * sixth man score as they played, the bench scores half, the inactive three
 * score nothing.
 */
export const ROLE_MULTIPLIERS: Readonly<Record<LineupRole, number>> = {
  captain: 2,
  starter: 1,
  sixth: 1,
  bench: 0.5,
  inactive: 0,
};

/** One vocabulary for the role, shared by the form and the chat sentence. */
export const ROLE_WORDS: Readonly<Record<LineupRole, string>> = {
  captain: "Captain",
  starter: "Starter",
  sixth: "Sixth man",
  bench: "Bench",
  inactive: "Inactive",
};

/**
 * The five starting fives the rulebook allows, as G-F-C.
 *
 * Spelled out rather than derived from "at least one of each, at most three,
 * never three centers": the list is what the rulebook prints, and a derived
 * rule that happened to admit a sixth shape would be our invention.
 */
export const FORMATIONS: readonly (readonly [number, number, number])[] = [
  [2, 2, 1],
  [1, 2, 2],
  [2, 1, 2],
  [1, 3, 1],
  [3, 1, 1],
];

export type LineupSlots = {
  readonly starters: readonly string[];
  readonly captain: string;
  readonly sixth: readonly string[];
  readonly bench: readonly string[];
  readonly inactive: readonly string[];
};

export type LineupSquadPlayer = {
  readonly playerId: string;
  readonly position: Position;
};

/** Where a round's lineup came from. `absent` is the provisional 100% round. */
export type LineupSource = "recorded" | "carried" | "absent";

/**
 * A player's role as it stood on his own game day, read by the sync that day.
 *
 * The official games lock a player when his game tips off, but a manager can
 * still move everybody else, and the captaincy, until the round's last game:
 * day 1's captain benched for a day 2 player. `slots` keeps the lineup as it
 * stands now; a frozen role is what that player actually scored as.
 */
export type FrozenRole = {
  readonly role: LineupRole;
  /** The game day it froze on, as `gameDayOf` writes it. */
  readonly day: string;
  /** When the read that froze it ran. */
  readonly at: string;
};

export type FrozenRoles = Readonly<Record<string, FrozenRole>>;

export type RecordedLineup = {
  readonly memberId: string;
  readonly round: number;
  readonly slots: LineupSlots;
  readonly roles?: FrozenRoles;
};

export type ResolvedLineup = {
  readonly memberId: string;
  readonly round: number;
  readonly source: LineupSource;
  readonly slots: LineupSlots | null;
  /** Only a recorded round has them: a carried lineup's roles froze in another round. */
  readonly roles?: FrozenRoles;
};

export type LineupAssignment = {
  readonly playerId: string;
  readonly role: LineupRole;
};

export type LineupVerdict =
  | { readonly ok: true; readonly slots: LineupSlots }
  | { readonly ok: false; readonly reason: string };

export function formationName(
  counts: readonly [number, number, number],
): string {
  return counts.join("-");
}

function countPositions(
  ids: readonly string[],
  squad: readonly LineupSquadPlayer[],
): [number, number, number] {
  const byId = new Map(squad.map((player) => [player.playerId, player.position]));
  const counts: [number, number, number] = [0, 0, 0];
  for (const id of ids) {
    const position = byId.get(id);
    if (position === "G") counts[0] += 1;
    else if (position === "F") counts[1] += 1;
    else if (position === "C") counts[2] += 1;
  }
  return counts;
}

export function isOfficialFormation(
  counts: readonly [number, number, number],
): boolean {
  return FORMATIONS.some(
    (shape) =>
      shape[0] === counts[0] && shape[1] === counts[1] && shape[2] === counts[2],
  );
}

/**
 * A place in the lineup, without the captaincy.
 *
 * The rulebook has five roles, and the captain is not a sixth place on the
 * team sheet — it is a mark on one of the five starters, which is why
 * `validateLineup` refuses a captain who is not among them. Splitting the mark
 * off the place is what lets the form offer an exclusive captain control beside
 * a four-option select without either one being able to express something the
 * validator would then have to refuse.
 */
export type PlacementRole = Exclude<LineupRole, "captain">;

export const PLACEMENT_ROLES: readonly PlacementRole[] = [
  "starter",
  "sixth",
  "bench",
  "inactive",
];

/**
 * Fold the captain's mark back into the roles the validator understands.
 *
 * The mark is ignored unless it lands on a starter. That is not leniency: it
 * keeps a stale captain — one marked before their role was changed to bench —
 * from producing "the captain has to be one of the starters", a refusal whose
 * cause is invisible in a form where nothing says "captain" any more. The form
 * clears the mark on that change too; this is the half that cannot be forgotten
 * by a future caller.
 */
export function assignmentsWithCaptain(
  placements: readonly { readonly playerId: string; readonly role: PlacementRole }[],
  captainId: string,
): LineupAssignment[] {
  return placements.map((entry) =>
    entry.role === "starter" && entry.playerId === captainId
      ? { playerId: entry.playerId, role: "captain" as const }
      : entry,
  );
}

/** The role → slots translation the entry form posts through. */
export function slotsFromRoles(
  assignments: readonly LineupAssignment[],
): LineupSlots {
  const pick = (role: LineupRole) =>
    assignments
      .filter((entry) => entry.role === role)
      .map((entry) => entry.playerId);
  const captains = pick("captain");
  return {
    starters: [...captains, ...pick("starter")],
    captain: captains[0] ?? "",
    sixth: pick("sixth"),
    bench: pick("bench"),
    inactive: pick("inactive"),
  };
}

/** The other direction, for rendering a stored lineup back into the form. */
export function rolesFromSlots(slots: LineupSlots): Map<string, LineupRole> {
  const roles = new Map<string, LineupRole>();
  for (const id of slots.starters) roles.set(id, "starter");
  for (const id of slots.sixth) roles.set(id, "sixth");
  for (const id of slots.bench) roles.set(id, "bench");
  for (const id of slots.inactive) roles.set(id, "inactive");
  if (slots.captain) roles.set(slots.captain, "captain");
  return roles;
}

function placedIds(slots: LineupSlots): string[] {
  return [
    ...slots.starters,
    ...slots.sixth,
    ...slots.bench,
    ...slots.inactive,
  ];
}

/**
 * Refuse a transcription error rather than store a wrong total.
 *
 * The starting five must be exactly full — the formation rule has no meaning
 * otherwise. The other three groups are capped rather than exact, because a
 * drop can legally leave a roster short of thirteen (5.2) and a league that
 * had lost a player would otherwise be unable to record any lineup at all.
 * Everyone on the roster that round must be placed somewhere, so nobody is
 * quietly left out of the arithmetic.
 */
export function validateLineup(input: {
  readonly slots: LineupSlots;
  readonly template: LineupTemplate;
  readonly squad: readonly LineupSquadPlayer[];
}): LineupVerdict {
  const { slots, template, squad } = input;
  const squadIds = new Set(squad.map((player) => player.playerId));

  if (squad.length === 0) {
    return { ok: false, reason: "That roster is empty for that round." };
  }
  if (squad.length < template.starters) {
    return {
      ok: false,
      reason: `A lineup needs ${template.starters} starters and that roster has ${squad.length} players.`,
    };
  }
  if (squad.length > lineupSize(template)) {
    return {
      ok: false,
      reason: `That roster has ${squad.length} players and the lineup has ${lineupSize(template)} places.`,
    };
  }

  const placed = placedIds(slots);
  const seen = new Set<string>();
  for (const id of placed) {
    if (seen.has(id)) {
      return { ok: false, reason: "A player can only hold one place." };
    }
    seen.add(id);
    if (!squadIds.has(id)) {
      return {
        ok: false,
        reason: "That lineup names a player who is not on the roster.",
      };
    }
  }

  if (slots.starters.length !== template.starters) {
    return {
      ok: false,
      reason: `Name exactly ${template.starters} starters.`,
    };
  }
  if (slots.sixth.length > template.sixth) {
    return { ok: false, reason: `There is room for ${template.sixth} sixth man.` };
  }
  if (slots.bench.length > template.bench) {
    return { ok: false, reason: `There is room for ${template.bench} on the bench.` };
  }
  if (slots.inactive.length > template.inactive) {
    return { ok: false, reason: `There is room for ${template.inactive} inactive.` };
  }
  if (placed.length !== squad.length) {
    return {
      ok: false,
      reason: "Every player on the roster needs a place in the lineup.",
    };
  }

  if (!slots.captain) {
    return { ok: false, reason: "Name a captain." };
  }
  if (!slots.starters.includes(slots.captain)) {
    return { ok: false, reason: "The captain has to be one of the starters." };
  }

  const counts = countPositions(slots.starters, squad);
  if (!isOfficialFormation(counts)) {
    return {
      ok: false,
      reason: `${formationName(counts)} is not one of the five legal formations (${FORMATIONS.map(formationName).join(", ")} as guards-forwards-centers).`,
    };
  }

  return { ok: true, slots };
}

/** Multiplier per player for one recorded lineup, frozen roles first. */
export function multipliersOf(slots: LineupSlots, roles: FrozenRoles = {}): Map<string, number> {
  const out = new Map<string, number>();
  for (const [id, role] of effectiveRoles(slots, roles)) out.set(id, ROLE_MULTIPLIERS[role]);
  return out;
}

/** Every player's role as he scored: the lineup now, with frozen roles laid over it. */
export function effectiveRoles(slots: LineupSlots, roles: FrozenRoles = {}): Map<string, LineupRole> {
  const out = rolesFromSlots(slots);
  for (const [id, frozen] of Object.entries(roles)) out.set(id, frozen.role);
  return out;
}

/**
 * The captain who counted. Frozen roles can hold two — day 1's, then the one
 * the captaincy moved to — and the first to play is the round's captain.
 */
export function effectiveCaptain(slots: LineupSlots, roles: FrozenRoles = {}): string {
  const frozen = Object.entries(roles)
    .filter(([, role]) => role.role === "captain")
    .sort(([a, x], [b, y]) => x.day.localeCompare(y.day) || a.localeCompare(b));
  return frozen[0]?.[0] ?? slots.captain;
}

/** Each player's game day this round, through his club's fixture; the earliest if it has two. */
export function playerGameDays(input: {
  readonly fixtures: readonly { readonly round: number; readonly localClub: string; readonly roadClub: string; readonly utcDate: string | null }[];
  readonly round: number;
  readonly clubOf: ReadonlyMap<string, string>;
}): Map<string, string> {
  const byClub = new Map<string, string>();
  for (const game of input.fixtures) {
    if (game.round !== input.round) continue;
    const day = gameDayOf(game.utcDate);
    if (!day) continue;
    for (const club of [game.localClub, game.roadClub]) {
      const known = byClub.get(club);
      if (!known || day < known) byClub.set(club, day);
    }
  }
  const out = new Map<string, string>();
  for (const [playerId, club] of input.clubOf) {
    const day = byClub.get(club);
    if (day) out.set(playerId, day);
  }
  return out;
}

/**
 * The roles a read freezes: every player in the lineup whose game is on the
 * read's game day or earlier, unless one froze already. One read per game day
 * is the schedule, so a late game freezes with the day's early ones; a day
 * whose read was missed freezes at the next read, which is no worse than not
 * freezing at all. A frozen role never moves.
 */
export function freezeRoles(input: {
  readonly previous: FrozenRoles | undefined;
  readonly slots: LineupSlots;
  /** Each player's game day this round; a player with no game is absent. */
  readonly gameDays: ReadonlyMap<string, string>;
  readonly readDay: string;
  readonly at: string;
}): FrozenRoles {
  const out: Record<string, FrozenRole> = { ...input.previous };
  for (const [playerId, role] of rolesFromSlots(input.slots)) {
    if (out[playerId]) continue;
    const day = input.gameDays.get(playerId);
    if (!day || day > input.readDay) continue;
    out[playerId] = { role, day, at: input.at };
  }
  return out;
}

/**
 * What each round is scored at, per member.
 *
 * Carry-forward is the default: a round with no lineup of its own inherits the
 * last one recorded before it. A round before any lineup exists is `absent` —
 * everyone scores at 100%, which the standings page strikes as provisional
 * rather than presenting as final.
 */
export function resolveLineups(input: {
  readonly recorded: readonly RecordedLineup[];
  readonly rounds: readonly number[];
  readonly memberIds: readonly string[];
}): ResolvedLineup[] {
  const rounds = [...new Set(input.rounds)].sort((a, b) => a - b);
  const out: ResolvedLineup[] = [];
  for (const memberId of [...new Set(input.memberIds)].sort()) {
    const mine = input.recorded
      .filter((row) => row.memberId === memberId)
      .sort((a, b) => a.round - b.round);
    for (const round of rounds) {
      const exact = mine.find((row) => row.round === round);
      if (exact) {
        out.push({ memberId, round, source: "recorded", slots: exact.slots, ...(exact.roles ? { roles: exact.roles } : {}) });
        continue;
      }
      const carried = [...mine].reverse().find((row) => row.round < round);
      out.push(
        carried
          ? { memberId, round, source: "carried", slots: carried.slots }
          : { memberId, round, source: "absent", slots: null },
      );
    }
  }
  return out;
}

export type LineupWeights = {
  /**
   * The multiplier for one player's round. A player the round's lineup does
   * not name — an arrival a carried lineup predates — scores at 100% rather
   * than at zero, for the same reason an absent round does: our bookkeeping
   * gap is not their bad night.
   */
  readonly multiplierFor: (
    memberId: string,
    round: number,
    playerId: string,
  ) => number;
  readonly sourceFor: (memberId: string, round: number) => LineupSource;
};

/** Everybody at 100% — what the app scored before lineups existed. */
export const FULL_WEIGHTS: LineupWeights = {
  multiplierFor: () => 1,
  sourceFor: () => "absent",
};

export function lineupWeights(
  resolved: readonly ResolvedLineup[],
): LineupWeights {
  const byKey = new Map<string, ResolvedLineup>();
  const multipliers = new Map<string, Map<string, number>>();
  for (const row of resolved) {
    const key = `${row.memberId}|${row.round}`;
    byKey.set(key, row);
    if (row.slots) multipliers.set(key, multipliersOf(row.slots, row.roles));
  }
  return {
    multiplierFor: (memberId, round, playerId) =>
      multipliers.get(`${memberId}|${round}`)?.get(playerId) ?? 1,
    sourceFor: (memberId, round) =>
      byKey.get(`${memberId}|${round}`)?.source ?? "absent",
  };
}
