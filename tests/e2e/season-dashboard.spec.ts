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
  await page.goto(`/l/${league.id}`);
  await expect(page.getByTestId("lobby")).toBeVisible();

  await expect(page.getByTestId("dashboard-standings")).toBeVisible();
  await expect(page.getByTestId("chat-toggle")).toBeVisible();
  // The standings list every team and the sidebar leads to your own, so
  // neither a roster panel nor the lobby's member list repeats them.
  await expect(page.getByTestId("dashboard-roster-tally")).toHaveCount(0);
  await expect(page.getByTestId("member-list")).toHaveCount(0);
  await page.getByRole("tab", { name: "Trades" }).click();
  await expect(page.getByTestId("dashboard-tx-tally")).toBeVisible();

  // One display headline per surface, and it is the league's name. The season
  // is named for both its years above it — "26" alone is half a name.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dashboard League");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByText("26-27 season", { exact: false })).toBeVisible();

  // The viewer's team leads the page: rank and total at scoreboard size, and
  // the one thing to do next.
  const hero = page.getByTestId("dashboard-hero");
  await expect(hero).toContainText("Virtuozas");
  await expect(hero.getByTestId("dashboard-rank")).toHaveText("1st");
  await expect(hero.getByTestId("hero-lineup")).toHaveAttribute("href", `/l/${league.id}/lineup`);

  // The table is ranked, numbered, and knows which row is the viewer's.
  const rows = page.getByTestId("dashboard-standing");
  await expect(rows).toHaveCount(5);
  await expect(rows.first()).toContainText("Virtuozas");
  await expect(rows.first()).toContainText("you");
  await expect(rows.first()).toContainText("100.0");
  // Movement since the previous counted round, signed.
  await expect(rows.first()).toContainText("+42.0");
});

test("nothing on the dashboard claims a fact this product does not have", async ({
  page,
  context,
}) => {
  // The brief asked for a W-L column, a "matchup of the week" and player
  // headshots. This league has no head-to-head (standings are cumulative
  // fantasy points) or matchup format. Official portraits are permitted now;
  // the other two claims are still false and must stay out of the page.
  const { chief, league } = await seasonLeague("Truthful League");

  await signIn(context, chief);
  await page.goto(`/l/${league.id}`);
  await expect(page.getByTestId("dashboard-standings")).toBeVisible();

  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/\bW-L\b/i);
  expect(body).not.toMatch(/matchup/i);
  expect(body).not.toMatch(/\bfinal\b/i);


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
  await page.goto(`/l/${league.id}`);
  await expect(page.getByTestId("lobby")).toBeVisible();

  await expect(page.getByTestId("dashboard-standings-empty")).toBeVisible();
  // With no table yet, the teams are still one tap away, unranked.
  await expect(page.getByTestId("dashboard-teams").getByTestId("enter-team")).toHaveCount(5);
  await expect(page.getByTestId("dashboard-news-empty")).toBeVisible();
  await page.getByRole("tab", { name: "Trades" }).click();
  await expect(page.getByTestId("dashboard-tx-empty")).toBeVisible();
  // No round to name, and it says so rather than printing "Round undefined".
  await expect(page.getByTestId("dashboard-round")).toHaveCount(0);
});


test("a free-agent exchange is one trade and system notices stay out of chat", async ({
  page,
  context,
}) => {
  const { chief, league, mine } = await seasonLeague("Activity League", { scored: false });
  const pb = await superuser();
  const released = await createPlayer("Release Brooks");
  const acquired = await createPlayer("Arrival Lawson");
  const common = {
    league: league.id,
    date: "2026-09-29 14:07:00.000Z",
    from_round: 2,
    members: [mine.id],
    note: "Official game: Virtuozas received Lawson and released Brooks before round 2.",
  };
  await pb.collection("transactions").create({
    ...common,
    type: "drop",
    players_in: { [mine.id]: [] },
    players_out: { [mine.id]: [released.id] },
  });
  await pb.collection("transactions").create({
    ...common,
    type: "add",
    players_in: { [mine.id]: [acquired.id] },
    players_out: { [mine.id]: [] },
  });
  await pb.collection("chat_messages").create({
    league: league.id,
    kind: "system",
    body: "Virtuozas dropped Release Brooks, counting from round 2.",
  });
  await pb.collection("chat_messages").create({
    league: league.id,
    kind: "system",
    body: "Virtuozas signed Arrival Lawson, counting from round 2.",
  });
  await pb.collection("chat_messages").create({
    league: league.id,
    author: mine.id,
    kind: "user",
    body: "The round is ready",
  });

  await signIn(context, chief);
  await page.goto(`/l/${league.id}`);
  const activity = page.getByTestId("league-activity");
  await expect(activity.getByTestId("chat-message")).toHaveCount(1);
  await expect(activity.getByTestId("chat-message")).toContainText("The round is ready");
  await expect(activity).not.toContainText("dropped Release Brooks");
  await activity.getByRole("tab", { name: "Trades" }).click();
  await expect(activity.getByTestId("dashboard-transaction")).toHaveCount(1);
  await expect(activity.getByTestId("dashboard-transaction")).toContainText(
    /Virtuozas exchanged .*Release Brooks.* for .*Arrival Lawson.*counting from round 2\./,
  );
  await activity.getByRole("tab", { name: "Injuries" }).click();
  await expect(activity.getByRole("tabpanel", { name: "Injuries" })).toBeVisible();
  await activity.getByRole("tab", { name: "EuroLeague news" }).click();
  await expect(activity.getByRole("tabpanel", { name: "EuroLeague news" })).toBeVisible();

  await page.goto(`/l/${league.id}/${mine.id}`);
  await expect(page.getByTestId("impact-deal")).toHaveCount(1);
  await expect(page.getByTestId("impact-deal")).toContainText(
    /Virtuozas exchanged .*Release Brooks.* for .*Arrival Lawson/,
  );
});

test("the setup lobby is untouched by any of this", async ({
  page,
  context,
}, testInfo) => {
  // The dashboard replaces the *season* body only. A league still being set up
  // keeps its invite code, its order and its cheat sheet.
  const chief = await createTestUser("chief");
  const league = await createLeagueFor(chief, "Still Setting Up");
  await addMemberTo(league.id, await createTestUser("mate"), "Mate FC");

  await signIn(context, chief);
  await page.goto(`/l/${league.id}`);

  await expect(page.getByTestId("invite-code")).toBeVisible();
  // The sheet lives in Drafts on a laptop and in More on a phone.
  if (testInfo.project.name === "chromium") {
    await page.getByTestId("sidebar").getByTestId("nav-group-drafts").click();
  } else {
    await page.getByTestId("more-menu").click();
  }
  await expect(
    page
      .locator(`a[href="/l/${league.id}/sheet"]`)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
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
  await page.goto(`/l/${league.id}`);
  await expect(page.getByTestId("lobby")).toBeVisible();

  // One link over both clauses, not two to the same place.
  const wordmark = page.getByRole("link", { name: /eurovafliai/i });
  await expect(wordmark).toHaveCount(1);
  await wordmark.click();

  await expect(page.getByTestId("app-shell")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/");
});
