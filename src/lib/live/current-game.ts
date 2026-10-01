import type { ScheduleRow } from "@/lib/fixtures/schedule";

import type { LivePlayer } from "./boxscore";
import { gameStateOf, statLineOf, type GameState } from "./status";

/** A player's game in the round being played, as a profile shows it. */
export type CurrentGame = {
  readonly round: number;
  readonly opponent: string;
  readonly atHome: boolean;
  readonly state: GameState;
  readonly tipOff: string | null;
  /** Null until the box score or the live feed has a line for the player. */
  readonly line: {
    readonly pir: number;
    readonly fantasyTenths: number;
    readonly statLine: string;
    /** From the live feed rather than the recorded box score. */
    readonly provisional: boolean;
  } | null;
};

/** The recorded box-score columns a stat line needs. */
export type RecordedLine = {
  readonly gameCode: number;
  readonly pir: number;
  readonly fantasyTenths: number;
  readonly points: number;
  readonly rebounds: number;
  readonly assists: number;
  /** Seconds on the floor. */
  readonly timePlayed: number;
};

type Snapshot = {
  readonly game_code: number;
  readonly live: boolean;
  readonly checked_at: string;
  readonly players: readonly LivePlayer[];
};

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * The recorded box score wins over the live feed: once a game is final its
 * figures are the ones the standings counted, and the feed's are provisional.
 */
export function currentGameOf(input: {
  readonly round: number;
  readonly games: readonly ScheduleRow[];
  readonly clubCode: string;
  readonly personCode: string | undefined;
  readonly recorded: readonly RecordedLine[];
  readonly snapshots: readonly Snapshot[];
  readonly now: number;
}): CurrentGame | null {
  const game = input.games.find((row) => row.localClub === input.clubCode || row.roadClub === input.clubCode);
  if (!game) return null;
  const atHome = game.localClub === input.clubCode;
  const snapshot = input.snapshots.find((row) => row.game_code === game.gameCode);
  const state = gameStateOf({ played: game.played, snapshot, now: input.now });
  const recorded = input.recorded.find((row) => row.gameCode === game.gameCode);
  const live = input.personCode ? snapshot?.players.find((row) => row.personCode === input.personCode) : undefined;
  const line = recorded
    ? {
        pir: recorded.pir,
        fantasyTenths: recorded.fantasyTenths,
        statLine: statLineOf({
          points: recorded.points,
          rebounds: recorded.rebounds,
          assists: recorded.assists,
          pir: recorded.pir,
          minutes: recorded.timePlayed > 0 ? clock(recorded.timePlayed) : "DNP",
        }),
        provisional: false,
      }
    : live
      ? { pir: live.pir, fantasyTenths: live.fantasyTenths, statLine: statLineOf(live), provisional: true }
      : null;
  return {
    round: input.round,
    opponent: atHome ? game.roadClub : game.localClub,
    atHome,
    state,
    tipOff: game.utcDate,
    line,
  };
}
