import { expect, test } from "@playwright/test";

import {
  addMemberTo,
  cleanupTestData,
  createLeagueFor,
  createPlayer,
  createTestUser,
  signIn,
  shown,
  superuser,
} from "./helpers/session";

/**
 * The round, written — slice 7.1 (option C of #186). A stored write-up is
 * planted the way the worker stores one; nothing here calls a model. Recap
 * shows it in a summary panel with notes on the panels they explain; a
 * member never sees the managers' strip; Off hides it all; League Home's
 * story carries the headline.
 *
 * Needs a running PocketBase (`npm run dev`).
 */

test.afterEach(async () => {
  await cleanupTestData();
});

/**
 * The configured season, as the dashboard spec uses: League Home reads only
 * it, and the worker only rewrites its rounds, so Rewrite is offered only there.
 */
const SEASON = "E2026";

async function writtenLeague(name: string, season: string, rounds: number[]) {
  const chief = await createTestUser("writechief");
  const mate = await createTestUser("writemate");
  const league = await createLeagueFor(chief, name);
  await addMemberTo(league.id, mate, "Pancake Brigade");
  const pb = await superuser();
  const members = await pb
    .collection("league_members")
    .getFullList<{ id: string; user: string }>({ filter: `league = '${league.id}'`, requestKey: null });
  const chiefRow = members.find((row) => row.user === chief.id)!;
  const mateRow = members.find((row) => row.user === mate.id)!;
  await pb.collection("league_members").update(chiefRow.id, { team_name: "Waffle Works" }, { requestKey: null });
  await pb.collection("leagues").update(league.id, { status: "season" }, { requestKey: null });
  for (const round of rounds) {
    await pb.collection("standings_snapshots").create(
      {
        league: league.id,
        season,
        round,
        phase: "RS",
        table: [
          { memberId: chiefRow.id, totalTenths: 2271 * round, roundTenths: 2271 },
          { memberId: mateRow.id, totalTenths: 1365 * round, roundTenths: 1365 },
        ],
      },
      { requestKey: null },
    );
  }
  const star = await createPlayer("Writestar");
  return { pb, league, chief, mate, chiefRow, mateRow, star };
}

function writeupRow(
  setup: Awaited<ReturnType<typeof writtenLeague>>,
  season: string,
  round: number,
  over: Record<string, unknown> = {},
) {
  return {
    league: setup.league.id,
    season,
    round,
    kind: "round_summary",
    member: "",
    status: "ready",
    voice: "analyst",
    model: "test",
    prompt_version: "round-summary-2",
    input_hash: "a".repeat(64),
    attempts: 1,
    generated_at: "2026-10-09 12:06:00.000Z",
    refs: {
      "@T1": { kind: "member", id: setup.chiefRow.id },
      "@T2": { kind: "member", id: setup.mateRow.id },
      "#P1": { kind: "player", id: setup.star.id },
    },
    output: {
      headline: "@T1 take the night on #P1's 38.5.",
      lines: [
        "@T1 won the night with 227.1 fantasy points, carried by #P1.",
        "@T2 finished 2nd on 136.5 fantasy points.",
        "@T1 stay top of the table after the round.",
      ],
      sections: {
        under: "#P1's teammate on @T2 fell 12.1 under his average.",
        table: "@T1 lead the table, with @T2 2nd behind them.",
        stars: "#P1 was the night's star with 38.5 fantasy points.",
      },
    },
    ...over,
  };
}

