import type { DraftFormat, DraftStatus, Position } from "@/lib/engine";

/** The `drafts` record, as PocketBase stores it. */
export type DraftRecord = {
  id: string;
  league: string;
  format: DraftFormat;
  status: DraftStatus;
  /** Member ids in draft order — index 0 picks first in round 1. */
  order: string[];
  rounds: number;
  current_pick: number;
  deadline: string;
  pick_seconds: number;
  seed: string;
};

/** The `picks` record, as PocketBase stores it. */
export type PickRecord = {
  id: string;
  draft: string;
  overall_no: number;
  round: number;
  slot: number;
  member: string;
  player: string;
  is_auto: boolean;
};

/** A pick with the names a board needs, resolved. */
export type BoardPick = {
  id: string;
  overallNo: number;
  round: number;
  slot: number;
  memberId: string;
  memberName: string;
  playerId: string;
  playerName: string;
  playerClub: string;
  position: Position;
  isAuto: boolean;
};
