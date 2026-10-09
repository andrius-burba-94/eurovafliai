/**
 * Fill in who started each stored game — slice 7.0.
 *
 *   npm run stats:starters                    # this season
 *   npm run stats:starters -- --season=E2025
 *
 * New box scores carry the starting five from the day the field landed; this
 * is the one-off for the games stored before it. It re-reads each stored game
 * from the feed (politely, one at a time) and writes `started` alone — never
 * the rest of the line, so a box score the feed has corrected since cannot
 * move fantasy points behind the standings' back.
 *
 * Idempotent and resumable: a game whose rows all know their start is not
 * fetched again, and a row is written only when the feed disagrees with it.
 */
import PocketBase from "pocketbase";

import { parseServerEnv } from "../src/lib/config/schema";
import { fetchGameBoxScores, fetchSeasonSchedule } from "../src/lib/stats/euroleague";
import { planStarterBackfill } from "../src/lib/stats/starters";
import { readExistingStats, readStatPlayers } from "../src/lib/stats/store";

const env = parseServerEnv(process.env);
const season =
  process.argv.find((value) => value.startsWith("--season="))?.split("=")[1] ?? env.EUROLEAGUE_SEASON;
if (!/^E\d{4}$/.test(season)) throw new Error(`--season must look like E2026, not ${season}`);

const pb = new PocketBase(env.PB_INTERNAL_URL);
await pb.collection("_superusers").authWithPassword(env.PB_SUPERUSER_EMAIL, env.PB_SUPERUSER_PASSWORD);

const schedule = await fetchSeasonSchedule({ season });
const played = schedule.filter((game) => game.played);
const BATCH = 40;

let fetched = 0;
let written = 0;
const problems: string[] = [];

for (let start = 0; start < played.length; start += BATCH) {
  const games = played.slice(start, start + BATCH);
  const existing = await readExistingStats(
    pb,
    season,
    games.map((game) => game.gameCode),
  );
  const unknown = new Set(existing.filter((row) => (row.started ?? "") === "").map((row) => row.game_code));
  const due = games.filter((game) => unknown.has(game.gameCode));
  if (due.length === 0) continue;

  const result = await fetchGameBoxScores({ season, games: due });
  fetched += result.fetched.length;
  problems.push(...result.failed);

  const updates = planStarterBackfill({
    rows: result.fetched.flatMap((game) => game.rows),
    players: await readStatPlayers(pb),
    existing,
  });
  for (const update of updates) {
    await pb.collection("player_game_stats").update(update.id, { started: update.started }, { requestKey: null });
    written += 1;
  }
  console.log(`  … ${Math.min(start + BATCH, played.length)}/${played.length} games checked, ${written} rows written`);
}

console.log(`starters · ${season} · ${fetched} game(s) read · ${written} row(s) written`);
for (const problem of problems) console.log(`  ! ${problem}`);
