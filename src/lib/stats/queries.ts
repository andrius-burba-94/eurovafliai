import "server-only";

import { getSession } from "@/lib/auth/session";
import { createUserClient } from "@/lib/pb/server";
import type { Position } from "@/lib/engine";
import { type Phase, PHASES } from "./csv";
import type { ImpactLine, ImpactTransaction } from "./impact";
import { recapForRound, type Recap } from "./recap";
import type { RoundSnapshot, SnapshotRow } from "./standings";

/**
 * Reads the standings cache and a player's game log with the viewer's token,
 * so PocketBase's list rules are the thing that scopes them.
 */

function asRows(raw: unknown): SnapshotRow[] {
  if (!Array.isArray(raw)) return [];
  const rows: SnapshotRow[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    if (typeof rec.memberId !== "string") continue;
    if (typeof rec.totalTenths !== "number") continue;
    if (typeof rec.roundTenths !== "number") continue;
    rows.push({
      memberId: rec.memberId,
      totalTenths: rec.totalTenths,
      roundTenths: rec.roundTenths,
    });
  }
  return rows;
}

function asPhase(raw: unknown): Phase {
  return PHASES.includes(raw as Phase) ? (raw as Phase) : "RS";
}

export async function readStandingsSnapshots(
  leagueId: string,
  season: string,
): Promise<RoundSnapshot[]> {
  const session = await getSession();
  if (!session) return [];

  const code = season.replace(/[^A-Za-z0-9]/g, "");
  const pb = createUserClient(session.token);
  const records = await pb
    .collection("standings_snapshots")
    .getFullList<{
      round: number;
      phase: string;
      table: unknown;
    }>({
      filter: `league = '${leagueId}' && season = "${code}"`,
      sort: "round",
      requestKey: null,
    });

  return records.map((record) => ({
    round: record.round,
    phase: asPhase(record.phase),
    table: asRows(record.table),
  }));
}

function asIdMap(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!Array.isArray(value)) continue;
    out[key] = value.filter((id): id is string => typeof id === "string");
  }
  return out;
}

function asTransactions(
  rows: readonly {
    id: string;
    type: string;
    from_round: number;
    players_in: unknown;
    players_out: unknown;
  }[],
): ImpactTransaction[] {
  return rows.flatMap((row) => {
    if (row.type !== "trade" && row.type !== "add" && row.type !== "drop") {
      return [];
    }
    return [
      {
        id: row.id,
        type: row.type,
        fromRound: row.from_round,
        playersIn: asIdMap(row.players_in),
        playersOut: asIdMap(row.players_out),
      },
    ];
  });
}

export type RecapPageData = {
  readonly recap: Recap;
  readonly countedRounds: readonly number[];
  readonly playerNames: Readonly<Record<string, string>>;
};

/**
 * One counted night: the snapshot for rank, windows for who owned whom,
 * box scores for the best night, deals for the swing.
 */
export async function readLeagueRecap(
  leagueId: string,
  season: string,
  requestedRound: number | null,
): Promise<RecapPageData | null> {
  const session = await getSession();
  if (!session) return null;

  const snapshots = await readStandingsSnapshots(leagueId, season);
  if (snapshots.length === 0) return null;

  const countedRounds = snapshots.map((snap) => snap.round);
  const latest = countedRounds[countedRounds.length - 1]!;
  const round =
    requestedRound !== null && countedRounds.includes(requestedRound)
      ? requestedRound
      : latest;
  const snap = snapshots.find((row) => row.round === round);
  if (!snap) return null;

  const code = season.replace(/[^A-Za-z0-9]/g, "");
  const pb = createUserClient(session.token);
  const [memberships, txRows, statRows] = await Promise.all([
    pb.collection("roster_memberships").getFullList<{
      member: string;
      player: string;
      from_round?: number | null;
      to_round?: number | null;
      to_date?: string | null;
    }>({
      filter: `league = '${leagueId}'`,
      fields: "member,player,from_round,to_round,to_date",
      requestKey: null,
    }),
    pb.collection("transactions").getFullList<{
      id: string;
      type: string;
      from_round: number;
      players_in: unknown;
      players_out: unknown;
    }>({
      filter: `league = '${leagueId}'`,
      requestKey: null,
    }),
    pb.collection("player_game_stats").getFullList<{
      player: string;
      round: number;
      fantasy_pts: number;
      pir: number;
    }>({
      filter: `season = "${code}" && round = ${round}`,
      fields: "player,round,fantasy_pts,pir",
      requestKey: null,
    }),
  ]);

  const lines: ImpactLine[] = statRows.map((row) => ({
    playerId: row.player,
    round: row.round,
    fantasyTenths: row.fantasy_pts,
    pir: row.pir,
  }));
  const recap = recapForRound(
    round,
    snap.table,
    memberships.map((row) => ({
      memberId: row.member,
      playerId: row.player,
      from_round: row.from_round,
      to_round: row.to_round,
      to_date: row.to_date,
    })),
    lines,
    asTransactions(txRows),
  );

  const nameIds = [
    ...new Set(
      [
        recap.bestNight?.playerId,
        ...(recap.biggestSwing?.inIds ?? []),
        ...(recap.biggestSwing?.outIds ?? []),
      ].filter((id): id is string => Boolean(id)),
    ),
  ];
  const playerNames: Record<string, string> = {};
  if (nameIds.length > 0) {
    const people = await pb.collection("players").getFullList<{
      id: string;
      name: string;
    }>({
      filter: nameIds.map((id) => `id = '${id}'`).join(" || "),
      fields: "id,name",
      requestKey: null,
    });
    for (const person of people) playerNames[person.id] = person.name;
  }

  return {
    recap,
    countedRounds,
    playerNames,
  };
}

