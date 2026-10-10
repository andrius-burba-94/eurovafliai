import type PocketBase from "pocketbase";

import { scheduleRowsFrom, type FixtureRecord } from "@/lib/fixtures/store";
import { previousSeasonOf } from "@/lib/stats/seasons";

import { outlooksFor, type AdvisorLine, type PlayerOutlook, type Ruleset, type SeasonInput } from "./outlook";

/**
 * Outlooks, stored — slice 7.2 E. Framework-free: the worker runs it each pass.
 *
 * One row per (season, ruleset, player), recomputed from every stored line and
 * fixture and written only where it changed. A pass that dies halfway leaves
 * each row old or new, never mixed, and the next pass compares everything
 * again, so it finishes the job. unique(season, ruleset, player) is the
 * backstop for two passes racing.
 */

type LeagueRow = { id: string; basketnews_team_id?: string };
type PlayerRow = { id: string; club_code?: string };
type StatRow = {
  player: string;
  club_code: string;
  round: number;
  game_code: number;
  time_played?: number;
  pir?: number;
  basketnews_raw_pts?: number;
  team_score?: number;
  opponent_score?: number;
  started?: string;
};
type OutlookRow = {
  id: string;
  player: string;
  outlook_5?: number;
  outlook_10?: number;
  outlook_15?: number;
  games_ahead?: number;
  role?: string;
  games_in_role?: number;
  base_source?: string;
  run_5?: string;
  run_10?: string;
  run_15?: string;
};

export type OutlookRefresh = {
  readonly rulesets: Ruleset[];
  readonly written: number;
  readonly unchanged: number;
};

const code = (season: string) => season.replace(/[^A-Za-z0-9]/g, "");

/** The rulesets the leagues in season score in. Every unlinked or Fantasy Challenge league plays the EuroLeague's. */
async function rulesetsInUse(pb: PocketBase): Promise<Ruleset[]> {
  const leagues = await pb.collection("leagues").getFullList<LeagueRow>({
    filter: "status = 'season'",
    fields: "id,basketnews_team_id",
    requestKey: null,
  });
  const used = new Set(leagues.map((league): Ruleset => (league.basketnews_team_id ? "basketnews" : "euroleague")));
  return (["euroleague", "basketnews"] as const).filter((ruleset) => used.has(ruleset));
}

async function readSeason(pb: PocketBase, season: string, regularOnly: boolean): Promise<SeasonInput> {
  const phase = regularOnly ? ` && phase = "RS"` : "";
  const [fixtures, stats] = await Promise.all([
    pb.collection("fixtures").getFullList<FixtureRecord>({ filter: `season = "${code(season)}"${phase}`, requestKey: null }),
    pb.collection("player_game_stats").getFullList<StatRow>({
      filter: `season = "${code(season)}"${phase}`,
      fields: "player,club_code,round,game_code,time_played,pir,basketnews_raw_pts,team_score,opponent_score,started",
      requestKey: null,
    }),
  ]);
  const lines: AdvisorLine[] = stats.map((row) => ({
    player: row.player,
    club: row.club_code,
    round: row.round,
    gameCode: row.game_code,
    seconds: row.time_played ?? 0,
    pir: row.pir ?? 0,
    modernHundredths: row.basketnews_raw_pts ?? 0,
    won: (row.team_score ?? 0) > (row.opponent_score ?? 0),
    started: row.started === "yes" ? true : row.started === "no" ? false : null,
  }));
  return { lines, schedule: scheduleRowsFrom(fixtures) };
}

function fieldsOf(outlook: PlayerOutlook) {
  const [five, ten, fifteen] = outlook.next;
  const [run5, run10, run15] = outlook.runs;
  return {
    outlook_5: five ?? 0,
    outlook_10: ten ?? 0,
    outlook_15: fifteen ?? 0,
    games_ahead: outlook.gamesAhead,
    role: outlook.role,
    games_in_role: outlook.gamesInRole,
    base_source: outlook.baseSource,
    run_5: run5 ?? "",
    run_10: run10 ?? "",
    run_15: run15 ?? "",
  };
}

function same(stored: OutlookRow, fields: ReturnType<typeof fieldsOf>): boolean {
  return (Object.keys(fields) as (keyof typeof fields)[]).every(
    (key) => (stored[key] ?? (typeof fields[key] === "number" ? 0 : "")) === fields[key],
  );
}

export async function refreshOutlooks(
  pb: PocketBase,
  { season, now }: { season: string; now: Date },
): Promise<OutlookRefresh> {
  const rulesets = await rulesetsInUse(pb);
  if (rulesets.length === 0) return { rulesets, written: 0, unchanged: 0 };

  const previous = previousSeasonOf(season);
  const [players, current, last] = await Promise.all([
    pb.collection("players").getFullList<PlayerRow>({ fields: "id,club_code", requestKey: null }),
    readSeason(pb, season, false),
    previous ? readSeason(pb, previous, true) : Promise.resolve({ lines: [], schedule: [] }),
  ]);
  const clubbed = players.flatMap((player) => (player.club_code ? [{ id: player.id, club: player.club_code }] : []));

  let written = 0;
  let unchanged = 0;
  for (const ruleset of rulesets) {
    const stored = await pb.collection("player_outlooks").getFullList<OutlookRow>({
      filter: `season = "${code(season)}" && ruleset = "${ruleset}"`,
      requestKey: null,
    });
    const byPlayer = new Map(stored.map((row) => [row.player, row]));
    for (const outlook of outlooksFor({ ruleset, players: clubbed, current, last })) {
      const fields = fieldsOf(outlook);
      const existing = byPlayer.get(outlook.player);
      if (existing && same(existing, fields)) {
        unchanged += 1;
        continue;
      }
      const body = { ...fields, computed_at: now.toISOString() };
      if (existing) {
        await pb.collection("player_outlooks").update(existing.id, body, { requestKey: null });
      } else {
        await pb
          .collection("player_outlooks")
          .create({ ...body, season: code(season), ruleset, player: outlook.player }, { requestKey: null });
      }
      written += 1;
    }
  }
  return { rulesets, written, unchanged };
}
