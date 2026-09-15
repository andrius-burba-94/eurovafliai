import { expect, test } from "@playwright/test";

import {
  addMemberTo,
  cleanupTestData,
  createLeagueFor,
  createPlayer,
  createTestUser,
  signIn,
  superuser,
} from "./helpers/session";

/**
 * The season dashboard — what a league sees once the draft is over.
 *
 * `src/lib/season/dashboard.test.ts` owns the arithmetic: the ranking, the tie
 * break, the round delta and its null case, the roster grouping against a
 * template. What only a browser can answer is that the four panels are on one
 * screen, that the door grid they replaced is gone, and — the one worth having
 * — that nothing on this page claims a fact this product does not have.
 */

const SEASON = "E2026";

test.afterEach(async () => {
  await cleanupTestData();
});

/** A league in its season: five teams, a roster for the viewer, two rounds scored. */
async function seasonLeague(name: string, { scored = true } = {}) {
  const chief = await createTestUser("chief");
  const league = await createLeagueFor(chief, name);
  for (const team of ["Vafliai", "Krosas", "Sostine", "Zalgirio"]) {
    await addMemberTo(
      league.id,
      await createTestUser(team.toLowerCase()),
      team,
    );
  }

  const pb = await superuser();
  const members = await pb
    .collection("league_members")
    .getFullList<{ id: string }>({
      filter: `league = '${league.id}'`,
      sort: "created",
    });
  const mine = members[0]!;
  await pb
    .collection("league_members")
    .update(mine.id, { team_name: "Virtuozas" });

  for (const [label, position] of [
    ["Alpha", "G"],
    ["Bravo", "G"],
    ["Charlie", "F"],
    ["Delta", "C"],
  ] as const) {
    const player = await createPlayer(label, { position });
    await pb.collection("roster_memberships").create(
      {
        league: league.id,
        member: mine.id,
        player: player.id,
        from_date: "2026-09-08 12:00:00.000Z",
        to_date: "",
        acquired_via: "draft",
      },
      { requestKey: null },
    );
  }

  await pb
    .collection("leagues")
    .update(league.id, { status: "season" }, { requestKey: null });

  if (scored) {
    for (const round of [3, 4]) {
      await pb.collection("standings_snapshots").create(
        {
          league: league.id,
          season: SEASON,
          round,
          phase: "RS",
          table: members.map((member, index) => ({
            memberId: member.id,
            // Descending by join order, so the viewer leads and the ranking is
            // something the test can name.
            totalTenths: 1000 - index * 100 - (round === 3 ? 420 : 0),
            roundTenths: round === 3 ? 380 : 420,
          })),
        },
        { requestKey: null },
      );
    }
  }

  return { chief, league, mine, members };
}

test("the season lobby is a dashboard, not a grid of doors", async ({
  page,
  context,
}) => {
  const { chief, league } = await seasonLeague("Dashboard League");

  await signIn(context, chief);
  await page.goto(`/leagues/${league.id}`);
  await expect(page.getByTestId("lobby")).toBeVisible();

  // The four panels of the brief, all on one screen.
  await expect(page.getByTestId("dashboard-standings")).toBeVisible();
  await expect(page.getByTestId("chat-toggle")).toBeVisible();
  await expect(page.getByTestId("dashboard-roster-tally")).toBeVisible();
  await expect(page.getByTestId("dashboard-tx-tally")).toBeVisible();

  // The season is named for both its years. "26" alone is half the name of the
  // competition, which is what the first cut printed.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("26-27");
  // One display headline per surface: the league's name steps down so the
  // season can have it.
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

  // The table is ranked, numbered, and knows which row is the viewer's.
  const rows = page.getByTestId("dashboard-standing");
  await expect(rows).toHaveCount(5);
  await expect(rows.first()).toContainText("Virtuozas");
  await expect(rows.first()).toContainText("you");
  await expect(rows.first()).toContainText("100.0");
  // Movement since the previous counted round, signed.
  await expect(rows.first()).toContainText("+42.0");

  // The roster, grouped the way the template is written, empty buckets and all.
  await expect(page.getByTestId("dashboard-roster-tally")).toContainText(
    "4 of 13",
  );
  await expect(page.getByTestId("dashboard-group-count")).toHaveText([
    "2/5",
    "1/5",
    "1/3",
  ]);
});

