import { expect, test } from "@playwright/test";

import {
  addMemberTo,
  cleanupTestData,
  createLeagueFor,
  createPlayer,
  createTestUser,
  signIn,
  TEST_CLUB,
} from "./helpers/session";

/**
 * The pick pipeline — slice 2.4.
 *
 * The property worth proving in a browser is the one draft night depends on:
 * the server decides whose turn it is, a pick lands once, and the draft moves
 * on. The races that the unique indexes exist to stop are asserted here too,
 * because "unlikely" and "impossible" look identical until one happens.
 */

test.afterEach(async () => {
  await cleanupTestData();
});

/** A league with two members, an order, and a small pool of its own. */
async function readyLeague(name: string) {
  const commissioner = await createTestUser("chief");
  const league = await createLeagueFor(commissioner, name);
  const other = await createTestUser("other");
  await addMemberTo(league.id, other, "Other FC");
  const players = await Promise.all([
    createPlayer("Alpha", { position: "G" }),
    createPlayer("Bravo", { position: "F" }),
    createPlayer("Charlie", { position: "C" }),
  ]);
  return { commissioner, league, other, players };
}

test("a commissioner starts the draft and the room opens", async ({
  page,
  context,
}) => {
  const { commissioner, league } = await readyLeague("Kickoff League");
  await signIn(context, commissioner);

  await page.goto(`/leagues/${league.id}`);
  // No order yet, so no way to start.
  await expect(page.getByTestId("start-draft")).toHaveCount(0);

  await page.getByTestId("draft-roll").click();
  await expect(page.getByTestId("member-position")).toHaveCount(2);

  await page.getByTestId("start-draft").click();
  await expect(page.getByTestId("enter-draft")).toBeVisible();

  await page.getByTestId("enter-draft").click();
  await expect(page.getByTestId("draft-room")).toBeVisible();
  await expect(page.getByTestId("on-the-clock")).toContainText(/on the clock/i);
});

test("the member on the clock picks, and the draft advances", async ({
  page,
  context,
}) => {
  const { commissioner, league, players } = await readyLeague("Picking League");
  await signIn(context, commissioner);

  await page.goto(`/leagues/${league.id}`);
  await page.getByTestId("draft-roll").click();
  await page.getByTestId("start-draft").click();
  await page.getByTestId("enter-draft").click();

  await page.getByTestId("pool-search").fill(TEST_CLUB);
  const onClock = page.getByTestId("on-the-clock");
  const before = await onClock.innerText();

  // Whoever is on the clock picks; if it is not this viewer, the commissioner
  // may pick on their behalf, which is the manual-entry path 3.6 formalises.
  await page.getByTestId(`pick-${players[0]!.id}`).click();

  await expect(page.getByTestId("pick-list")).toContainText(players[0]!.name);
  await expect(page.getByTestId("board-pick")).toHaveCount(1);
  // The slot moved on.
  await expect(onClock).not.toHaveText(before);
});

test("a stale tab cannot draft a player who is already gone", async ({
  page,
  context,
}) => {
  // The `unique(draft, player)` index is the backstop; this is the layer in
  // front of it. Two tabs, the second rendered before the pick landed, so its
  // button is still offering a player who no longer exists in the pool.
  const { commissioner, league, players } = await readyLeague("Race League");
  await signIn(context, commissioner);

  await page.goto(`/leagues/${league.id}`);
  await page.getByTestId("draft-roll").click();
  await page.getByTestId("start-draft").click();
  await page.getByTestId("enter-draft").click();
  await page.getByTestId("pool-search").fill(TEST_CLUB);

  const stale = await context.newPage();
  await stale.goto(`/leagues/${league.id}/draft`);
  await stale.getByTestId("pool-search").fill(TEST_CLUB);
  await expect(stale.getByTestId(`pick-${players[0]!.id}`)).toBeVisible();

  await page.getByTestId(`pick-${players[0]!.id}`).click();
  await expect(page.getByTestId("board-pick")).toHaveCount(1);

  // The stale tab submits anyway. The server refuses, and says why.
  await stale.getByTestId(`pick-${players[0]!.id}`).click();
  await expect(stale.getByTestId("pick-error")).toBeVisible();
  await expect(stale.getByTestId("board-pick")).toHaveCount(1);

  // And after the refusal the pool is honest again.
  await stale.getByTestId("pool-search").fill(TEST_CLUB);
  await expect(stale.getByTestId(`pick-${players[0]!.id}`)).toHaveCount(0);
  await stale.close();
});

