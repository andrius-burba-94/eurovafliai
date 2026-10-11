import { expect, test, type Page } from "@playwright/test";

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
 * Your round — slice 7.3 D (option A of #203, Recap only). Briefs are planted
 * the way the worker stores them; nothing here calls a model. A member reads
 * their own brief first in Recap's reading column, tagged from their place on
 * the night; another member's brief reaches neither the page nor the wire.
 *
 * Needs a running PocketBase (`npm run dev`).
 */

test.afterEach(async () => {
  await cleanupTestData();
});

const SEASON = "E2026";

/** Three teams, so round 1 has one of each verdict: won, held, lost. */
async function briefedLeague(name: string) {
  const chief = await createTestUser("briefchief");
  const mate = await createTestUser("briefmate");
  const third = await createTestUser("briefthird");
  const league = await createLeagueFor(chief, name);
  await addMemberTo(league.id, mate, "Pancake Brigade");
  await addMemberTo(league.id, third, "Syrup Squad");
  const pb = await superuser();
  const members = await pb
    .collection("league_members")
    .getFullList<{ id: string; user: string }>({ filter: `league = '${league.id}'`, requestKey: null });
  const rowOf = (user: { id: string }) => members.find((row) => row.user === user.id)!;
  const [chiefRow, mateRow, thirdRow] = [rowOf(chief), rowOf(mate), rowOf(third)];
  await pb.collection("league_members").update(chiefRow.id, { team_name: "Waffle Works" }, { requestKey: null });
  await pb.collection("leagues").update(league.id, { status: "season" }, { requestKey: null });
  for (const round of [1, 2]) {
    await pb.collection("standings_snapshots").create(
      {
        league: league.id,
        season: SEASON,
        round,
        phase: "RS",
        table: [
          { memberId: chiefRow.id, totalTenths: 2271 * round, roundTenths: 2271 },
          { memberId: mateRow.id, totalTenths: 1802 * round, roundTenths: 1802 },
          { memberId: thirdRow.id, totalTenths: 1365 * round, roundTenths: 1365 },
        ],
      },
      { requestKey: null },
    );
  }
  const star = await createPlayer("Briefstar");
  return { pb, league, chief, mate, third, chiefRow, mateRow, thirdRow, star };
}

type Setup = Awaited<ReturnType<typeof briefedLeague>>;

const CHIEF_BRIEF = {
  result: "You won the night in 1st, carried by #P1's 38.5 fantasy points as captain.",
  standing: "You lead @T2 by 46.9 fantasy points, and you are rising.",
  next: "Round 2 is an easy run for your roster, and the Scout has no move worth making.",
};
const MATE_BRIEF = {
  result: "You held the night in 2nd, short of the top by a single bench half.",
  standing: "You are 46.9 fantasy points behind @T1 and clear of the team below.",
  next: "Round 2 is a hard run for your roster, and the Scout likes a guard swap.",
};

function briefRow(setup: Setup, memberId: string, output: Record<string, string> | null, over: Record<string, unknown> = {}) {
  return {
    league: setup.league.id,
    season: SEASON,
    round: 1,
    kind: "round_brief",
    member: memberId,
    status: "ready",
    voice: "analyst",
    model: "test",
    prompt_version: "round-brief-3",
    input_hash: "b".repeat(64),
    attempts: 1,
    generated_at: "2026-10-11 12:06:00.000Z",
    refs: {
      "@T1": { kind: "member", id: setup.chiefRow.id },
      "@T2": { kind: "member", id: setup.mateRow.id },
      "#P1": { kind: "player", id: setup.star.id },
    },
    output,
    ...over,
  };
}

/** Every response body the page receives from here on, read in full. */
function captureResponses(page: Page) {
  const bodies: Promise<string>[] = [];
  page.on("response", (response) => {
    bodies.push(response.text().catch(() => ""));
  });
  return async () => (await Promise.all(bodies)).join("\n");
}

test("a member reads their own round, tagged from their place, and nobody else's", async ({ page, context, browser }) => {
  const setup = await briefedLeague("Briefed Recap");
  await setup.pb.collection("ai_writeups").create(briefRow(setup, setup.chiefRow.id, CHIEF_BRIEF), { requestKey: null });
  await setup.pb.collection("ai_writeups").create(briefRow(setup, setup.mateRow.id, MATE_BRIEF), { requestKey: null });

  await signIn(context, setup.chief);
  const received = captureResponses(page);
  await page.goto(`/l/${setup.league.id}/recap?round=1`);

  const panel = page.getByTestId("recap-brief");
  await expect(panel.getByRole("heading", { level: 2 })).toHaveText("Your round");
  await expect(page.getByTestId("recap-brief-verdict")).toHaveText("won");
  await expect(page.getByTestId("recap-brief-verdict")).toHaveAttribute("data-verdict", "won");
  await expect(panel).toContainText("Round 1");
  // Three labelled lines, names put back at read time.
  await expect(panel.getByRole("term")).toHaveText(["Night", "Table", "Next"]);
  await expect(page.getByTestId("recap-brief-result")).toContainText(`carried by ${shown(setup.star.name)}'s 38.5 fantasy points`);
  await expect(page.getByTestId("recap-brief-standing")).toContainText("You lead Pancake Brigade by 46.9");
  // First in the reading column: above The night.
  const column = page.getByTestId("recap-brief").locator("xpath=..");
  await expect(column.locator(":scope > section").first()).toHaveAttribute("data-testid", "recap-brief");
  await expect(page.locator('[data-framed="true"] [data-framed="true"]')).toHaveCount(0);

  // Another member's brief is on neither the page nor the wire.
  await expect(page.locator("body")).not.toContainText("single bench half");
  const wire = await received();
  // The capture sees the viewer's own brief, so its silence on the other one means something.
  expect(wire).toContain("fantasy points as captain");
  expect(wire).not.toContain("single bench half");

  // Names are links: a player goes to his page, a team to that team.
  await expect(panel.getByRole("link", { name: shown(setup.star.name) })).toHaveAttribute("href", /\/players?\//);
  await panel.getByRole("link", { name: "Pancake Brigade" }).click();
  await expect(page).toHaveURL(new RegExp(`/l/[^/]+/[^/?]+$`));

  // The middle of the night held; the mate reads only their own.
  const mate = await browser.newContext();
  await signIn(mate, setup.mate);
  const matePage = await mate.newPage();
  const mateReceived = captureResponses(matePage);
  await matePage.goto(`/l/${setup.league.id}/recap?round=1`);
  await expect(matePage.getByTestId("recap-brief-verdict")).toHaveText("held");
  await expect(matePage.getByTestId("recap-brief-result")).toContainText("single bench half");
  await expect(matePage.locator("body")).not.toContainText("fantasy points as captain");
  const mateWire = await mateReceived();
  expect(mateWire).toContain("single bench half");
  expect(mateWire).not.toContain("fantasy points as captain");
  await mate.close();

  // A member with no brief reads Recap as it was.
  const third = await browser.newContext();
  await signIn(third, setup.third);
  const thirdPage = await third.newPage();
  await thirdPage.goto(`/l/${setup.league.id}/recap?round=1`);
  await expect(thirdPage.getByTestId("recap-table")).toBeVisible();
  await expect(thirdPage.getByTestId("recap-brief")).toHaveCount(0);
  await third.close();
});

test("a round without a brief, or with a failed one, shows Recap unchanged; League Home never shows one", async ({ page, context }) => {
  const setup = await briefedLeague("Unbriefed Recap");
  await setup.pb.collection("ai_writeups").create(briefRow(setup, setup.chiefRow.id, CHIEF_BRIEF), { requestKey: null });
  await setup.pb
    .collection("ai_writeups")
    .create(briefRow(setup, setup.chiefRow.id, null, { round: 2, status: "failed", error: "@T1 result: missing" }), { requestKey: null });

  await signIn(context, setup.chief);
  await page.goto(`/l/${setup.league.id}/recap?round=2`);
  await expect(page.getByTestId("recap-table")).toBeVisible();
  await expect(page.getByTestId("recap-brief")).toHaveCount(0);

  await setup.pb.collection("ai_writeups").delete(
    (await setup.pb.collection("ai_writeups").getFirstListItem(`league = '${setup.league.id}' && round = 2`, { requestKey: null })).id,
    { requestKey: null },
  );
  await page.reload();
  await expect(page.getByTestId("recap-table")).toBeVisible();
  await expect(page.getByTestId("recap-brief")).toHaveCount(0);

  await page.goto(`/l/${setup.league.id}`);
  await expect(page.getByTestId("dashboard-night").or(page.getByRole("region", { name: /^Round \d+ so far$/ }))).toBeVisible();
  await expect(page.getByTestId("recap-brief")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("fantasy points as captain");
});

test("write-ups off hide Your round", async ({ page, context }) => {
  const setup = await briefedLeague("Quiet Recap");
  await setup.pb.collection("ai_writeups").create(briefRow(setup, setup.chiefRow.id, CHIEF_BRIEF), { requestKey: null });
  await signIn(context, setup.chief);

  await page.goto(`/l/${setup.league.id}/recap?round=1`);
  await expect(page.getByTestId("recap-brief")).toBeVisible();

  await setup.pb
    .collection("leagues")
    .update(setup.league.id, { settings: { roster_template: { G: 5, F: 5, C: 3 }, max_members: 12, ai: { enabled: false, voice: "analyst" } } }, { requestKey: null });
  await page.reload();
  await expect(page.getByTestId("recap-table")).toBeVisible();
  await expect(page.getByTestId("recap-brief")).toHaveCount(0);
});
