/**
 * Read named rounds' lineups from the official Fantasy Challenge.
 *
 *   npm run lineups:sync -- --rounds=1,2
 *   npm run lineups:sync -- --rounds=2 --league=<league id>
 *
 * The worker already does this on its own schedule, including once after each
 * round closes. This is the repair: a round whose lineups changed after that
 * pass, or a local database brought in line with the official game. Every
 * linked league in season unless `--league` names one.
 */
import { syncRoundLineups } from "../src/lib/fantasy/store";
import { arg, env, superuserFromEnv } from "./lib/pb.mjs";

const rounds = (arg("rounds") ?? "")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value > 0);
if (rounds.length === 0) {
  console.error("Name the rounds: npm run lineups:sync -- --rounds=1,2");
  process.exit(1);
}
const token = env.FANTASY_CHALLENGE_TOKEN;
if (!token) {
  console.error("FANTASY_CHALLENGE_TOKEN is not set.");
  process.exit(1);
}

const pb = await superuserFromEnv();

const only = arg("league");
const leagues = await pb.collection("leagues").getFullList<{ id: string; name: string }>({
  filter: only ? `id = '${only}'` : "status = 'season' && fantasy_league_id != ''",
  fields: "id,name",
  requestKey: null,
});
if (leagues.length === 0) {
  console.error("No linked league in season to sync.");
  process.exit(1);
}

let failed = 0;
for (const league of leagues) {
  for (const round of rounds) {
    const run = await syncRoundLineups({
      pb,
      leagueId: league.id,
      token,
      season: env.EUROLEAGUE_SEASON,
      round,
      now: new Date(),
    });
    console.log(`${league.name} · round ${round} · ${run.status} · ${run.message}`);
    for (const move of run.moves) console.log(`  ${move}`);
    if (run.status === "failed") failed += 1;
  }
}
process.exit(failed > 0 ? 1 : 0);
