import { expect, test } from "@playwright/test";

import {
  addMemberTo,
  cleanupTestData,
  createLeagueFor,
  createPlayer,
  createTestUser,
  grantManage,
  signIn,
  superuser,
  trackLeague,
} from "./helpers/session";

/**
 * Creating and joining a league, driven through the UI as two different signed-in
 * people. Sessions come from PocketBase impersonation rather than Google — see
 * helpers/session.ts.
 *
 * Needs a running PocketBase (`npm run dev`).
 */

test.afterAll(async () => {
  await cleanupTestData();
});

const leagueIdFromUrl = (url: string): string => {
  const match = /\/leagues\/([^/?#]+)/.exec(url);
  if (!match) throw new Error(`No league id in URL: ${url}`);
  return match[1];
};

test("a commissioner creates a league and lands in its lobby", async ({
  page,
  context,
}) => {
  const commissioner = await createTestUser("commissioner");
  await signIn(context, commissioner);

  await page.goto("/");
  await expect(page.getByTestId("leagues-empty")).toBeVisible();

  await page.getByTestId("create-league-name").fill("Vafliai Test League");
  await page.getByTestId("create-league").click();

  await page.waitForURL(/\/leagues\/[^/?]+(\?|$)/);
  trackLeague(leagueIdFromUrl(page.url()));

  await expect(page.getByTestId("lobby")).toBeVisible();
  await expect(page.getByTestId("invite-code")).toHaveText(/^[A-Z2-9]{6}$/);

  // The commissioner is a member of their own league — they draft too.
  const members = page.getByTestId("member");
  await expect(members).toHaveCount(1);
  await expect(members.first()).toContainText("commissioner");
  await expect(members.first()).toContainText("you");
});

test("a second person joins with the invite code", async ({
  page,
  context,
}) => {
  const commissioner = await createTestUser("owner");
  const { id, code } = await createLeagueFor(commissioner, "Joinable League");

  const joiner = await createTestUser("joiner");
  await signIn(context, joiner);

  await page.goto("/");
  await expect(page.getByTestId("leagues-empty")).toBeVisible();

  await page.getByTestId("join-league-code").fill(code);
  await page.getByTestId("join-league").click();

  await page.waitForURL(new RegExp(`/leagues/${id}(\\?|$)`));
  await expect(page.getByTestId("member")).toHaveCount(2);

  // And it now shows up on their own leagues list.
  await page.goto("/");
  await expect(page.getByTestId("leagues-list")).toContainText(
    "Joinable League",
  );
});

test("a lowercase, spaced code still joins", async ({ page, context }) => {
  const commissioner = await createTestUser("owner2");
  const { id, code } = await createLeagueFor(
    commissioner,
    "Sloppy Code League",
  );

  const joiner = await createTestUser("joiner2");
  await signIn(context, joiner);

  await page.goto("/");
  const messy = `${code.slice(0, 3).toLowerCase()} ${code.slice(3).toLowerCase()}`;
  await page.getByTestId("join-league-code").fill(messy);
  await page.getByTestId("join-league").click();

  await page.waitForURL(new RegExp(`/leagues/${id}(\\?|$)`));
  await expect(page.getByTestId("member")).toHaveCount(2);
});

test("a wrong code is refused, and the typed value comes back", async ({
  page,
  context,
}) => {
  const user = await createTestUser("misstyper");
  await signIn(context, user);

  await page.goto("/");
  await page.getByTestId("join-league-code").fill("ZZZZZZ");
  await page.getByTestId("join-league").click();

  await expect(page.getByTestId("home-error")).toContainText(
    "No league has that invite code",
  );
  // React 19 clears uncontrolled inputs after a server-action transition, so the
  // value is echoed back deliberately rather than left for the user to retype.
  await expect(page.getByTestId("join-league-code")).toHaveValue("ZZZZZZ");
});

test("a malformed code is rejected before any lookup", async ({
  page,
  context,
}) => {
  const user = await createTestUser("misstyper2");
  await signIn(context, user);

  await page.goto("/");
  // 0, 1 and I are not in the alphabet, so this cannot be anyone's code.
  await page.getByTestId("join-league-code").fill("A0I1BC");
  await page.getByTestId("join-league").click();

  await expect(page.getByTestId("home-error")).toContainText(
    "not a valid invite code",
  );
});

test("someone else's lobby is not reachable by URL", async ({
  page,
  context,
}) => {
  const owner = await createTestUser("stranger-owner");
  const { id } = await createLeagueFor(owner, "Private League");

  const outsider = await createTestUser("outsider");
  await signIn(context, outsider);

  // The read rule refuses it, and the page answers 404 rather than "forbidden":
  // confirming a league exists would let anyone probe for it.
  const response = await page.goto(`/leagues/${id}`);
  expect(response?.status()).toBe(404);
  await expect(page.getByTestId("lobby")).toHaveCount(0);
});

test("a league whose membership write was lost repairs itself", async ({
  page,
  context,
}) => {
  // createLeague performs two writes and PocketBase has no transactions. This is
  // the reachable intermediate state: the league exists, its commissioner's
  // membership does not. ADR-0003 says that must be detectable and self-healing
  // rather than corrupt, so this asserts the healing rather than trusting it.
  const commissioner = await createTestUser("half-written");
  const { id } = await createLeagueFor(commissioner, "Half Written League", {
    withMembership: false,
  });

  await signIn(context, commissioner);

  // The commissioner can still see it: the read rule admits them by
  // commissioner id, not by membership. That is what makes repair possible.
  await page.goto("/");
  await expect(page.getByTestId("leagues-list")).toContainText(
    "Half Written League",
  );

  // Opening the lobby puts the missing row back.
  await page.goto(`/leagues/${id}`);
  await expect(page.getByTestId("member")).toHaveCount(1);
  await expect(page.getByTestId("member").first()).toContainText(
    "commissioner",
  );

  // And the repair is idempotent — a reload does not add a second row.
  await page.reload();
  await expect(page.getByTestId("member")).toHaveCount(1);
});

/**
 * A league mid-draft with a pick on the board, planted rather than clicked.
 *
 * What these specs need is the *reference* a pick makes to a membership —
 * `picks.member`, a required relation with `cascadeDelete: false` — because
 * that reference is the reason `deleteLeague` deletes drafts before it deletes
 * the league. Clicking through a draft to get one would test the pick pipeline
 * again instead.
 */
async function leagueWithABoard(name: string) {
  const commissioner = await createTestUser("chief");
  const league = await createLeagueFor(commissioner, name);
  const other = await createTestUser("other");
  await addMemberTo(league.id, other, "Other FC");
  const player = await createPlayer("Alpha", { position: "G" });

  const pb = await superuser();
  const members = await pb.collection("league_members").getFullList({
    filter: `league = '${league.id}'`,
    sort: "created",
    requestKey: null,
  });
  const draft = await pb.collection("drafts").create(
    {
      league: league.id,
      format: "snake",
      status: "live",
      order: members.map((member) => member.id),
      rounds: 13,
      current_pick: 2,
      pick_seconds: 60,
      deadline: new Date(Date.now() + 60_000).toISOString().replace("T", " "),
      seed: "delete-spec",
    },
    { requestKey: null },
  );
  await pb.collection("picks").create(
    {
      draft: draft.id,
      overall_no: 1,
      round: 1,
      slot: 1,
      member: members[0].id,
      player: player.id,
      is_auto: false,
    },
    { requestKey: null },
  );
  await pb
    .collection("leagues")
    .update(league.id, { status: "drafting" }, { requestKey: null });

  return { commissioner, other, league, members };
}

test("the commissioner deletes the league, board and all", async ({
  page,
  context,
}) => {
  const { commissioner, league } = await leagueWithABoard("Doomed League");
  await signIn(context, commissioner);

  await page.goto(`/leagues/${league.id}`);
  await page.getByTestId("delete-league-toggle").click();

  // The wrong name is not a confirmation.
  await page.getByTestId("delete-league-confirm").fill("Doomed");
  await page.getByTestId("delete-league").click();
  await expect(page.getByTestId("delete-league-error")).toContainText(
    "Doomed League",
  );
  await expect(page.getByTestId("lobby")).toBeVisible();

  // React 19 empties the field across the transition (AGENTS.md).
  await page.getByTestId("delete-league-confirm").fill("doomed league  ");
  await page.getByTestId("delete-league").click();

  // Home, and the league is not there to open — which also proves the delete
  // order: a pick still pointed at a membership, and PocketBase refuses to
  // delete a member while one does.
  await expect(page).toHaveURL("/");
  const gone = await page.goto(`/leagues/${league.id}`);
  expect(gone?.status()).toBe(404);
});

test("a deputy is trusted to help run the league, not to end it", async ({
  page,
  context,
}) => {
  const { league, other } = await leagueWithABoard("Deputy League");
  await grantManage(league.id, other);
  await signIn(context, other);

  await page.goto(`/leagues/${league.id}`);
  await expect(page.getByTestId("lobby")).toBeVisible();
  // They can manage members; they cannot end the league. `deleteLeague`
  // refuses a deputy regardless of what is on screen.
  await expect(page.getByTestId("delete-league-toggle")).toHaveCount(0);
});

test("a lobby open elsewhere does not sit there empty after a delete", async ({
  page,
  context,
}) => {
  // What the rest of the league sees. The cascade takes every membership at
  // once, so the live list would otherwise render an empty lobby forever —
  // which looks like a bug rather than like a deleted league.
  const { commissioner, other, league } = await leagueWithABoard("Watched League");
  await signIn(context, other);
  await page.goto(`/leagues/${league.id}`);
  await expect(page.getByTestId("member-list")).toBeVisible();

  const owner = await context.browser()!.newContext();
  await signIn(owner, commissioner);
  const ownerPage = await owner.newPage();
  await ownerPage.goto(`/leagues/${league.id}`);
  await ownerPage.getByTestId("delete-league-toggle").click();
  await ownerPage.getByTestId("delete-league-confirm").fill("Watched League");
  await ownerPage.getByTestId("delete-league").click();
  await expect(ownerPage).toHaveURL("/");

  // Nobody touched the watching tab: the memberships vanish, it asks the
  // server what it should be showing, and there is no league to show.
  await expect(page.getByTestId("lobby")).toHaveCount(0, { timeout: 15_000 });
  await owner.close();
});
