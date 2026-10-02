import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  addMemberTo,
  cleanupTestData,
  createLeagueFor,
  createPlayer,
  createTestUser,
  signIn,
  superuser,
  type TestUser,
  shown,
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

/**
 * Type one lineup the way a person does — slice 10.5.
 *
 * `captain` is no longer a role in the select: it is a mark on a starter, made
 * with an exclusive radio, because the captaincy is not a sixth place on the
 * team sheet. So this helper reads "captain" as *starter, and marked*, which is
 * what the rulebook means by it. The select and the radio live in the grid view;
 * the court moves players by drag, and a tap opens a profile.
 */
async function showGrid(page: Page): Promise<void> {
  const grid = page.getByRole("button", { name: "grid", exact: true });
  if ((await grid.getAttribute("aria-pressed")) !== "true") await grid.click();
}

async function showCourt(page: Page): Promise<void> {
  await page.getByRole("button", { name: "court", exact: true }).click();
}

async function assign(
  page: Page,
  player: { name: string },
  role: string,
): Promise<void> {
  await showGrid(page);
  if (role === "captain") {
    await page.getByLabel(`${shown(player.name)} captain`).check();
    return;
  }
  await page.getByLabel(`${shown(player.name)} role`).selectOption(role);
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
    await assign(page, players[index]!, role);
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

  // 10.0 as captain is 20.0; 3.3 on the bench is 1.65, kept to the hundredth
  // as the official game keeps it; 50.0 while inactive is nothing at all.
  // 21.65 is the whole rule in one cell.
  await score(planted.players[0]!.id, 1, 100);
  await score(planted.players[5]!.id, 1, 33);
  await score(planted.players[7]!.id, 1, 500);

  await signIn(context, owner);
  await page.goto(`/l/${planted.leagueId}/lineup?season=${SEASON}&round=1`);

  await expect(page.getByTestId("lineup")).toBeVisible();
  await expect(page.getByTestId("lineup-tier-none").getByTestId("lineup-card")).toHaveCount(8);
  await expect(page.getByTestId("lineup-absent")).toContainText("100%");

  await arrange(page, planted.players);
  await expect(page.getByTestId("lineup-summary")).toContainText("2-2-1");
  await expect(page.getByTestId("lineup-refusal")).toHaveCount(0);

  await page.getByTestId("record-lineup-submit").click();
  await expect(page.getByTestId("lineup-saved")).toBeVisible({ timeout: 20_000 });

  await page.goto(`/l/${planted.leagueId}/standings?season=${SEASON}`);
  const rows = page.getByTestId("standings-row");
  await expect(rows.first()).toContainText("21.65");
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
  await page.goto(`/l/${planted.leagueId}/lineup?season=${SEASON}&round=2`);
  await arrange(page, planted.players);
  await page.getByTestId("record-lineup-submit").click();
  await expect(page.getByTestId("lineup-saved")).toBeVisible({ timeout: 20_000 });

  await page.goto(`/l/${planted.leagueId}/standings?season=${SEASON}`);
  // Round 2 doubled the captain; round 1 has no lineup at all, so it counted
  // everyone at 100% and says so rather than looking final.
  await expect(page.getByTestId("standings-row").first()).toContainText("30.0");
  await expect(page.getByTestId("standings-provisional")).toContainText(
    "Round 1",
  );

  // Round 3 was never typed, so it carries round 2 forward rather than
  // reverting to 100%.
  await page.goto(`/l/${planted.leagueId}/lineup?season=${SEASON}&round=3`);
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
  await page.goto(`/l/${planted.leagueId}/lineup?season=${SEASON}&round=1`);

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
    await assign(page, planted.players[index]!, role);
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

test("there is only ever one captain, and moving them off the five clears it", async ({
  page,
  context,
}) => {
  const owner = await createTestUser("captainowner");
  const mate = await createTestUser("captainmate");
  const planted = await plantSeason(owner, mate, "One Armband");

  await signIn(context, owner);
  await page.goto(`/l/${planted.leagueId}/lineup?season=${SEASON}&round=1`);

  const captainOf = (index: number) =>
    page.getByLabel(`${shown(planted.players[index]!.name)} captain`);
  await showGrid(page);

  // Marking a captain places them too: the captaincy is a mark on a starter,
  // so a control that could name a captain the validator would then refuse is a
  // control that exists to produce an error message.
  await captainOf(0).check();
  await expect(captainOf(0)).toBeChecked();
  await expect(page.getByLabel(`${shown(planted.players[0]!.name)} role`)).toHaveValue(
    "starter",
  );

  // The exclusivity, which is the browser's own and not ours to reimplement.
  await captainOf(3).check();
  await expect(captainOf(3)).toBeChecked();
  await expect(captainOf(0)).not.toBeChecked();
  await expect(page.getByTestId("lineup-summary")).toContainText("1 captain");

  // Benching the captain gives up the armband with the place. Without this the
  // form would post a captain who is not among the starters and earn a refusal
  // naming a role no control on the page displays any more.
  await page.getByLabel(`${shown(planted.players[3]!.name)} role`).selectOption("bench");
  await expect(captainOf(3)).not.toBeChecked();
  await expect(page.getByTestId("lineup-summary")).toContainText("0 captain");

  // And the whole thing still records, through the same validator.
  await arrange(page, planted.players);
  await expect(page.getByTestId("lineup-refusal")).toHaveCount(0);
  await page.getByTestId("record-lineup-submit").click();
  await expect(page.getByTestId("lineup-saved")).toBeVisible({ timeout: 20_000 });

  // Re-opening splits the stored captain back into a place plus a mark.
  await page.reload();
  await showGrid(page);
  await expect(captainOf(0)).toBeChecked();
  await expect(page.getByLabel(`${shown(planted.players[0]!.name)} role`)).toHaveValue(
    "starter",
  );
});

test("a tap opens the player's profile, and the profile makes a starter captain", async ({
  page,
  context,
}) => {
  const owner = await createTestUser("courtowner");
  const mate = await createTestUser("courtmate");
  const planted = await plantSeason(owner, mate, "Court Taps");

  await signIn(context, owner);
  await page.goto(`/l/${planted.leagueId}/lineup?season=${SEASON}&round=1`);

  const court = page.getByTestId("lineup-court");
  await expect(court).toBeVisible();
  await expect(court.getByTestId("court-player")).toHaveCount(0);
  // Open places are where a drag lands, not buttons.
  await expect(court.getByTestId("court-open")).toHaveCount(5);
  await expect(court.getByRole("button")).toHaveCount(0);

  const guard = planted.players[0]!;
  const center = planted.players[6]!;
  const modal = page.getByTestId("player-stats-modal");

  // A tap on somebody not in the five: their profile, and no captaincy to give.
  await page.getByTestId("lineup-tier-none").getByRole("button", { name: shown(center.name) }).click();
  await expect(modal).toBeVisible();
  await expect(modal.getByRole("heading", { name: shown(center.name) })).toBeVisible();
  await expect(modal.getByTestId("profile-make-captain")).toHaveCount(0);
  await modal.getByRole("button", { name: "Close player stats" }).click();
  await expect(modal).toHaveCount(0);
  // The tap moved nobody.
  await expect(court.getByTestId("court-player")).toHaveCount(0);

  // A starter's profile carries the armband.
  await showGrid(page);
  await page.getByLabel(`${shown(guard.name)} role`).selectOption("starter");
  await showCourt(page);
  await court.getByTestId("court-player").click();
  await expect(modal.getByRole("heading", { name: shown(guard.name) })).toBeVisible();
  await modal.getByTestId("profile-make-captain").click();
  await expect(modal).toHaveCount(0);
  await expect(court.getByTestId("court-player")).toHaveAttribute("data-captain", "true");
  await expect(page.getByTestId("lineup-swapped")).toContainText(`${shown(guard.name)} is captain`);

  await court.getByTestId("court-player").click();
  await expect(modal.getByTestId("profile-captain")).toBeVisible();
  await expect(modal.getByTestId("profile-make-captain")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);

  await showGrid(page);
  await expect(page.getByLabel(`${shown(guard.name)} captain`)).toBeChecked();
});

test.describe("on a screen that holds the whole lineup", () => {
test.use({ viewport: { width: 1600, height: 1000 } });

test("a player dragged onto the court starts, and dragged onto a starter swaps with them", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "a mouse drag; touch holds first");
  const owner = await createTestUser("dragowner");
  const mate = await createTestUser("dragmate");
  const planted = await plantSeason(owner, mate, "Court Drags");

  await signIn(context, owner);
  await page.goto(`/l/${planted.leagueId}/lineup?season=${SEASON}&round=1`);

  const court = page.getByTestId("lineup-court");
  const guard = planted.players[0]!;
  const center = planted.players[6]!;
  async function dragOnto(from: { name: string }, to: Locator) {
    const source = await page.getByRole("button", { name: shown(from.name) }).boundingBox();
    const target = await to.boundingBox();
    if (!source || !target) throw new Error("nothing to drag");
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
    await page.mouse.up();
  }

  await dragOnto(guard, court);
  await expect(court.getByTestId("court-player")).toHaveCount(1);
  await expect(page.getByTestId("lineup-swapped")).toContainText(`${shown(guard.name)} to the five`);

  await dragOnto(center, court.getByTestId("court-player"));
  await expect(court.getByTestId("court-player")).toHaveAttribute("data-position", "C");
  await expect(page.getByTestId("lineup-tier-none").getByRole("button", { name: shown(guard.name) })).toBeVisible();
  // A drag is not also a tap: no profile opened on the drop.
  await expect(page.getByTestId("player-stats-modal")).toHaveCount(0);
  if (process.env.REDESIGN_CAPTURE) {
    await page.getByRole("button", { name: "2-2-1", exact: true }).click();
    await page.screenshot({ path: "/tmp/eurovafliai-lineup-wide.png" });
  }
});
});