test("nothing on the dashboard claims a fact this product does not have", async ({
  page,
  context,
}) => {
  // The brief asked for a W-L column, a "matchup of the week" and player
  // headshots. This league has no head-to-head (standings are cumulative
  // fantasy points), no matchup format anywhere in the blueprint, and no image
  // field on `players`. Each was substituted rather than faked, and this is the
  // test that stops one being "finished" later.
  const { chief, league } = await seasonLeague("Truthful League");

  await signIn(context, chief);
  await page.goto(`/leagues/${league.id}`);
  await expect(page.getByTestId("dashboard-standings")).toBeVisible();

  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/\bW-L\b/i);
  expect(body).not.toMatch(/matchup/i);
  expect(body).not.toMatch(/\bfinal\b/i);

  // No image anywhere in the roster panel: the position patch is the mark.
  await expect(
    page.getByTestId("dashboard-roster-group").locator("img"),
  ).toHaveCount(0);

  // And the brief's other instruction: no cheat-sheet panel on this screen.
  await expect(page.getByTestId("lobby-sheet")).toHaveCount(0);
});

test("an unscored season shows the shape and admits it is empty", async ({
  page,
  context,
}) => {
  // The panels must survive a league whose first Euroleague night has not been
  // counted. A dashboard that only works with data is a dashboard nobody sees
  // on the day they most want it.
  const { chief, league } = await seasonLeague("Quiet League", {
    scored: false,
  });

  await signIn(context, chief);
  await page.goto(`/leagues/${league.id}`);
  await expect(page.getByTestId("lobby")).toBeVisible();

  await expect(page.getByTestId("dashboard-standings-empty")).toBeVisible();
  await expect(page.getByTestId("dashboard-news-empty")).toBeVisible();
  await expect(page.getByTestId("dashboard-tx-empty")).toBeVisible();
  // The roster is written by the draft, not by a round, so it is still there.
  await expect(page.getByTestId("dashboard-roster-tally")).toContainText(
    "4 of 13",
  );
  // No round to name, and it says so rather than printing "Round undefined".
  await expect(page.getByTestId("dashboard-round")).toHaveCount(0);
});

test("the setup lobby is untouched by any of this", async ({
  page,
  context,
}) => {
  // The dashboard replaces the *season* body only. A league still being set up
  // keeps its invite code, its order and its cheat sheet.
  const chief = await createTestUser("chief");
  const league = await createLeagueFor(chief, "Still Setting Up");
  await addMemberTo(league.id, await createTestUser("mate"), "Mate FC");

  await signIn(context, chief);
  await page.goto(`/leagues/${league.id}`);

  await expect(page.getByTestId("invite-code")).toBeVisible();
  await expect(page.getByTestId("lobby-sheet")).toBeVisible();
  await expect(page.getByTestId("dashboard-standings")).toHaveCount(0);
  // The league's own name keeps the headline while it is being set up.
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Still Setting Up",
  );
});

test("the wordmark is the way home", async ({ page, context }) => {
  const chief = await createTestUser("chief");
  const league = await createLeagueFor(chief, "Home League");

  await signIn(context, chief);
  await page.goto(`/leagues/${league.id}`);
  await expect(page.getByTestId("lobby")).toBeVisible();

  // One link over both clauses, not two to the same place.
  const wordmark = page.getByRole("link", { name: /eurovafliai/i });
  await expect(wordmark).toHaveCount(1);
  await wordmark.click();

  await expect(page.getByTestId("app-shell")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/");
});
