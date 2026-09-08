/**
 * Regenerate the golden box-score fixture from the live Euroleague feed.
 *
 *     npm run stats:golden           # rewrite the committed fixture
 *     npm run stats:golden -- --check  # fetch and compare, writing nothing
 *
 * `src/lib/stats/fixtures/e2025-boxscores.json` is the evidence that
 * `scoreGame` computes the same PIR the Euroleague publishes. Committing it
 * means the suite runs offline and in CI; this script is how it is produced,
 * and `--check` is how you find out whether the feed still agrees with what we
 * committed. Nothing in the app imports this file.
 *
 * The games are fixed rather than sampled: seven of them across rounds 1, 5,
 * 14, 20 and 30, chosen because between them they contain fifteen negative PIR
 * lines, eight of those on a win — the edge blueprint open question 3 is about —
 * and several did-not-play lines. A random sample would sometimes contain none
 * of that and the suite would silently get weaker.
 */
import { writeFileSync, readFileSync } from "node:fs";

const BASE = "https://api-live.euroleague.net/v2/competitions/E/seasons";
const SEASON = "E2025";
const GAMES = [1, 2, 3, 50, 137, 200, 300];
const OUT = new URL(
  "../src/lib/stats/fixtures/e2025-boxscores.json",
  import.meta.url,
);

/** The fields the fixture keeps. Everything else the feed sends is dropped. */
const FIELDS = [
  "timePlayed",
  "points",
  "fieldGoalsMade2",
  "fieldGoalsAttempted2",
  "fieldGoalsMade3",
  "fieldGoalsAttempted3",
  "freeThrowsMade",
  "freeThrowsAttempted",
  "offensiveRebounds",
  "defensiveRebounds",
  "totalRebounds",
  "assistances",
  "steals",
  "turnovers",
  "blocksFavour",
  "blocksAgainst",
  "foulsCommited",
  "foulsReceived",
  "plusMinus",
] as const;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The feed's shape, as far as this script reads it — written out rather than
 * left as `any`, because these are the paths the fixture's correctness depends
 * on and a rename upstream should be a compile error here rather than a file
 * full of `undefined`.
 */
type Side = {
  club: { code: string };
  score: number;
  players: { player: { person: { code: string; alias: string } }; stats: Stats }[];
};
type Stats = Record<(typeof FIELDS)[number] | "valuation", number>;
type GameMeta = {
  gameCode: number;
  round: number;
  played: boolean;
  utcDate: string;
  phaseType: { code: string };
  local: Pick<Side, "club" | "score">;
  road: Pick<Side, "club" | "score">;
};
type GameStats = { local: Pick<Side, "players">; road: Pick<Side, "players"> };

async function getJson<T>(url: string): Promise<T> {
  // The feed rate-limits somewhere past ~100 requests in a few minutes (see
  // docs/research/euroleague-api.md). Fourteen requests with a gap is nowhere
  // near it, and the retry is here for a gateway blip rather than for volume.
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
    });
    if (response.ok) return (await response.json()) as T;
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 4) {
      throw new Error(`${url} answered ${response.status}`);
    }
    const wait = 1000 * 2 ** (attempt - 1);
    console.log(`  ${response.status} — waiting ${wait / 1000}s`);
    await sleep(wait);
  }
  throw new Error("unreachable");
}

const games = [];

for (const gameCode of GAMES) {
  const meta = await getJson<GameMeta>(`${BASE}/${SEASON}/games/${gameCode}`);
  await sleep(200);
  const box = await getJson<GameStats>(
    `${BASE}/${SEASON}/games/${gameCode}/stats`,
  );
  await sleep(200);

  if (!meta.played) {
    throw new Error(
      `Game ${gameCode} reports played: false — an unplayed game answers 200 with an empty box score, which would make a fixture of nothing.`,
    );
  }

  const localScore = meta.local.score;
  const roadScore = meta.road.score;
  if (localScore === roadScore) {
    throw new Error(
      `Game ${gameCode} is level at ${localScore}, which cannot be.`,
    );
  }

  const rows = [];
  for (const [side, own, other] of [
    ["local", localScore, roadScore],
    ["road", roadScore, localScore],
  ] as const) {
    for (const entry of box[side].players) {
      const stats = entry.stats;
      rows.push({
        personCode: entry.player.person.code,
        name: entry.player.person.alias,
        club: meta[side].club.code,
        won: own > other,
        // The Euroleague's own PIR. The whole point of the fixture.
        valuation: Math.round(stats.valuation),
        stats: Object.fromEntries(
          FIELDS.map((field) => [field, Math.round(stats[field])]),
        ),
      });
    }
  }

  console.log(
    `game ${gameCode}: round ${meta.round} ${meta.phaseType.code} — ` +
      `${meta.local.club.code} ${localScore}–${roadScore} ${meta.road.club.code}, ${rows.length} lines`,
  );

  games.push({
    gameCode: meta.gameCode,
    round: meta.round,
    phase: meta.phaseType.code,
    localClub: meta.local.club.code,
    localScore,
    roadClub: meta.road.club.code,
    roadScore,
    date: meta.utcDate,
    rows,
  });
}

const fixture = {
  _: "Real E2025 box scores. `valuation` is the Euroleague's own published PIR and is what scoring.golden.test.ts asserts against. Do not hand-edit: regenerate with `npm run stats:golden`.",
  season: SEASON,
  fetchedAt: new Date().toISOString().slice(0, 10),
  source: `${BASE}/${SEASON}/games/{gameCode}/stats`,
  games,
};

const text = `${JSON.stringify(fixture, null, 1)}\n`;
const rows = games.reduce((total, game) => total + game.rows.length, 0);

if (process.argv.includes("--check")) {
  const committed = JSON.parse(readFileSync(OUT, "utf8"));
  // `fetchedAt` moves every run and is not a fact about the games.
  const same =
    JSON.stringify(committed.games) === JSON.stringify(fixture.games);
  console.log(
    same
      ? `\nThe feed still agrees with the committed fixture — ${rows} lines across ${games.length} games.`
      : "\nThe feed DISAGREES with the committed fixture. Read the diff before regenerating: either a box score was amended, or the feed's shape changed.",
  );
  process.exit(same ? 0 : 1);
}

writeFileSync(OUT, text);
console.log(
  `\nWrote ${rows} lines across ${games.length} games to ${OUT.pathname}.`,
);
