import { expect, test } from "@playwright/test";

import { whoIsOnClock } from "../../src/lib/engine";
import {
  commitPick,
  findUnfinishedDraft,
  readPicks,
  toState,
} from "../../src/lib/drafts/pipeline";

import { withoutRealtime } from "./helpers/realtime";
import {
  addMemberTo,
  cleanupTestData,
  createLeagueFor,
  createPlayer,
  createTestUser,
  signIn,
  superuser,
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

/**
 * A pick made the way the app makes one, but by nobody the browser can see.
 *
 * Goes through the real pipeline — the same `commitPick` a tapped button and
 * the worker's sweep both use — so the pick lands with the right round, slot
 * and advance. Driving another browser instead would prove the same thing far
 * more slowly, and this is about what the *watching* page does.
 */
async function pickBehindTheirBack(leagueId: string, playerId: string) {
  const pb = await superuser();
  const draft = await findUnfinishedDraft(pb, leagueId);
  if (!draft) throw new Error("no live draft to pick in");
  const picks = await readPicks(pb, draft.id);
  const onClock = whoIsOnClock(toState(draft), picks);
  if (!onClock) throw new Error("nobody is on the clock");
  const outcome = await commitPick(pb, {
    draft,
    onClock,
    playerId,
    isAuto: false,
    picks,
    now: new Date(),
  });
  if (outcome !== "landed") throw new Error(`pick did not land: ${outcome}`);
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
  // textContent, not innerText: `toHaveText` compares textContent, and these
  // headings are CSS-uppercased — so an innerText baseline could never match
  // and the "it moved on" assertion below would pass even if it had not.
  const before = await onClock.textContent();

  // Whoever is on the clock picks; if it is not this viewer, the commissioner
  // may pick on their behalf, which is the manual-entry path 3.6 formalises.
  await page.getByTestId(`pick-${players[0]!.id}`).click();

  await expect(page.getByTestId("pick-list")).toContainText(players[0]!.name);
  await expect(page.getByTestId("board-pick")).toHaveCount(1);
  // The slot moved on.
  await expect(onClock).not.toHaveText(before ?? "");
  await expect(onClock).toContainText("round 1");
  await expect(onClock).toContainText("Pick 2");
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
  await withoutRealtime(stale);
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
  // Wait for the room before reloading it: `enter-draft` is a navigation, and
  // reloading while it is still in flight reloads the *lobby* — which has a
  // reconnecting note of its own and no pool, so the failure looks like the
  // feature is broken when the spec simply looked at the wrong page.
  await expect(page.getByTestId("draft-room")).toBeVisible();

  // From here this tab hears nothing — and says so, which is the difference
  // between a stale room and a room that looks current and is not.
  await withoutRealtime(page);
  await page.reload();
  // Longer than the component's own connect grace, which is 5s: the room waits
  // that long before calling itself deaf, and an assertion that expires first
  // would fail for the wrong reason.
  await expect(page.getByTestId("draft-reconnecting")).toBeVisible({
    timeout: 10_000,
  });
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

test("undoing pauses the draft before it deletes anything", async ({
  page,
  context,
}) => {
  // Not cosmetic. If the draft is still live while picks are being deleted, a
  // pick submitted mid-loop lands above the target, survives the delete, and
  // leaves a slot nothing can ever fill — the draft can then never complete.
  // Observable from outside as: the pause is in place by the time the undo
  // has finished, and a submission afterwards is refused.
  const { commissioner, league, players } = await readyLeague("Order League");
  await signIn(context, commissioner);

  await page.goto(`/leagues/${league.id}`);
  await page.getByTestId("draft-roll").click();
  await page.getByTestId("start-draft").click();
  await page.getByTestId("enter-draft").click();
  await page.getByTestId("pool-search").fill(TEST_CLUB);
  await page.getByTestId(`pick-${players[0]!.id}`).click();
  await expect(page.getByTestId("board-pick")).toHaveCount(1);

  // A second tab, rendered before the undo and deaf to it.
  const other = await context.newPage();
  await withoutRealtime(other);
  await other.goto(`/leagues/${league.id}/draft`);
  await other.getByTestId("pool-search").fill(TEST_CLUB);
  await expect(other.getByTestId(`pick-${players[1]!.id}`)).toBeVisible();

  await page.getByTestId("draft-undo-toggle").click();
  await page.getByTestId("draft-undo-target").fill("1");
  await page.getByTestId("draft-undo").click();
  await expect(page.getByTestId("board-pick")).toHaveCount(0);

  // The stale tab's pick has to be refused, not accepted into a paused draft.
  await other.getByTestId(`pick-${players[1]!.id}`).click();
  await expect(other.getByTestId("pick-error")).toContainText(/paused/i);
  await expect(page.getByTestId("on-the-clock")).toContainText(/paused/i);
  await other.close();
});

test("a league that has already drafted cannot be started again", async ({
  page,
  context,
}) => {
  // A finished draft plus a replayed Start would create a second draft, and
  // the room reads the newest — so every roster in the league would vanish.
  const commissioner = await createTestUser("done");
  const league = await createLeagueFor(commissioner, "Done League");
  await addMemberTo(league.id, await createTestUser("pal"), "Pal FC");
  await signIn(context, commissioner);

  await page.goto(`/leagues/${league.id}`);
  await page.getByTestId("draft-roll").click();
  await page.getByTestId("start-draft").click();
  await expect(page.getByTestId("enter-draft")).toBeVisible();

  // Once a draft exists, the lobby no longer offers Start at all — the guard
  // underneath it is what `startDraft` refuses on, and it is covered by the
  // draft-setup unit path. Here: the lobby cannot be used to double-start.
  await expect(page.getByTestId("start-draft")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("start-draft")).toHaveCount(0);
  await expect(page.getByTestId("enter-draft")).toBeVisible();
});

test("a pick by somebody else moves the room, with nobody reloading", async ({
  page,
  context,
}) => {
  // The bug the first real two-device draft found: the room was rendered per
  // request, so "X is on the clock" sat there naming a member who had already
  // picked, and the only thing that ever moved a screen by itself was a
  // deadline passing. Slice 3.2a subscribes; this is the assertion.
  const { commissioner, league, players } = await readyLeague("Live League");
  await signIn(context, commissioner);

  await page.goto(`/leagues/${league.id}`);
  await page.getByTestId("draft-roll").click();
  await page.getByTestId("start-draft").click();
  await page.getByTestId("enter-draft").click();

  await expect(page.getByTestId("on-the-clock")).toContainText("Pick 1");
  await expect(page.getByTestId("board-pick")).toHaveCount(0);

  // Somebody else's phone, in another room.
  await pickBehindTheirBack(league.id, players[0].id);

  // No `page.reload()` anywhere below, and that is the whole point.
  await expect(page.getByTestId("board-pick")).toHaveCount(1, {
    timeout: 15_000,
  });
  await expect(page.getByTestId("board-pick")).toContainText(players[0].name);
  // The clock moved on to the next member, which is the part that was wrong.
  await expect(page.getByTestId("on-the-clock")).toContainText("Pick 2");
});

test("a pause reaches a room nobody is touching", async ({
  page,
  context,
}) => {
  // The `drafts` record topic rather than the `picks` one: a pause is a change
  // to the draft itself, and a room that missed it would keep offering a pick
  // the server is about to refuse.
  const { commissioner, league } = await readyLeague("Pause League");
  await signIn(context, commissioner);

  await page.goto(`/leagues/${league.id}`);
  await page.getByTestId("draft-roll").click();
  await page.getByTestId("start-draft").click();
  await page.getByTestId("enter-draft").click();
  await expect(page.getByTestId("on-the-clock")).toContainText("Pick 1");

  const pb = await superuser();
  const draft = await findUnfinishedDraft(pb, league.id);
  await pb
    .collection("drafts")
    .update(draft!.id, { status: "paused" }, { requestKey: null });

  await expect(page.getByTestId("on-the-clock")).toContainText(
    "The draft is paused",
    { timeout: 15_000 },
  );
});

test("the commissioner starts over, and the league is back in the lobby", async ({
  page,
  context,
}) => {
  // The tool the first real draft went looking for: undo takes the board back
  // to a pick, and there was nothing that threw a practice draft away.
  const { commissioner, league, players } = await readyLeague("Reset League");
  await signIn(context, commissioner);

  await page.goto(`/leagues/${league.id}`);
  await page.getByTestId("draft-roll").click();
  await expect(page.getByTestId("member-position")).toHaveCount(2);
  await page.getByTestId("start-draft").click();
  await page.getByTestId("enter-draft").click();
  await page.getByTestId("pool-search").fill(TEST_CLUB);
  await page.getByTestId(`pick-${players[0]!.id}`).click();
  await expect(page.getByTestId("board-pick")).toHaveCount(1);

  await page.getByTestId("draft-reset-toggle").click();

  // A tap is not enough, and neither is the wrong word.
  await page.getByTestId("draft-reset-confirm").fill("reset please");
  await page.getByTestId("draft-reset").click();
  await expect(page.getByTestId("draft-reset-error")).toContainText("RESET");
  await expect(page.getByTestId("board-pick")).toHaveCount(1);

  // The form stays open behind the refusal — but React 19 empties an
  // uncontrolled input across a server-action transition (AGENTS.md), so the
  // word has to be typed again rather than corrected.
  await page.getByTestId("draft-reset-confirm").fill("RESET");
  await page.getByTestId("draft-reset").click();

  // Back in the lobby, with the order still on the board: somebody who started
  // too early should not have to re-roll.
  await expect(page.getByTestId("member-list")).toBeVisible();
  await expect(page.getByTestId("member-position")).toHaveCount(2);
  // And startable again, which is the point of going back rather than forward.
  await expect(page.getByTestId("start-draft")).toBeVisible();
  await expect(page.getByTestId("enter-draft")).toHaveCount(0);
});

test("a room whose draft was reset follows it back to the lobby", async ({
  page,
  context,
}) => {
  // What the rest of the league sees: the delete event arrives, the room asks
  // the server what it should be showing, and there is no draft — so the room
  // goes where the draft went instead of standing on a 404.
  const { commissioner, league } = await readyLeague("Follow League");
  await signIn(context, commissioner);

  await page.goto(`/leagues/${league.id}`);
  await page.getByTestId("draft-roll").click();
  await page.getByTestId("start-draft").click();
  await page.getByTestId("enter-draft").click();
  await expect(page.getByTestId("draft-room")).toBeVisible();

  const watching = await context.newPage();
  await watching.goto(`/leagues/${league.id}/draft`);
  await expect(watching.getByTestId("draft-room")).toBeVisible();

  await page.getByTestId("draft-reset-toggle").click();
  await page.getByTestId("draft-reset-confirm").fill("RESET");
  await page.getByTestId("draft-reset").click();
  await expect(page.getByTestId("member-list")).toBeVisible();

  // Nobody touched this tab.
  await expect(watching.getByTestId("member-list")).toBeVisible({
    timeout: 15_000,
  });
  await watching.close();
});

test("a league whose reset lost its second write repairs itself", async ({
  page,
  context,
}) => {
  // `resetDraft` deletes the draft first and moves the league second, so the
  // only state a crash between them can leave is a league claiming to draft
  // with no draft to open. Staged directly, because a crash cannot be.
  const { commissioner, league } = await readyLeague("Half Reset League");
  await signIn(context, commissioner);

  await page.goto(`/leagues/${league.id}`);
  await page.getByTestId("draft-roll").click();
  await page.getByTestId("start-draft").click();
  await expect(page.getByTestId("enter-draft")).toBeVisible();

  const pb = await superuser();
  const draft = await findUnfinishedDraft(pb, league.id);
  await pb.collection("drafts").delete(draft!.id, { requestKey: null });
  // The league is still `drafting` at this point — the lost write.

  await page.goto(`/leagues/${league.id}`);
  // Reading the lobby repaired it, so the lobby is a lobby again.
  await expect(page.getByTestId("draft-roll")).toBeVisible();
  await expect(page.getByTestId("enter-draft")).toHaveCount(0);
});
