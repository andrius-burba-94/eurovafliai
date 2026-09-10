import { expect, test } from "@playwright/test";

import {
  cleanupTestData,
  createLeagueFor,
  createPlayer,
  createTestUser,
  signIn,
  superuser,
  TEST_CLUB,
} from "./helpers/session";
import { expectNotFound } from "./helpers/not-found";

/**
 * Importing box scores — slice 4.1.
 *
 * `player_game_stats` is app-global, like the pool it hangs off, so every spec
 * here plants its own player with its own person code and asserts on **that
 * player's** stored rows. Nothing asserts on the season-wide counts the page
 * shows, because a sibling spec importing at the same moment moves them — the
 * same trap `sweepOnce` and the cheat-sheet fixture both taught.
 *
 * `stat_imports` rows are deliberately left behind: they are an append-only
 * audit log, which is the whole point of them, and a spec that deleted every
 * batch would pull the history out from under a sibling exactly as the chat
 * fixture once did.
 */

const HEADER =
  "personCode,gameCode,round,clubCode,teamScore,opponentScore,points," +
  "fieldGoalsMade2,fieldGoalsAttempted2,fieldGoalsMade3,fieldGoalsAttempted3," +
  "freeThrowsMade,freeThrowsAttempted,totalRebounds,assistances,steals," +
  "turnovers,blocksFavour,blocksAgainst,foulsCommited,foulsReceived,valuation";

/** 7 points, 3 rebounds, 2 assists, 1 blocked, 2 fouls, 2 drawn → PIR 3. */
const line = (
  personCode: string,
  gameCode: number,
  { won = true, points = 7 }: { won?: boolean; points?: number } = {},
) => {
  const pir = points - 4; // 3 reb + 2 ast + 2 drawn − 4 missed − 1 blocked − 2 fouls
  return [
    personCode,
    gameCode,
    1,
    TEST_CLUB,
    won ? 85 : 78,
    won ? 78 : 85,
    points,
    3,
    7,
    0,
    4,
    1,
    1,
    3,
    2,
    0,
    0,
    0,
    1,
    2,
    2,
    pir,
  ].join(",");
};

/** A unique person code per spec, so parallel workers cannot collide. */
const personCode = () =>
  `9${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 900 + 100)}`;

async function storedFor(playerId: string) {
  const pb = await superuser();
  return pb.collection("player_game_stats").getFullList<{
    id: string;
    game_code: number;
    round: number;
    phase: string;
    pir: number;
    fantasy_pts: number;
    points: number;
    club_code: string;
  }>({ filter: `player = "${playerId}"`, sort: "game_code", requestKey: null });
}

test.afterEach(async () => {
  await cleanupTestData();
});

test("a member with no league of their own cannot reach the importer", async ({
  page,
  context,
}) => {
  const nobody = await createTestUser("statnobody");
  await signIn(context, nobody);

  await page.goto("/stats/import");
  // notFound, not a refusal — the page does not confirm it exists.
  await expectNotFound(page);
});

test("a commissioner reads a sheet without storing anything", async ({
  page,
  context,
}) => {
  const code = personCode();
  const player = await createPlayer("Boxscore", { person_code: code });
  const commissioner = await createTestUser("statimporter");
  await createLeagueFor(commissioner, "Stat League");
  await signIn(context, commissioner);

  await page.goto("/stats/import");
  await expect(page.getByTestId("stat-import")).toBeVisible();
  await expect(page.getByTestId("stat-season")).toHaveValue(/E\d{4}/);

  await page
    .getByTestId("stat-csv-input")
    .fill([HEADER, line(code, 1), line(code, 2)].join("\n"));
  await page.getByTestId("stat-csv-preview").click();

  await expect(page.getByTestId("stat-plan-sentence")).toContainText(
    "2 new game lines",
  );
  await expect(page.getByTestId("stat-plan")).toContainText(
    "Checked against official PIR",
  );
  // Both lines carried the official PIR and both agreed with our own sum.
  await expect(page.getByTestId("stat-plan")).toContainText("2");

  // Read, not stored.
  await expect(page.getByTestId("stat-import-applied")).toHaveCount(0);
  expect(await storedFor(player.id)).toHaveLength(0);
});

