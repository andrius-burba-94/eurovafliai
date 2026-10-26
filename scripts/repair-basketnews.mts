import PocketBase from "pocketbase";
import { parseServerEnv } from "../src/lib/config/schema";
import { repairBasketNewsMoves } from "../src/lib/basketnews/repair";

const env = parseServerEnv(process.env);
const arg = (name: string) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const leagueId = arg("league");
const rounds = (arg("rounds") ?? "").split(",").map(Number).filter((round) => Number.isInteger(round) && round >= 2);
if (!leagueId || !/^[a-z0-9]{15}$/.test(leagueId) || !rounds.length) throw new Error("Use --league=<league id> --rounds=4,5,6,7. Dry run by default; --write applies verified history only.");
const pb = new PocketBase(env.PB_INTERNAL_URL);
await pb.collection("_superusers").authWithPassword(env.PB_SUPERUSER_EMAIL, env.PB_SUPERUSER_PASSWORD);
for (const round of rounds) {
  const result = await repairBasketNewsMoves({ pb, leagueId, round, write: process.argv.includes("--write") });
  console.log(`Round ${round}: ${result.status}. ${result.message}`);
  if (result.status === "blocked") process.exitCode = 1;
}
