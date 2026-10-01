import { describe, expect, it } from "vitest";

import type { ScheduleRow } from "@/lib/fixtures/schedule";

import type { LivePlayer } from "./boxscore";
import { currentGameOf, type RecordedLine } from "./current-game";

const NOW = Date.parse("2026-10-08T19:30:00Z");

function game(over: Partial<ScheduleRow> = {}): ScheduleRow {
  return {
    gameCode: 21,
    round: 3,
    played: false,
    localClub: "OLY",
    roadClub: "PAN",
    localScore: 0,
    roadScore: 0,
    utcDate: "2026-10-08T18:00:00Z",
    ...over,
  };
}

function livePlayer(over: Partial<LivePlayer> = {}): LivePlayer {
  return {
    personCode: "P001",
    clubCode: "PAN",
    points: 12,
    assists: 3,
    rebounds: 5,
    pir: 15,
    fantasyTenths: 165,
    minutes: "21:40",
    playing: true,
    ...over,
  };
}

const recorded: RecordedLine = {
  gameCode: 21,
  pir: 18,
  fantasyTenths: 198,
  points: 14,
  rebounds: 6,
  assists: 2,
  timePlayed: 1510,
};

describe("currentGameOf", () => {
  it("is nothing when the player's club has no game this round", () => {
    expect(
      currentGameOf({ round: 3, games: [game()], clubCode: "RMB", personCode: "P001", recorded: [], snapshots: [], now: NOW }),
    ).toBeNull();
  });

  it("names the opponent and the venue from the player's side", () => {
    const away = currentGameOf({ round: 3, games: [game()], clubCode: "PAN", personCode: "P001", recorded: [], snapshots: [], now: NOW });
    expect(away).toMatchObject({ opponent: "OLY", atHome: false, state: "scheduled", tipOff: "2026-10-08T18:00:00Z", line: null });
    const home = currentGameOf({ round: 3, games: [game()], clubCode: "OLY", personCode: "P001", recorded: [], snapshots: [], now: NOW });
    expect(home).toMatchObject({ opponent: "PAN", atHome: true });
  });

  it("reads the live feed by person code while the game is on", () => {
    const current = currentGameOf({
      round: 3,
      games: [game()],
      clubCode: "PAN",
      personCode: "P001",
      recorded: [],
      snapshots: [{ game_code: 21, live: true, checked_at: "2026-10-08T19:29:00Z", players: [livePlayer(), livePlayer({ personCode: "P002", pir: 40 })] }],
      now: NOW,
    });
    expect(current?.state).toBe("live");
    expect(current?.line).toEqual({
      pir: 15,
      fantasyTenths: 165,
      statLine: "12 PTS · 5 REB · 3 AST · PIR 15 · 21:40",
      provisional: true,
    });
  });

  it("prefers the recorded box score once there is one", () => {
    const current = currentGameOf({
      round: 3,
      games: [game({ played: true })],
      clubCode: "PAN",
      personCode: "P001",
      recorded: [recorded],
      snapshots: [{ game_code: 21, live: false, checked_at: "2026-10-08T19:29:00Z", players: [livePlayer()] }],
      now: NOW,
    });
    expect(current?.state).toBe("final");
    expect(current?.line).toEqual({
      pir: 18,
      fantasyTenths: 198,
      statLine: "14 PTS · 6 REB · 2 AST · PIR 18 · 25:10",
      provisional: false,
    });
  });

  it("says DNP for a recorded line with no minutes", () => {
    const current = currentGameOf({
      round: 3,
      games: [game({ played: true })],
      clubCode: "PAN",
      personCode: "P001",
      recorded: [{ ...recorded, timePlayed: 0 }],
      snapshots: [],
      now: NOW,
    });
    expect(current?.line?.statLine).toBe("DNP");
  });

  it("ignores a recorded line from another game and a player with no person code", () => {
    const current = currentGameOf({
      round: 3,
      games: [game()],
      clubCode: "PAN",
      personCode: undefined,
      recorded: [{ ...recorded, gameCode: 7 }],
      snapshots: [{ game_code: 21, live: true, checked_at: "2026-10-08T19:29:00Z", players: [livePlayer()] }],
      now: NOW,
    });
    expect(current?.line).toBeNull();
  });
});
