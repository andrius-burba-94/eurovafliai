import { repairBasketNewsMoves } from "../src/lib/basketnews/repair";
import { arg, flag, superuserFromEnv } from "./lib/pb.mjs";

const leagueId = arg("league");
const rounds = (arg("rounds") ?? "").split(",").map(Number).filter((round) => Number.isInteger(round) && round >= 2);
if (!leagueId || !/^[a-z0-9]{15}$/.test(leagueId) || !rounds.length) throw new Error("Use --league=<league id> --rounds=4,5,6,7. Dry run by default; --write applies verified history only.");
const pb = await superuserFromEnv();
for (const round of rounds) {
  const result = await repairBasketNewsMoves({ pb, leagueId, round, write: flag("write") });
  console.log(`Round ${round}: ${result.status}. ${result.message}`);
  if (result.status === "blocked") process.exitCode = 1;
}
