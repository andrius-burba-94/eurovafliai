/**
 * Re-record stored rounds' synced moves from the official Fantasy Challenge log.
 *
 *   npm run moves:repair -- --rounds=4                  # what would change
 *   npm run moves:repair -- --rounds=1,2,3,4 --write    # change it
 *   npm run moves:repair -- --rounds=4 --league=<league id> --write
 *
 * Rounds synced before the sync read the log were planned from roster
 * differences, which credit a player traded and released between two passes
 * to the team that traded him. This rewrites only the round's synced
 * `transactions` rows; roster windows are already right and are not touched.
 * Every linked league in season unless `--league` names one.
 */
import { repairRoundMoves } from "../src/lib/fantasy/store";
import { arg, env, flag, superuserFromEnv } from "./lib/pb.mjs";

const write = flag("write");

const rounds = (arg("rounds") ?? "")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value > 0);
if (rounds.length === 0) {
  console.error("Name the rounds: npm run moves:repair -- --rounds=4");
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
  console.error("No linked league in season to repair.");
  process.exit(1);
}

for (const league of leagues) {
  for (const round of rounds) {
    const result = await repairRoundMoves({ pb, leagueId: league.id, token, round, now: new Date(), write });
    console.log(`${league.name} · round ${round} · ${result.status}`);
    for (const note of result.added) console.log(`  + ${note}`);
    for (const note of result.removed) console.log(`  - ${note}`);
  }
}
if (!write) console.log("Dry run: nothing was written. Add --write to apply.");