test("the store lands the rows, scored, and a second run stores nothing twice", async ({
  page,
  context,
}) => {
  const code = personCode();
  const player = await createPlayer("Idempotent", { person_code: code });
  const commissioner = await createTestUser("statapplier");
  await createLeagueFor(commissioner, "Stat League");
  await signIn(context, commissioner);

  await page.goto("/stats/import");
  const sheet = [HEADER, line(code, 11), line(code, 12, { won: false })].join(
    "\n",
  );

  await page.getByTestId("stat-csv-input").fill(sheet);
  await page.getByTestId("stat-csv-preview").click();
  await page.getByTestId("stat-csv-apply").click();

  await expect(page.getByTestId("stat-import-applied")).toContainText(
    "2 new · 0 corrected",
  );

  const stored = await storedFor(player.id);
  expect(stored.map((row) => row.game_code)).toEqual([11, 12]);
  expect(stored.map((row) => row.pir)).toEqual([3, 3]);
  // The win bonus, and nothing else: 3 × 1.1 = 3.3 → 33 tenths on the win,
  // and a flat 30 on the loss. The same box score, two different totals.
  expect(stored.map((row) => row.fantasy_pts)).toEqual([33, 30]);
  expect(stored.every((row) => row.phase === "RS")).toBe(true);

  // The same sheet again. This is the failure-recovery story as a user sees
  // it: re-running an import is always safe.
  await page.getByTestId("stat-csv-input").fill(sheet);
  await page.getByTestId("stat-csv-preview").click();
  await expect(page.getByTestId("stat-plan-sentence")).toContainText(
    "2 already stored",
  );
  await expect(page.getByTestId("stat-csv-apply")).toHaveCount(0);
  await expect(page.getByTestId("stat-nothing")).toBeVisible();

  expect(await storedFor(player.id)).toHaveLength(2);
});

test("a correction is named before it is stored, and then it moves the number", async ({
  page,
  context,
}) => {
  const code = personCode();
  const player = await createPlayer("Corrected", { person_code: code });
  const commissioner = await createTestUser("statfixer");
  await createLeagueFor(commissioner, "Stat League");
  await signIn(context, commissioner);

  await page.goto("/stats/import");
  await page.getByTestId("stat-csv-input").fill([HEADER, line(code, 21)].join("\n"));
  await page.getByTestId("stat-csv-preview").click();
  await page.getByTestId("stat-csv-apply").click();
  await expect(page.getByTestId("stat-import-applied")).toContainText("1 new");

  // The same game, amended: nine points rather than seven.
  await page
    .getByTestId("stat-csv-input")
    .fill([HEADER, line(code, 21, { points: 9 })].join("\n"));
  await page.getByTestId("stat-csv-preview").click();

  // Spelled out, because a correction rewrites a game already in the
  // standings. The count alone would not say what moved.
  await expect(page.getByTestId("stat-corrections")).toContainText(
    "points 7 → 9",
  );
  await expect(page.getByTestId("stat-corrections")).toContainText(
    "fantasy_pts 33 → 55",
  );

  await page.getByTestId("stat-csv-apply").click();
  await expect(page.getByTestId("stat-import-applied")).toContainText(
    "1 corrected",
  );

  const stored = await storedFor(player.id);
  expect(stored).toHaveLength(1);
  expect(stored[0]!.points).toBe(9);
  expect(stored[0]!.fantasy_pts).toBe(55);
});

