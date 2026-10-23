import { expect, test } from "@playwright/test";
import { addMemberTo, cleanupTestData, createLeagueFor, createPlayer, createTestUser, signIn, superuser } from "./helpers/session";
import { expectNotFound } from "./helpers/not-found";

const questions: string[] = [];
test.afterAll(async () => {
  const pb = await superuser();
  for (const id of questions) await pb.collection("source_player_questions").delete(id).catch(() => {});
  await cleanupTestData();
});

async function blockedLeague() {
  const owner = await createTestUser("source-approval-owner");
  const league = await createLeagueFor(owner, "Registration recovery");
  const pb = await superuser();
  const sourceId = crypto.randomUUID().replaceAll("-", "").slice(0, 24);
  await pb.collection("leagues").update(league.id, { status: "season", basketnews_team_id: sourceId, basketnews_roster_round: 6 });
  const question = await pb.collection("source_player_questions").create({
    provider: "basketnews", season: "E2026", source_id: sourceId, status: "pending", leagues: [league.id],
    details: { id: sourceId, firstName: "Christian", lastName: "Koloko", jersey: "", position: "C", club: { id: "source-club", name: "Crvena Zvezda Meridianbet Belgrade" } },
  });
  questions.push(question.id);
  await pb.collection("fantasy_syncs").create({ league: league.id, provider: "basketnews", kind: "basketnews", mode: "apply", status: "failed", round: 7, ran_at: new Date().toISOString(), message: "Lineups round 5: private session expired", moves: [], steps: [], questions: [] });
  return { owner, league, pb, sourceId, question };
}

test("an unanswered player stays visible after a later lineup failure", async ({ page, context }) => {
  const { owner, league, pb, question } = await blockedLeague();
  await signIn(context, owner);
  await page.goto(`/l/${league.id}/fantasy`);
  await expect(page.getByRole("heading", { name: "Match BasketNews players" })).toBeVisible();
  await expect(page.getByTestId("source-player-approval")).toContainText("EuroLeague registration is pending");
  await expect(page.getByRole("button", { name: "Approve source player", exact: true })).toBeVisible();
  await expect(page.getByRole("main")).toContainText("Round 6");
  await expect(page.getByTestId("fantasy-runs")).toContainText("Lineups round 5");
  // A stale submitted question is refused locally, before any provider request.
  await pb.collection("source_player_questions").delete(question.id);
  await page.getByRole("button", { name: "Approve source player", exact: true }).click();
  await expect(page.getByTestId("source-player-approval-error")).toHaveText("That player is not a question for this league.");
});

test("an existing-player mapping queues recovery and resolves the approval question", async ({ page, context }) => {
  const { owner, league, pb, sourceId, question } = await blockedLeague();
  const player = await createPlayer("RegistrationMapped", { position: "C" });
  await pb.collection("fantasy_syncs").create({ league: league.id, provider: "basketnews", kind: "basketnews", mode: "apply", status: "blocked", round: 7, ran_at: new Date(Date.now() + 1000).toISOString(), message: "A player needs mapping", moves: [], steps: [], questions: [{ kind: "player", fantasyPlayerId: sourceId, name: "Christian Koloko", club: "Crvena Zvezda Meridianbet Belgrade", jersey: "", fantasyTeamName: "BasketNews", choices: [{ id: player.id, label: "Christian Koloko" }] }] });
  await signIn(context, owner);
  await page.goto(`/l/${league.id}/fantasy`);
  await page.getByLabel("Match for Christian Koloko").selectOption(player.id);
  await page.getByTestId("fantasy-question").getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(async () => (await pb.collection("players").getOne(player.id)).basketnews_id).toBe(sourceId);
  await expect.poll(async () => (await pb.collection("source_player_questions").getOne(question.id)).status).toBe("approved");
  const jobs = await pb.collection("fantasy_syncs").getFullList({ filter: `league = '${league.id}' && status = 'queued'` });
  expect(jobs).toHaveLength(1);
});

test("a league member without manage rights cannot access source approvals", async ({ page, context }) => {
  const { league } = await blockedLeague();
  const member = await createTestUser("source-approval-member");
  await addMemberTo(league.id, member, "Member");
  await signIn(context, member);
  await page.goto(`/l/${league.id}/fantasy`);
  await expectNotFound(page);
  await expect(page.getByRole("button", { name: "Approve source player", exact: true })).toHaveCount(0);
});