test("formation selection fills the court, survives refresh, and stays unrecorded until saved", async ({ page, context }, testInfo) => {
  const owner = await createTestUser("formationdraft");
  const mate = await createTestUser("formationdraftmate");
  const planted = await plantSeason(owner, mate, "Formation Draft");
  await signIn(context, owner);
  await page.goto(`/l/${planted.leagueId}/lineup?season=${SEASON}&round=1`);

  for (const formation of ["2-2-1", "1-2-2", "2-1-2", "1-3-1", "3-1-1"]) {
    await page.getByRole("button", { name: formation, exact: true }).click();
    const marks = page.getByTestId("lineup-court").getByTestId("court-player");
    await expect(marks).toHaveCount(5);
    const boxes = await marks.evaluateAll((nodes) => nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    }));
    for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) {
      expect(Math.min(boxes[i]!.right, boxes[j]!.right) <= Math.max(boxes[i]!.left, boxes[j]!.left)
        || Math.min(boxes[i]!.bottom, boxes[j]!.bottom) <= Math.max(boxes[i]!.top, boxes[j]!.top), `${formation} court markers ${i} and ${j} overlap`).toBe(true);
    }
  }
  await page.getByRole("button", { name: "1-3-1", exact: true }).click();
  await expect(page.getByTestId("lineup-court").getByTestId("court-player")).toHaveCount(5);
  await expect(page.getByTestId("lineup-summary")).toContainText("1-3-1");
  await expect(page.getByTestId("lineup-refusal")).toHaveCount(0);
  await expect(page.getByText("Unsaved · saved on this device")).toBeVisible();
  if (process.env.REDESIGN_CAPTURE) {
    await page.screenshot({ path: `/tmp/eurovafliai-lineup-${testInfo.project.name}.png` });
    await page.getByTestId("lineup-court").screenshot({ path: `/tmp/eurovafliai-court-${testInfo.project.name}.png` });
  }

  await page.reload();
  await expect(page.getByTestId("lineup-summary")).toContainText("1-3-1");
  await page.getByRole("button", { name: "grid", exact: true }).click();
  await expect(page.getByRole("region", { name: "Lineup grid" })).toBeVisible();
  await expect(page.getByTestId("lineup-row")).toHaveCount(8);
  const compareButton = page.getByRole("button", { name: "Compare players" });
  await compareButton.focus();
  await expect(compareButton).toBeFocused();
  await compareButton.press("Enter");
  await expect(page.getByTestId("player-comparison")).toBeVisible();
  await expect(page.getByTestId("player-comparison")).toContainText("No stored games this season.");
  await expect(page.getByTestId("player-comparison")).toContainText("Fixtures not published.");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("player-comparison")).toHaveCount(0);
  await page.getByRole("button", { name: "Auto-Optimize preview" }).click();
  await expect(page.getByTestId("lineup-optimize-preview")).toBeVisible();
  await expect(page.getByTestId("lineup-optimize-preview")).toContainText("No estimate");
  await expect(page.getByTestId("lineup-absent")).toBeVisible();
});

