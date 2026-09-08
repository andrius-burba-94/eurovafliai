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
 * The season roster page — slice 5.1.
 *
 * Memberships are planted rather than produced through a last pick, because
 * this spec is the page: a name on the lobby opens the squad that member holds.
 */

test.afterEach(async () => {
  await cleanupTestData();
});

test("a member opens a roster from the season lobby", async ({
  page,
  context,
}) => {
  const commissioner = await createTestUser("rosterchief");
  const league = await createLeagueFor(commissioner, "Roster League");
  const pb = await superuser();
  const members = await pb.collection("league_members").getFullList<{
    id: string;
    user: string;
  }>({
    filter: `league = '${league.id}'`,
    requestKey: null,
  });
  const chief = members.find((row) => row.user === commissioner.id);
  if (!chief) throw new Error("membership missing");

  const star = await createPlayer("Rostered");
  const draft = await pb.collection("drafts").create(
    {
      league: league.id,
      format: "linear",
      status: "complete",
      order: [chief.id],
      rounds: 1,
      seed: "roster-e2e",
    },
    { requestKey: null },
  );
  await pb.collection("picks").create(
    {
      draft: draft.id,
      overall_no: 1,
      round: 1,
      slot: 1,
      member: chief.id,
      player: star.id,
      is_auto: false,
    },
    { requestKey: null },
  );
  await pb.collection("roster_memberships").create(
    {
      league: league.id,
      member: chief.id,
      player: star.id,
      from_date: "2026-09-08 12:00:00.000Z",
      to_date: "",
      acquired_via: "draft",
    },
    { requestKey: null },
  );
  await pb
    .collection("leagues")
    .update(league.id, { status: "season" }, { requestKey: null });

  await signIn(context, commissioner);
  await page.goto(`/leagues/${league.id}`);
  await expect(page.getByTestId("enter-roster")).toBeVisible();
  await page.getByTestId("enter-roster").click();

  await expect(page.getByTestId("roster")).toBeVisible();
  await expect(page.getByTestId("roster-list")).toBeVisible();
  await expect(page.getByTestId("roster-player")).toContainText(star.name);
  await expect(page.getByTestId("roster-radar")).toBeVisible();

  await page.getByTestId("roster-player").getByRole("link").click();
  await expect(page.getByTestId("player-log")).toBeVisible();
  await page.getByRole("link", { name: "The roster" }).click();
  await expect(page.getByTestId("roster")).toBeVisible();
});

test("a member of another league cannot read this roster", async ({
  page,
  context,
}) => {
  const owner = await createTestUser("rosterowner");
  const league = await createLeagueFor(owner, "Private Roster");
  const pb = await superuser();
  const members = await pb.collection("league_members").getFullList<{
    id: string;
    user: string;
  }>({
    filter: `league = '${league.id}'`,
    requestKey: null,
  });
  const ownerMember = members.find((row) => row.user === owner.id);
  if (!ownerMember) throw new Error("membership missing");

  await pb
    .collection("leagues")
    .update(league.id, { status: "season" }, { requestKey: null });

  const stranger = await createTestUser("rosterstranger");
  await createLeagueFor(stranger, "Elsewhere");
  await signIn(context, stranger);
  await page.goto(`/leagues/${league.id}/teams/${ownerMember.id}`);
  await expect(page.getByTestId("roster")).toHaveCount(0);
});

test("an outsider is not offered a roster link in a setup lobby", async ({
  page,
  context,
}) => {
  const user = await createTestUser("setuproster");
  const league = await createLeagueFor(user, "Still Setup");
  await addMemberTo(league.id, await createTestUser("setupmate"), "Mate FC");
  await signIn(context, user);
  await page.goto(`/leagues/${league.id}`);
  await expect(page.getByTestId("member-list")).toBeVisible();
  await expect(page.getByTestId("enter-roster")).toHaveCount(0);
});