test("a line whose stated PIR disagrees with its own numbers is refused", async ({
  page,
  context,
}) => {
  const code = personCode();
  const player = await createPlayer("Disagreeing", { person_code: code });
  const commissioner = await createTestUser("statliar");
  await createLeagueFor(commissioner, "Stat League");
  await signIn(context, commissioner);

  await page.goto("/stats/import");
  // Same line, but claiming PIR 11 where the components add to 3.
  await page
    .getByTestId("stat-csv-input")
    .fill([HEADER, line(code, 31).replace(/,3$/, ",11")].join("\n"));
  await page.getByTestId("stat-csv-preview").click();

  await expect(page.getByTestId("stat-problems")).toContainText(
    "PIR 11 does not match the 3",
  );
  await expect(page.getByTestId("stat-csv-apply")).toHaveCount(0);
  expect(await storedFor(player.id)).toHaveLength(0);
});

test("an unknown person code is named, and costs the lines beside it nothing", async ({
  page,
  context,
}) => {
  const code = personCode();
  const player = await createPlayer("Known", { person_code: code });
  const commissioner = await createTestUser("statunmatched");
  await createLeagueFor(commissioner, "Stat League");
  await signIn(context, commissioner);

  await page.goto("/stats/import");
  await page
    .getByTestId("stat-csv-input")
    .fill([HEADER, line("000000000", 41), line(code, 41)].join("\n"));
  await page.getByTestId("stat-csv-preview").click();

  await expect(page.getByTestId("stat-unmatched")).toContainText("000000000");
  await expect(page.getByTestId("stat-plan-sentence")).toContainText(
    "1 new game line",
  );

  await page.getByTestId("stat-csv-apply").click();
  await expect(page.getByTestId("stat-import-applied")).toContainText("1 new");
  // The known player's line landed; the unknown one is not invented.
  expect(await storedFor(player.id)).toHaveLength(1);
});

test("a header missing a column is refused with the header to copy", async ({
  page,
  context,
}) => {
  const commissioner = await createTestUser("statheader");
  await createLeagueFor(commissioner, "Stat League");
  await signIn(context, commissioner);

  await page.goto("/stats/import");
  await page
    .getByTestId("stat-csv-input")
    .fill("personCode,gameCode,points\n006590,1,7");
  await page.getByTestId("stat-csv-preview").click();

  await expect(page.getByTestId("stat-problems")).toContainText("turnovers");
  await expect(page.getByTestId("stat-csv-apply")).toHaveCount(0);

  // And the header is reachable without leaving the page.
  await page.getByTestId("stat-header-toggle").click();
  await expect(page.getByTestId("stat-header-row")).toContainText(
    "foulsCommited",
  );
});

test("a paste survives a refusal rather than being swallowed", async ({
  page,
  context,
}) => {
  const commissioner = await createTestUser("statecho");
  await createLeagueFor(commissioner, "Stat League");
  await signIn(context, commissioner);

  await page.goto("/stats/import");
  // Multi-line on purpose: a `<textarea>` submits CRLF, so an echo compared
  // raw against the box would look unequal for every paste that matters.
  const paste = "personCode,gameCode,points\n006590,1,7\n006591,1,9";
  await page.getByTestId("stat-csv-input").fill(paste);
  await page.getByTestId("stat-csv-preview").click();

  await expect(page.getByTestId("stat-problems")).toBeVisible();
  await expect(page.getByTestId("stat-csv-input")).toHaveValue(paste);
});

test("the scrolling header row wraps rather than scrolling sideways", async ({
  page,
  context,
}) => {
  const commissioner = await createTestUser("statwrap");
  await createLeagueFor(commissioner, "Stat League");
  await signIn(context, commissioner);

  await page.goto("/stats/import");
  await page.getByTestId("stat-header-toggle").click();

  // 27 comma-separated columns is the longest unbroken-ish token this app
  // renders. `overflow-y-auto` makes `overflow-x` compute to `auto`, so
  // without `break-words` this pushes the panel wide instead of wrapping —
  // measured at 526px hidden inside 350px on the cheat sheet.
  const overflow = await page
    .getByTestId("stat-header-row")
    .evaluate((node) => node.scrollWidth - node.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