test("on a phone the record bar stands above the tab bar, not under it", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "the tab bar is below lg");
  const owner = await createTestUser("courtbar");
  const mate = await createTestUser("courtbarmate");
  const planted = await plantSeason(owner, mate, "Bar Above Tabs");

  await signIn(context, owner);
  await page.goto(`/l/${planted.leagueId}/lineup?season=${SEASON}&round=1`);
  await expect(page.getByTestId("lineup-court")).toBeVisible();

  // Mid-page, where the bar is stuck rather than resting at the form's end.
  await page.getByTestId("lineup-court").scrollIntoViewIfNeeded();
  const submit = await page.getByTestId("record-lineup-submit").boundingBox();
  const tabs = await page.getByTestId("bottom-tabs").boundingBox();
  expect(submit).not.toBeNull();
  expect(tabs).not.toBeNull();
  expect(submit!.y + submit!.height).toBeLessThanOrEqual(tabs!.y);
});

test("the commissioner sets anyone's lineup and a plain member sets only their own", async ({
  page,
  context,
}) => {
  const owner = await createTestUser("chieflineup");
  const mate = await createTestUser("platelineup");
  const planted = await plantSeason(owner, mate, "Whose Lineup");

  await signIn(context, owner);
  await page.goto(`/l/${planted.leagueId}/lineup?season=${SEASON}`);
  await expect(page.getByTestId("lineup-member")).toBeVisible();
  await expect(page.getByTestId("lineup-member")).toHaveValue(planted.memberId);

  await context.clearCookies();
  await signIn(context, mate);
  await page.goto(`/l/${planted.leagueId}/lineup?season=${SEASON}`);
  await expect(page.getByTestId("lineup-member")).toHaveCount(0);
  // Asking for somebody else's team by URL falls back to their own, which for
  // this member is an empty roster rather than the other member's thirteen.
  await page.goto(
    `/l/${planted.leagueId}/lineup?season=${SEASON}&member=${planted.memberId}`,
  );
  await expect(page.getByTestId("lineup-empty")).toBeVisible();
});
