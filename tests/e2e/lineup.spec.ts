import { expect, test, type Page } from "@playwright/test";

import {
  addMemberTo,
  cleanupTestData,
  createLeagueFor,
  createPlayer,
  createTestUser,
  signIn,
  superuser,
  type TestUser,
} from "./helpers/session";

/**
 * Lineups and the captain — slice 9.3.
 *
 * The league is played on the official site and typed in here afterwards, so
 * every test plants the season state directly and then goes through the page
 * the way a person does: choose a role per player, record, read the table.
 *
 * Eight players rather than thirteen: the validator caps the sixth man, bench
 * and inactive at the template and requires the starting five to be full, so
 * eight is the smallest roster that exercises all four multipliers.
 */

const SEASON = "E2099";

type Planted = {
  leagueId: string;
  memberId: string;
  players: { id: string; name: string }[];
};

async function plantSeason(
  owner: TestUser,
  mate: TestUser,
  name: string,
): Promise<Planted> {
  const league = await createLeagueFor(owner, name);
  await addMemberTo(league.id, mate, "Other FC");
  const pb = await superuser();
  const members = await pb.collection("league_members").getFullList<{
    id: string;
    user: string;
  }>({ filter: `league = '${league.id}'`, requestKey: null });
  const mine = members.find((row) => row.user === owner.id);
  const theirs = members.find((row) => row.user === mate.id);
  if (!mine || !theirs) throw new Error("memberships missing");

  const positions = ["G", "G", "G", "F", "F", "F", "C", "C"] as const;
  const players = [];
  for (const [index, position] of positions.entries()) {
    players.push(
      await createPlayer(`Line${index}`, { position }),
    );
  }

  await pb.collection("drafts").create(
    {
      league: league.id,
      format: "linear",
      status: "complete",
      order: [mine.id, theirs.id],
      rounds: 4,
      seed: "lineup-e2e",
    },
    { requestKey: null },
  );
  for (const player of players) {
    await pb.collection("roster_memberships").create(
      {
        league: league.id,
        member: mine.id,
        player: player.id,
        from_date: "2026-09-08 12:00:00.000Z",
        to_date: "",
        from_round: 1,
        to_round: 0,
        acquired_via: "draft",
      },
      { requestKey: null },
    );
  }
  await pb
    .collection("leagues")
    .update(league.id, { status: "season" }, { requestKey: null });

  return { leagueId: league.id, memberId: mine.id, players };
}

async function score(
  playerId: string,
  round: number,
  fantasyTenths: number,
): Promise<void> {
  const pb = await superuser();
  await pb.collection("player_game_stats").create(
    {
      player: playerId,
      season: SEASON,
      game_code: 1000 + round * 100 + Math.floor(Math.random() * 90),
      round,
      phase: "RS",
      club_code: "ZZZ",
      pir: Math.round(fantasyTenths / 10),
      fantasy_pts: fantasyTenths,
    },
    { requestKey: null },
  );
}

/** The official 2-2-1, with the first guard as captain. */
async function arrange(
  page: Page,
  players: readonly { name: string }[],
): Promise<void> {
  const roles = [
    "captain",
    "starter",
    "sixth",
    "starter",
    "starter",
    "bench",
    "starter",
    "inactive",
  ];
  for (const [index, role] of roles.entries()) {
    await page
      .getByLabel(`${players[index]!.name} role`)
      .selectOption(role);
  }
}

test.afterEach(async () => {
  await cleanupTestData();
});

test("a captain doubles, the bench halves and the inactive score nothing", async ({
  page,
  context,
}) => {
  const owner = await createTestUser("lineupowner");
  const mate = await createTestUser("lineupmate");
  const planted = await plantSeason(owner, mate, "Captain Table");

  // 10.0 as captain is 20.0; 3.3 on the bench is 1.7, rounded away from zero;
  // 50.0 while inactive is nothing at all. 21.7 is the whole rule in one cell.
  await score(planted.players[0]!.id, 1, 100);
  await score(planted.players[5]!.id, 1, 33);
  await score(planted.players[7]!.id, 1, 500);

  await signIn(context, owner);
  await page.goto(`/leagues/${planted.leagueId}/lineup?season=${SEASON}&round=1`);

  await expect(page.getByTestId("lineup")).toBeVisible();
  await expect(page.getByTestId("lineup-row")).toHaveCount(8);
  await expect(page.getByTestId("lineup-absent")).toContainText("100%");

  await arrange(page, planted.players);
  await expect(page.getByTestId("lineup-summary")).toContainText("2-2-1");
  await expect(page.getByTestId("lineup-refusal")).toHaveCount(0);

  await page.getByTestId("record-lineup-submit").click();
  await expect(page.getByTestId("lineup-saved")).toBeVisible({ timeout: 20_000 });

  await page.goto(`/leagues/${planted.leagueId}/standings?season=${SEASON}`);
  const rows = page.getByTestId("standings-row");
  await expect(rows.first()).toContainText("21.7");
  await expect(page.getByTestId("standings-provisional")).toHaveCount(0);
});

