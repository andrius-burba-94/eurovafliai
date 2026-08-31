/**
 * The engine's vocabulary.
 *
 * This module — and everything else under `src/lib/engine/` — is **pure**: zero
 * PocketBase imports, zero I/O, and no implicit clock. Time, when it matters,
 * arrives as an argument. That is not stylistic: the same functions are called
 * by server actions and by the PM2 worker, so the engine may not know which one
 * is asking (see `.claude/skills/draft-engine-invariants`).
 *
 * The types are deliberately structural rather than imported from the PocketBase
 * record shapes. A `picks` record carries far more than the engine needs, and
 * depending on its full shape would drag the database into the one module that
 * must not know about it. Callers pass the fields listed here; anything extra is
 * ignored.
 *
 * Words come from CONTEXT.md — pick, overall number, on the clock, slot, format,
 * roster template. If a name here disagrees with that file, this file is wrong.
 */

/**
 * How the order repeats across rounds.
 *
 * `keeper` lands in Phase 6 and is deliberately absent: adding it here without
 * `buildPickOrder` tests would let a format ship untested, which §5 of the
 * invariants forbids.
 */
export type DraftFormat = "linear" | "snake" | "snake3rr";

/** A player's single bucket. "Guard-Forward" listings are mapped to one of these at ingest. */
export type Position = "G" | "F" | "C";

/**
 * The shape of a legal team. Read from `leagues.settings.roster_template`,
 * never hardcoded at a call site — blueprint §10 leaves open whether 12
 * participants drop to 11-man rosters, and that must stay a settings change.
 *
 * Structurally compatible with the `RosterTemplate` in
 * `src/lib/leagues/settings.ts`, without importing it: the engine does not
 * depend on the leagues module.
 */
export type RosterTemplate = { readonly G: number; readonly F: number; readonly C: number };

/** Total roster slots, which is also the number of draft rounds. */
export function rosterSize(template: RosterTemplate): number {
  return template.G + template.F + template.C;
}

/** As much of a `players` record as the engine needs. */
export type EnginePlayer = {
  readonly id: string;
  readonly position: Position;
  /**
   * Projection used to rank the pool when a member has no cheat sheet, or has
   * exhausted it. Absent is treated as the worst possible projection rather
   * than as zero, so an unprojected player never outranks a genuinely bad one.
   */
  readonly projectedPoints?: number;
};

/** As much of a `picks` record as the engine needs. */
export type EnginePick = {
  readonly id: string;
  /** 1-based index across the whole draft, 1…(members × rounds). Unique per draft. */
  readonly overallNo: number;
  readonly memberId: string;
  readonly playerId: string;
};

/** A draft's coarse lifecycle. Distinct from `leagues.status`. */
export type DraftStatus = "setup" | "live" | "paused" | "complete";

/**
 * The authoritative draft state, as the engine needs to see it.
 *
 * `currentPick` is the server's word on whose turn it is and the engine treats
 * it as such — with one exception it must handle rather than trust, described
 * on `whoIsOnClock`.
 */
export type DraftState = {
  readonly format: DraftFormat;
  /** Draft order, already rolled: index 0 drafts first in round 1. */
  readonly memberIds: readonly string[];
  readonly rounds: number;
  /** 1-based `overall_no` of the pick currently expected. */
  readonly currentPick: number;
  readonly status: DraftStatus;
};

/**
 * A refusal that carries its reason.
 *
 * Matches `canAcceptMember` in `src/lib/leagues/settings.ts` and the lobby
 * verdicts: the caller always has to tell a human why, and a bare `false`
 * forces the message to be invented at the call site — where it drifts.
 */
export type Verdict = { readonly ok: true } | { readonly ok: false; readonly reason: string };
