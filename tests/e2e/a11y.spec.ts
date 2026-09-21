import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import {
  addMemberTo,
  cleanupTestData,
  createLeagueFor,
  createPlayer,
  createTestUser,
  signIn,
  superuser,
  rollOrder,
} from "./helpers/session";

/**
 * Slice 8.4 — axe over the five surfaces a friend actually opens.
 *
 * Serious and critical only. Contrast is already measured in the token suite;
 * this catches landmarks, names, and focus order that tokens cannot see. A
 * finding that is pre-existing and not fixed in the slice goes in STATUS.md
 * open debt — never left silent.
 */

test.afterEach(async () => {
  await cleanupTestData();
});

async function assertNoSerious(page: Page, label: string) {
  // Contrast is owned by `src/app/tokens.test.ts` — the design system already
  // measures every ink/stock pair, and a second, fighting source of truth is
  // worse than one. This suite is for landmarks, names, and focus order that
  // tokens cannot see.
  //
  // The near-miss this comment used to record (the marker on panel stock at
  // 4.49:1 against a 4.5 floor) is gone with the card-stock board: it is
  // 5.25:1 on the midnight board. The rule stays disabled because the division
  // of labour is the point, not because anything is being hidden.
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .disableRules(["color-contrast"])
    .analyze();
  const bad = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(bad, `${label}: ${JSON.stringify(bad, null, 2)}`).toEqual([]);
}

test("login has no serious axe findings", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByTestId("login")).toBeVisible();
  await assertNoSerious(page, "login");
});

test("home has no serious axe findings", async ({ page, context }) => {
  const user = await createTestUser("homeaxe");
  // With a league on it, because 10.9 made the dashboard a grid of card
  // blocks: the empty surface has no list, no link inside a block and no
  // position patches, which is most of what axe has to read here.
  await createLeagueFor(user, "Axe Dashboard");
  await signIn(context, user);
  await page.goto("/");
  await expect(page.getByTestId("app-shell")).toBeVisible();
  await expect(page.getByTestId("leagues-list")).toContainText("Axe Dashboard");
  await assertNoSerious(page, "home");
});

test("lobby has no serious axe findings", async ({ page, context }) => {
  const commissioner = await createTestUser("lobbyaxe");
  const league = await createLeagueFor(commissioner, "Axe Lobby");
  await signIn(context, commissioner);
  await page.goto(`/leagues/${league.id}`);
  await expect(page.getByTestId("lobby")).toBeVisible();
  await assertNoSerious(page, "lobby");
});

test("draft room has no serious axe findings", async ({ page, context }) => {
  const commissioner = await createTestUser("draftaxe");
  const league = await createLeagueFor(commissioner, "Axe Draft");
  await addMemberTo(league.id, await createTestUser("mate"), "Mate FC");
  await createPlayer("Alpha", { position: "G" });
  await createPlayer("Bravo", { position: "F" });
  await signIn(context, commissioner);
  await page.goto(`/leagues/${league.id}`);
  await rollOrder(page, league.id);
  await page.getByTestId("start-draft").click();
  await page.getByTestId("enter-draft").click();
  await expect(page.getByTestId("draft-room")).toBeVisible();
  // The room now has an h1 (the band title) — axe would flag its absence.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await assertNoSerious(page, "draft room");
});

test("standings has no serious axe findings", async ({ page, context }) => {
  const user = await createTestUser("standaxe");
  const league = await createLeagueFor(user, "Axe Standings");
  await signIn(context, user);
  await page.goto(`/leagues/${league.id}/standings`);
  await expect(page.getByTestId("standings")).toBeVisible();
  await assertNoSerious(page, "standings");
});

test("the standings table has no serious axe findings", async ({
  page,
  context,
}) => {
  // The *table*, not the empty state above it. 10.9 made it a grid with a
  // sticky row header and a scrollport, which is exactly the shape axe has
  // something to say about — and the empty surface this suite was checking
  // has none of it.
  const user = await createTestUser("gridaxe");
  const league = await createLeagueFor(user, "Axe Table");
  const pb = await superuser();
  const members = await pb.collection("league_members").getFullList<{
    id: string;
  }>({ filter: `league = '${league.id}'`, requestKey: null });
  await pb
    .collection("leagues")
    .update(league.id, { status: "season" }, { requestKey: null });
  for (const round of [1, 2, 3]) {
    await pb.collection("standings_snapshots").create(
      {
        league: league.id,
        season: "E2099",
        round,
        phase: "RS",
        table: members.map((member) => ({
          memberId: member.id,
          roundTenths: 90 + round,
          totalTenths: (90 + round) * round,
        })),
      },
      { requestKey: null },
    );
  }

  await signIn(context, user);
  await page.goto(`/leagues/${league.id}/standings?season=E2099`);
  await expect(page.getByTestId("standings-row")).toHaveCount(members.length);
  await assertNoSerious(page, "standings table");
});

test("the export picker has no serious axe findings", async ({
  page,
  context,
}) => {
  // The one surface in the app whose body is a form of checkboxes, so the
  // labels-and-names rules this suite exists for have something to say about
  // it that no other page exercises.
  const user = await createTestUser("a11yexport");
  const league = await createLeagueFor(user, "A11y Export");
  const pb = await superuser();
  const seats = await pb
    .collection("league_members")
    .getFullList<{ id: string; user: string }>({
      filter: `league = '${league.id}'`,
      requestKey: null,
    });
  const seat = seats.find((row) => row.user === user.id);
  if (!seat) throw new Error("membership missing");
  const player = await createPlayer("A11yExported");
  const draft = await pb.collection("drafts").create(
    {
      league: league.id,
      format: "snake",
      status: "complete",
      order: [seat.id],
      rounds: 1,
      seed: "a11y-export",
    },
    { requestKey: null },
  );
  await pb.collection("picks").create(
    {
      draft: draft.id,
      overall_no: 1,
      round: 1,
      slot: 1,
      member: seat.id,
      player: player.id,
      is_auto: false,
    },
    { requestKey: null },
  );

  await signIn(context, user);
  await page.goto(`/leagues/${league.id}/export`);
  await expect(page.getByTestId("export-form")).toBeVisible();
  await assertNoSerious(page, "export picker");
});

test("the skip link reaches main content", async ({ page }) => {
  await page.goto("/login");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: /skip to content/i });
  await expect(skip).toBeFocused();
  await skip.press("Enter");
  await expect(page.locator("#main")).toHaveCount(1);
  await expect(page.locator("#main")).toBeVisible();
});