test("a round nobody arranged is struck as provisional", async ({
  page,
  context,
}) => {
  const owner = await createTestUser("provowner");
  const mate = await createTestUser("provmate");
  const planted = await plantSeason(owner, mate, "Provisional Table");

  await score(planted.players[0]!.id, 1, 100);
  await score(planted.players[0]!.id, 2, 100);

  await signIn(context, owner);
  await page.goto(`/leagues/${planted.leagueId}/lineup?season=${SEASON}&round=2`);
  await arrange(page, planted.players);
  await page.getByTestId("record-lineup-submit").click();
  await expect(page.getByTestId("lineup-saved")).toBeVisible({ timeout: 20_000 });

  await page.goto(`/leagues/${planted.leagueId}/standings?season=${SEASON}`);
  // Round 2 doubled the captain; round 1 has no lineup at all, so it counted
  // everyone at 100% and says so rather than looking final.
  await expect(page.getByTestId("standings-row").first()).toContainText("30.0");
  await expect(page.getByTestId("standings-provisional")).toContainText(
    "Round 1",
  );

  // Round 3 was never typed, so it carries round 2 forward rather than
  // reverting to 100%.
  await page.goto(`/leagues/${planted.leagueId}/lineup?season=${SEASON}&round=3`);
  await expect(page.getByTestId("lineup-carried")).toContainText("round 2");
});

test("an illegal formation is refused before it is submitted, and after", async ({
  page,
  context,
}) => {
  const owner = await createTestUser("formationowner");
  const mate = await createTestUser("formationmate");
  const planted = await plantSeason(owner, mate, "Formation Refusal");

  await signIn(context, owner);
  await page.goto(`/leagues/${planted.leagueId}/lineup?season=${SEASON}&round=1`);

  // Two guards and three forwards is 2-3-0, which the rulebook does not list:
  // every legal five has a center in it.
  const illegal = [
    "captain",
    "starter",
    "bench",
    "starter",
    "starter",
    "starter",
    "sixth",
    "inactive",
  ];
  for (const [index, role] of illegal.entries()) {
    await page
      .getByLabel(`${planted.players[index]!.name} role`)
      .selectOption(role);
  }
  await expect(page.getByTestId("lineup-refusal")).toContainText(
    "not one of the five legal formations",
  );

  await page.getByTestId("record-lineup-submit").click();
  await expect(page.getByTestId("lineup-error")).toContainText(
    "legal formations",
    { timeout: 20_000 },
  );

  await arrange(page, planted.players);
  await expect(page.getByTestId("lineup-refusal")).toHaveCount(0);
  await page.getByTestId("record-lineup-submit").click();
  await expect(page.getByTestId("lineup-saved")).toBeVisible({ timeout: 20_000 });
});

test("the commissioner sets anyone's lineup and a plain member sets only their own", async ({
  page,
  context,
}) => {
  const owner = await createTestUser("chieflineup");
  const mate = await createTestUser("platelineup");
  const planted = await plantSeason(owner, mate, "Whose Lineup");

  await signIn(context, owner);
  await page.goto(`/leagues/${planted.leagueId}/lineup?season=${SEASON}`);
  await expect(page.getByTestId("lineup-member")).toBeVisible();
  await expect(page.getByTestId("lineup-member")).toHaveValue(planted.memberId);

  await context.clearCookies();
  await signIn(context, mate);
  await page.goto(`/leagues/${planted.leagueId}/lineup?season=${SEASON}`);
  await expect(page.getByTestId("lineup-member")).toHaveCount(0);
  // Asking for somebody else's team by URL falls back to their own, which for
  // this member is an empty roster rather than the other member's thirteen.
  await page.goto(
    `/leagues/${planted.leagueId}/lineup?season=${SEASON}&member=${planted.memberId}`,
  );
  await expect(page.getByTestId("lineup-empty")).toBeVisible();
});
