/**
 * The draft engine — the heart of the app, and the most heavily tested code in
 * the repo.
 *
 * Pure TypeScript: zero PocketBase imports, zero I/O, no implicit clock. Time
 * arrives as an argument where it matters. Server actions and the PM2 worker
 * both consume this module, which is exactly why it may not know about either
 * (see `.claude/skills/draft-engine-invariants`, and `purity.test.ts`, which
 * enforces it rather than trusting it).
 *
 * What lives where:
 *
 * | file           | answers                                            |
 * |----------------|----------------------------------------------------|
 * | `roll.ts`      | the seeded shuffle that decides the member order     |
 * | `order.ts`     | who drafts at each overall number, per format       |
 * | `clock.ts`     | whose turn is it, and is the draft finished         |
 * | `legality.ts`  | may this member take this player                    |
 * | `autodraft.ts` | who does the engine pick for an absent member       |
 * | `rollback.ts`  | what does undoing to pick N delete and re-point     |
 *
 * Import from this file, not from the modules directly, so the surface stays
 * something we chose rather than something that accumulated.
 */

export type {
  DraftFormat,
  DraftState,
  DraftStatus,
  EnginePick,
  EnginePlayer,
  Position,
  RosterTemplate,
  Verdict,
} from "./types";
export { rosterSize } from "./types";

export { rollOrder } from "./roll";

export { buildPickOrder, memberAt, roundAndSlot } from "./order";

export type { OnClock } from "./clock";
export {
  findUnadvancedPick,
  isDraftComplete,
  totalPicks,
  whoIsOnClock,
} from "./clock";

export type { LegalityInput } from "./legality";
export { countByPosition, isLegalPick, openPositions } from "./legality";

export type { AutoPickInput } from "./autodraft";
export { rankForMember, selectAutoPick } from "./autodraft";

export type { Rollback, RollbackResult } from "./rollback";
export { computeRollback } from "./rollback";