export type PlayerProfile = {
  id: string;
  name: string;
  clubCode: string;
  clubName: string;
  position: Position;
  status: string;
  /** Bio from the roster feed — 9.1. Every field may be absent. */
  bio: {
    /** Centimetres. */
    height: number | null;
    /** Kilograms. */
    weight: number | null;
    /** Year of birth, the only part of the feed's date worth showing. */
    birthYear: number | null;
    country: string | null;
    dorsal: string | null;
  };
  /**
   * Last season, imported from the official stats table.
   *
   * Null when nothing has been imported for this player, which is different
   * from an average of zero and is why this is a nullable object rather than
   * a row of nullable numbers.
   */
  previousSeason: {
    season: string;
    games: number;
    /** Integer tenths. */
    pir: number;
    /** Integer tenths, and null when we never backfilled their box scores. */
    fantasy: number | null;
    points: number | null;
    rebounds: number | null;
    assists: number | null;
    minutes: number | null;
    twoPointPct: string | null;
    threePointPct: string | null;
    freeThrowPct: string | null;
  } | null;
};

/** `"1995-06-30T00:00:00"` → `1995`. Anything else is nothing. */
function birthYearOf(raw: string | undefined): number | null {
  const year = Number((raw ?? "").slice(0, 4));
  return Number.isInteger(year) && year > 1900 ? year : null;
}

function nonZero(value: number | undefined): number | null {
  return typeof value === "number" && value !== 0 ? value : null;
}

function nonEmpty(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** The json column's shape, read defensively — nothing else validates it. */
function statsField(raw: unknown, key: string): number | null {
  if (!raw || typeof raw !== "object") return null;
  const value = (raw as Record<string, unknown>)[key];
  return typeof value === "number" ? value : null;
}

function statsText(raw: unknown, key: string): string | null {
  if (!raw || typeof raw !== "object") return null;
  const value = (raw as Record<string, unknown>)[key];
  return typeof value === "string" && value !== "" ? value : null;
}

export type GameLogLine = {
  id: string;
  season: string;
  round: number;
  phase: Phase;
  clubCode: string;
  pir: number;
  fantasyTenths: number;
  gameCode: number;
};

export async function readPlayerProfile(
  playerId: string,
): Promise<{ player: PlayerProfile; log: GameLogLine[] } | null> {
  const session = await getSession();
  if (!session) return null;

  const pb = createUserClient(session.token);
  try {
    const record = await pb.collection("players").getOne<{
      id: string;
      name: string;
      club_code: string;
      club_name: string;
      position: Position;
      status: string;
      dorsal?: string;
      height?: number;
      weight?: number;
      birth_date?: string;
      country_name?: string;
      prev_season_code?: string;
      prev_season_games?: number;
      prev_season_pir?: number;
      prev_season_fantasy?: number;
      prev_season_stats?: unknown;
    }>(playerId, { requestKey: null });

    const lines = await pb.collection("player_game_stats").getFullList<{
      id: string;
      season: string;
      round: number;
      phase: string;
      club_code: string;
      pir: number;
      fantasy_pts: number;
      game_code: number;
    }>({
      filter: `player = '${playerId}'`,
      requestKey: null,
    });

    const log = [...lines]
      .sort((a, b) => {
        if (a.season !== b.season) return a.season < b.season ? -1 : 1;
        if (a.round !== b.round) return a.round - b.round;
        return a.game_code - b.game_code;
      })
      .map((row) => ({
        id: row.id,
        season: row.season,
        round: row.round,
        phase: asPhase(row.phase),
        clubCode: row.club_code,
        pir: row.pir,
        fantasyTenths: row.fantasy_pts,
        gameCode: row.game_code,
      }));

    // Games, never the average: an unset column reads as 0, so a player who
    // averaged 0.0 over thirty games and a player nobody imported would look
    // identical if this keyed off the PIR.
    const prevGames = record.prev_season_games ?? 0;
    const prevStats = record.prev_season_stats;

    return {
      player: {
        id: record.id,
        name: record.name,
        clubCode: record.club_code,
        clubName: record.club_name,
        position: record.position,
        status: record.status,
        bio: {
          height: nonZero(record.height),
          weight: nonZero(record.weight),
          birthYear: birthYearOf(record.birth_date),
          country: nonEmpty(record.country_name),
          dorsal: nonEmpty(record.dorsal),
        },
        previousSeason:
          prevGames > 0
            ? {
                season: record.prev_season_code ?? "",
                games: prevGames,
                pir: record.prev_season_pir ?? 0,
                // Fantasy points are PIR plus a win bonus, so they cannot be
                // derived from a season total — they come from our own
                // backfill, and a player we never backfilled has none.
                fantasy: nonZero(record.prev_season_fantasy),
                points: statsField(prevStats, "points"),
                rebounds: statsField(prevStats, "rebounds"),
                assists: statsField(prevStats, "assists"),
                minutes: statsField(prevStats, "minutes"),
                twoPointPct: statsText(prevStats, "twoPointPct"),
                threePointPct: statsText(prevStats, "threePointPct"),
                freeThrowPct: statsText(prevStats, "freeThrowPct"),
              }
            : null,
      },
      log,
    };
  } catch {
    return null;
  }
}