test("a pick that would break the roster template is refused", async ({
  page,
  context,
}) => {
  // 5G / 5F / 3C, so nobody may hold a fourth center.
  //
  // Snake over two members runs A B B A A B B, so seeding the pool with three
  // guards and four centers and picking in order gives the second member three
  // centers by pick 6 — and their seventh pick is the one that has to be
  // refused. Every pick here is entered by the commissioner, who may pick for
  // whoever is on the clock, so the roll's outcome does not change the shape.
  const commissioner = await createTestUser("shape");
  const league = await createLeagueFor(commissioner, "Shape League");
  await addMemberTo(league.id, await createTestUser("mate"), "Mate FC");
  const guards = await Promise.all(
    ["G one", "G two", "G three", "G four"].map((label) =>
      createPlayer(label, { position: "G" }),
    ),
  );
  const centers = await Promise.all(
    ["C one", "C two", "C three", "C four"].map((label) =>
      createPlayer(label, { position: "C" }),
    ),
  );
  await signIn(context, commissioner);

  await page.goto(`/leagues/${league.id}`);
  await page.getByTestId("draft-roll").click();
  await page.getByTestId("start-draft").click();
  await page.getByTestId("enter-draft").click();

  const order = [
    guards[0]!,
    centers[0]!,
    centers[1]!,
    guards[1]!,
    guards[2]!,
    centers[2]!,
  ];
  for (const [index, player] of order.entries()) {
    await page.getByTestId("pool-search").fill(TEST_CLUB);
    await page.getByTestId(`pick-${player.id}`).click();
    await expect(page.getByTestId("board-pick")).toHaveCount(index + 1);
  }

  // Pick 7 belongs to the member already holding C one, C two and C three.
  await page.getByTestId("pool-search").fill(TEST_CLUB);
  await page.getByTestId(`pick-${centers[3]!.id}`).click();
  // The engine's own words: "You have all the Cs you can hold."
  await expect(page.getByTestId("pick-error")).toContainText(/all the Cs/i);
  await expect(page.getByTestId("board-pick")).toHaveCount(6);

  // A legal pick still goes through, so the refusal was about the bucket and
  // not about the draft having wedged itself.
  await page.getByTestId("pool-search").fill(TEST_CLUB);
  await page.getByTestId(`pick-${guards[3]!.id}`).click();
  await expect(page.getByTestId("board-pick")).toHaveCount(7);
});

test("the commissioner pauses the draft, and picking stops", async ({
  page,
  context,
}) => {
  const { commissioner, league, players } = await readyLeague("Pause League");
  await signIn(context, commissioner);

  await page.goto(`/leagues/${league.id}`);
  await page.getByTestId("draft-roll").click();
  await page.getByTestId("start-draft").click();
  await page.getByTestId("enter-draft").click();
  await page.getByTestId("pool-search").fill(TEST_CLUB);
  // The button is there before the pause, which is what makes its absence
  // afterwards mean something.
  await expect(page.getByTestId(`pick-${players[0]!.id}`)).toBeVisible();

  await page.getByTestId("draft-pause").click();
  await expect(page.getByTestId("on-the-clock")).toContainText(/paused/i);

  // The pool is still readable — you just cannot pick from it.
  await page.getByTestId("pool-search").fill(TEST_CLUB);
  await expect(page.getByTestId("pool-row")).not.toHaveCount(0);
  await expect(page.getByTestId(`pick-${players[0]!.id}`)).toHaveCount(0);

  await page.getByTestId("draft-pause").click();
  await expect(page.getByTestId("on-the-clock")).not.toContainText(/paused/i);
  await page.getByTestId("pool-search").fill(TEST_CLUB);
  await expect(page.getByTestId(`pick-${players[0]!.id}`)).toBeVisible();
});

test("a pick from a tab that has not seen the pause is refused", async ({
  page,
  context,
}) => {
  // Hiding the button is a courtesy; the server check is the rule. This is the
  // real shape of it — one tab pauses, another is still showing the pick it
  // rendered a second earlier.
  const { commissioner, league, players } = await readyLeague("Stale League");
  await signIn(context, commissioner);

  await page.goto(`/leagues/${league.id}`);
  await page.getByTestId("draft-roll").click();
  await page.getByTestId("start-draft").click();
  await page.getByTestId("enter-draft").click();
  await page.getByTestId("pool-search").fill(TEST_CLUB);
  await expect(page.getByTestId(`pick-${players[0]!.id}`)).toBeVisible();

  const other = await context.newPage();
  await other.goto(`/leagues/${league.id}/draft`);
  await other.getByTestId("draft-pause").click();
  await expect(other.getByTestId("on-the-clock")).toContainText(/paused/i);

  // The first tab never learned. Its submission has to be refused server-side.
  await page.getByTestId(`pick-${players[0]!.id}`).click();
  await expect(page.getByTestId("pick-error")).toContainText(/paused/i);
  await expect(other.getByTestId("board-pick")).toHaveCount(0);
  await other.close();
});

