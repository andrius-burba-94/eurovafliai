/**
 * Read the injury and transfer pages by hand — one pass, now.
 *
 *   npm run news:sync            # read both views, store what changed
 *   npm run news:sync -- --dry   # read and print, write nothing
 *
 * The worker does this hourly on its own (slice 9.4) and this script runs
 * **the same `ingestNews`** — not a second implementation. It exists for the
 * two cases a timer is bad at: filling the board the hour before a draft, and
 * checking after a deploy that the box can reach the source at all.
 *
 * `--dry` is here because this is the one importer whose source can change
 * shape without telling anybody. It prints what the pages say and what the
 * pass would do, and writes nothing.
 *
 * Plain Node, so it builds its own PocketBase client from `parseServerEnv`
 * rather than importing `src/lib/pb/superuser` — that module pulls in
 * `server-only`, which throws outside a React Server Component graph
 * (AGENTS.md).
 */
import PocketBase from "pocketbase";

import { parseServerEnv } from "../src/lib/config/schema";
import { ingestNews, summariseNews } from "../src/lib/news/ingest";
import { describeNewsPlan, planNewsImport } from "../src/lib/news/items";
import { fetchRotowireNews } from "../src/lib/news/rotowire";
import { readNewsPlayers, readStoredNews } from "../src/lib/news/store";

const env = parseServerEnv(process.env);
const dry = process.argv.includes("--dry");

const pb = new PocketBase(env.PB_INTERNAL_URL);
await pb
  .collection("_superusers")
  .authWithPassword(env.PB_SUPERUSER_EMAIL, env.PB_SUPERUSER_PASSWORD);

if (dry) {
  const { items, problems } = await fetchRotowireNews({
    onProgress: (message) => console.log(`  … ${message}`),
  });
  const [stored, players] = await Promise.all([
    readStoredNews(pb),
    readNewsPlayers(pb),
  ]);
  const plan = planNewsImport({
    scraped: items,
    stored,
    players,
    now: new Date(),
  });

  for (const item of items) {
    const where = plan.unmatched.some((row) => row.slug === item.slug)
      ? "UNMATCHED"
      : "";
    console.log(
      `  ${item.published || "no date"}  ${item.name} — ${item.headline}` +
        `${item.bodyPart ? ` (${item.bodyPart})` : ""}${where ? `  ${where}` : ""}`,
    );
  }
  console.log(`\nWould: ${describeNewsPlan(plan)}`);
  for (const change of plan.statusChanges) {
    console.log(`  would mark ${change.playerName} ${change.to}`);
  }
  for (const problem of problems) console.log(`  ! ${problem}`);
  console.log("\nNothing was written (--dry).");
} else {
  const report = await ingestNews({
    pb,
    log: (message) => console.log(`  … ${message}`),
  });
  console.log(`\n${summariseNews(report)}`);
  for (const problem of report.problems) console.log(`  ! ${problem}`);
  if (report.unmatched > 0) {
    console.log(
      `\n${report.unmatched} published name(s) match nobody in the pool. Answer them at /players/mapping.`,
    );
  }
}