test("a written round reads above the table, with notes on the panels it explains", async ({ page, context, browser }) => {
  const setup = await writtenLeague("Written Recap", SEASON, [1]);
  await setup.pb.collection("ai_writeups").create(writeupRow(setup, SEASON, 1), { requestKey: null });

  await signIn(context, setup.chief);
  await page.goto(`/l/${setup.league.id}/recap?round=1`);

  const panel = page.getByTestId("recap-writeup");
  // Names are put back at read time; a headline loses its closing full stop.
  await expect(panel.getByRole("heading", { level: 2 })).toHaveText(`Waffle Works take the night on ${shown(setup.star.name)}'s 38.5`);
  await expect(page.getByTestId("recap-writeup-lines").getByRole("listitem")).toHaveCount(3);
  await expect(panel.getByTestId("recap-writeup-under")).toContainText("Underperformers");
  await expect(panel.getByTestId("recap-writeup-over")).toHaveCount(0);
  // The analyst's other lines sit on the panels they explain.
  await expect(page.getByRole("region", { name: "The night", exact: true }).getByTestId("recap-note-table")).toContainText("lead the table");
  await expect(page.getByRole("region", { name: "Best night", exact: true }).getByTestId("recap-note-stars")).toContainText("night's star");
  await expect(page.getByTestId("recap-note-swing")).toHaveCount(0);
  // Panels never nest.
  await expect(page.locator('[data-framed="true"] [data-framed="true"]')).toHaveCount(0);

  // A team's name is a link to that team.
  await panel.getByRole("link", { name: "Waffle Works" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/l/[^/]+/[^/?]+$`));

  // The commissioner's strip is folded while all is well, and Rewrite only queues.
  await page.goto(`/l/${setup.league.id}/recap?round=1`);
  const strip = page.getByTestId("recap-writeup-strip");
  await expect(strip).not.toHaveAttribute("open");
  await expect(page.getByTestId("recap-writeup-status")).toContainText("written");
  await strip.locator("summary").click();
  await page.getByTestId("recap-writeup-rewrite").click();
  await expect(page.getByTestId("recap-writeup-status")).toContainText("rewriting");
  await expect
    .poll(async () => (await setup.pb.collection("ai_writeups").getFirstListItem(`league = '${setup.league.id}'`, { requestKey: null })).rewrite_requested_at)
    .not.toBe("");

  // A member reads the same prose and never sees the strip.
  const member = await browser.newContext();
  await signIn(member, setup.mate);
  const memberPage = await member.newPage();
  await memberPage.goto(`/l/${setup.league.id}/recap?round=1`);
  await expect(memberPage.getByTestId("recap-writeup")).toBeVisible();
  await expect(memberPage.getByTestId("recap-writeup-strip")).toHaveCount(0);
  await member.close();
});

test("a round that could not be written shows a member nothing and a manager one line", async ({ page, context, browser }) => {
  const setup = await writtenLeague("Unwritten Recap", SEASON, [1]);
  await setup.pb
    .collection("ai_writeups")
    .create(writeupRow(setup, SEASON, 1, { status: "failed", output: null, error: "stars: missing" }), { requestKey: null });

  await signIn(context, setup.chief);
  await page.goto(`/l/${setup.league.id}/recap?round=1`);
  await expect(page.getByTestId("recap-writeup-strip")).toHaveAttribute("open");
  await expect(page.getByTestId("recap-writeup-status")).toContainText("couldn't write");
  await expect(page.getByTestId("recap-writeup-lines")).toHaveCount(0);

  const member = await browser.newContext();
  await signIn(member, setup.mate);
  const memberPage = await member.newPage();
  await memberPage.goto(`/l/${setup.league.id}/recap?round=1`);
  await expect(memberPage.getByTestId("recap-table")).toBeVisible();
  await expect(memberPage.getByTestId("recap-writeup")).toHaveCount(0);
  await member.close();
});

test("write-ups off hide the round's prose; League Home's story carries the headline", async ({ page, context }) => {
  // Rounds 1–3 are finished with or without the real schedule a sibling spec
  // syncs. Whether a later round is being played depends on the calendar, so
  // the teaser is checked against whichever story League Home is telling.
  const setup = await writtenLeague("Teased League", SEASON, [1, 2, 3]);
  await setup.pb.collection("ai_writeups").create(writeupRow(setup, SEASON, 3), { requestKey: null });
  await signIn(context, setup.chief);

  await page.goto(`/l/${setup.league.id}`);
  const teaser = page.getByTestId("dashboard-writeup");
  const playing = page.getByRole("region", { name: /^Round \d+ so far$/ });
  await expect(page.getByTestId("dashboard-night").or(playing)).toBeVisible();
  if (await playing.isVisible()) {
    // A round in play owns the story panel; last round's prose waits on Recap.
    await expect(teaser).toHaveCount(0);
  } else {
    await expect(teaser).toContainText("Waffle Works take the night");
    await expect(teaser).toContainText("Read the round");
    await expect(teaser).toHaveAttribute("href", /\/recap\?round=3$/);
  }

  await page.goto(`/l/${setup.league.id}/recap?round=3`);
  await expect(page.getByTestId("recap-writeup")).toBeVisible();

  await setup.pb
    .collection("leagues")
    .update(setup.league.id, { settings: { roster_template: { G: 5, F: 5, C: 3 }, max_members: 12, ai: { enabled: false, voice: "analyst" } } }, { requestKey: null });
  await page.reload();
  await expect(page.getByTestId("recap-table")).toBeVisible();
  await expect(page.getByTestId("recap-writeup")).toHaveCount(0);
  await page.goto(`/l/${setup.league.id}`);
  await expect(teaser).toHaveCount(0);
});