test("the commissioner undoes a pick, and the board goes back", async ({
  page,
  context,
}) => {
  // The mistake this exists for: a pick entered for the wrong member, noticed
  // two picks later. Undo has to take back everything since, not just the last
  // one, and it has to leave the draft paused rather than restart a clock into
  // the same mistake.
  const { commissioner, league, players } = await readyLeague("Undo League");
  await signIn(context, commissioner);

  await page.goto(`/leagues/${league.id}`);
  await page.getByTestId("draft-roll").click();
  await page.getByTestId("start-draft").click();
  await page.getByTestId("enter-draft").click();

  for (const [index, player] of players.entries()) {
    await page.getByTestId("pool-search").fill(TEST_CLUB);
    await page.getByTestId(`pick-${player.id}`).click();
    await expect(page.getByTestId("board-pick")).toHaveCount(index + 1);
  }

  await page.getByTestId("draft-undo-toggle").click();
  await page.getByTestId("draft-undo-target").fill("2");
  await page.getByTestId("draft-undo").click();

  // Picks 2 and 3 are gone; pick 1 stands.
  await expect(page.getByTestId("board-pick")).toHaveCount(1);
  await expect(page.getByTestId("pick-list")).toContainText(players[0]!.name);
  await expect(page.getByTestId("pick-list")).not.toContainText(
    players[1]!.name,
  );
  await expect(page.getByTestId("on-the-clock")).toContainText(/paused/i);

  // And the two undone players are pickable again.
  await page.getByTestId("draft-pause").click();
  await page.getByTestId("pool-search").fill(TEST_CLUB);
  await expect(page.getByTestId(`pick-${players[1]!.id}`)).toBeVisible();
  await page.getByTestId(`pick-${players[1]!.id}`).click();
  await expect(page.getByTestId("board-pick")).toHaveCount(2);
});

test("the undo refuses a pick number that has nothing behind it", async ({
  page,
  context,
}) => {
  const { commissioner, league, players } = await readyLeague("Refuse League");
  await signIn(context, commissioner);

  await page.goto(`/leagues/${league.id}`);
  await page.getByTestId("draft-roll").click();
  await page.getByTestId("start-draft").click();
  await page.getByTestId("enter-draft").click();
  await page.getByTestId("pool-search").fill(TEST_CLUB);
  await page.getByTestId(`pick-${players[0]!.id}`).click();
  await expect(page.getByTestId("board-pick")).toHaveCount(1);

  await page.getByTestId("draft-undo-toggle").click();
  // Nothing has been picked at 5 or later, so there is nothing to discard —
  // and the board must be left exactly as it was.
  await page.getByTestId("draft-undo-target").fill("5");
  await page.getByTestId("draft-undo").click();
  await expect(page.getByTestId("draft-undo-error")).toBeVisible();
  await expect(page.getByTestId("board-pick")).toHaveCount(1);
});

test("an ordinary member gets no draft controls at all", async ({
  page,
  context,
}) => {
  // The buttons are hidden and the actions refuse — `pb:verify` covers the
  // collection rules underneath, this covers the surface.
  const { commissioner, league, other } = await readyLeague("Quiet League");
  await signIn(context, commissioner);
  await page.goto(`/leagues/${league.id}`);
  await page.getByTestId("draft-roll").click();
  await page.getByTestId("start-draft").click();
  await expect(page.getByTestId("enter-draft")).toBeVisible();

  const member = await context.browser()!.newContext();
  await signIn(member, other);
  const theirs = await member.newPage();
  await theirs.goto(`/leagues/${league.id}/draft`);
  await expect(theirs.getByTestId("draft-room")).toBeVisible();
  await expect(theirs.getByTestId("draft-pause")).toHaveCount(0);
  await expect(theirs.getByTestId("draft-undo-toggle")).toHaveCount(0);
  await member.close();
});
