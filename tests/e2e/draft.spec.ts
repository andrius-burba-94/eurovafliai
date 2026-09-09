import { expect, test, type Page } from "@playwright/test";

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
  draftPlayer,
  submitPick,
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
/**
 * Roll, start, and land in the room — the three taps every 3.7 spec begins
 * with. `draft.spec.ts` had them inline in a dozen places; the new specs share
 * one so the setup is not the thing that breaks.
 */
async function enterDraft(page: Page, leagueId: string) {
  await page.goto(`/leagues/${leagueId}`);
  await page.getByTestId("draft-roll").click();
  await page.getByTestId("start-draft").click();
  await page.getByTestId("enter-draft").click();
  await expect(page.getByTestId("draft-room")).toBeVisible();
}

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
    // The *real* names, read the way the product reads them. Placeholders were
    // the first version and they made the announcement say "Fixture Player" —
    // which broke the one spec that checks a pick made on another device
    // arrives here by name, and would have hidden a real defect in exactly the
    // surface that replaced the ticker.
    say: {
      teamName:
        (
          await pb
            .collection("league_members")
            .getOne<{ team_name?: string }>(onClock.memberId, {
              requestKey: null,
            })
            .catch(() => null)
        )?.team_name || "A team",
      playerName:
        (
          await pb
            .collection("players")
            .getOne<{ name: string }>(playerId, { requestKey: null })
            .catch(() => null)
        )?.name ?? "A player",
    },
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
  await expect(
    page.getByTestId("on-the-clock").getByTestId("draft-needs"),
  ).toBeVisible();
  await expect(page.getByTestId("draft-needs")).toHaveCount(1);

  for (const testId of ["pick-pool", "roster-radar", "draft-board"]) {
    await expect(
      page.locator('section[data-framed="true"]').filter({
        has: page.getByTestId(testId),
      }),
    ).toHaveCount(1);
  }
  await expect(
    page.locator('[data-framed="true"] [data-framed="true"]'),
  ).toHaveCount(0);
});

test("the clock stays on screen, and keeps its blush", async ({
  page,
  context,
}) => {
  // The pool sits below the clock, so once you scrolled into the list the
  // countdown and the search box could not both be on a 390px screen — and
  // "under a minute to find a player and commit" is not an instruction you can
  // follow while unable to see the minute.
  //
  // The blush assertion is here because fixing that broke it once: `bg-stock`
  // added alongside `slot-live` painted straight over the live tint, since both
  // set `background-color` and the plain utility wins.
  const { commissioner, league } = await readyLeague("Sticky League");
  await signIn(context, commissioner);

  await page.goto(`/leagues/${league.id}`);
  await page.getByTestId("draft-roll").click();
  await page.getByTestId("start-draft").click();
  await page.getByTestId("enter-draft").click();

  const banner = page.getByTestId("on-the-clock");
  const paint = await banner.evaluate((node) => {
    const style = window.getComputedStyle(node);
    return {
      position: style.position,
      top: style.top,
      background: style.backgroundColor,
      borderTopWidth: style.borderTopWidth,
    };
  });
  expect(paint.position).toBe("sticky");
  expect(paint.top).toBe("0px");
  // The live tint and the 2px marker rule, both still there.
  expect(paint.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(paint.borderTopWidth).toBe("2px");

  // And it is still on screen after scrolling past the pool.
  await page.evaluate(() => window.scrollBy(0, 1200));
  await expect(banner).toBeInViewport();
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
  await draftPlayer(page, players[0]!.id);

  // The ticker used to be the sentence naming who took whom; league chat is
  // now, and it announces the player's *full* name where the board's cell
  // truncates it. Asserting here rather than on the board is the faithful
  // translation, and it exercises the surface that replaced the one this line
  // used to read.
  await expect(page.getByTestId("chat-latest")).toContainText(
    players[0]!.name,
  );
  await expect(page.locator('[data-board-slot][data-state="filled"]')).toHaveCount(1);
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

  await draftPlayer(page, players[0]!.id);
  await expect(page.locator('[data-board-slot][data-state="filled"]')).toHaveCount(1);

  // The stale tab submits anyway. The server refuses, and says why.
  await submitPick(stale, players[0]!.id);
  await expect(stale.getByTestId("confirm-pick-error")).toBeVisible();
  await expect(stale.locator('[data-board-slot][data-state="filled"]')).toHaveCount(1);

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
    await draftPlayer(page, player.id);
    await expect(page.locator('[data-board-slot][data-state="filled"]')).toHaveCount(index + 1);
  }

  // Pick 7 belongs to the member already holding C one, C two and C three.
  await page.getByTestId("pool-search").fill(TEST_CLUB);
  await submitPick(page, centers[3]!.id);
  // The engine's own words: "You have all the Cs you can hold."
  await expect(page.getByTestId("confirm-pick-error")).toContainText(/all the Cs/i);
  await expect(page.locator('[data-board-slot][data-state="filled"]')).toHaveCount(6);

  // A legal pick still goes through, so the refusal was about the bucket and
  // not about the draft having wedged itself.
  await page.getByTestId("pool-search").fill(TEST_CLUB);
  await draftPlayer(page, guards[3]!.id);
  await expect(page.locator('[data-board-slot][data-state="filled"]')).toHaveCount(7);
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
  await submitPick(page, players[0]!.id);
  await expect(page.getByTestId("confirm-pick-error")).toContainText(/paused/i);
  await expect(other.locator('[data-board-slot][data-state="filled"]')).toHaveCount(0);
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
    await draftPlayer(page, player.id);
    await expect(page.locator('[data-board-slot][data-state="filled"]')).toHaveCount(index + 1);
  }

  await page.getByTestId("draft-undo-toggle").click();
  await page.getByTestId("draft-undo-target").fill("2");
  await page.getByTestId("draft-undo").click();

  // Picks 2 and 3 are gone; pick 1 stands.
  await expect(page.locator('[data-board-slot][data-state="filled"]')).toHaveCount(1);
  // The collapsed header carries the *rollback*, which is the newest thing that
  // happened and the whole reason 3.5 exists — so the surviving pick is checked
  // in the transcript, which keeps everything.
  await expect(page.getByTestId("chat-latest")).toContainText(
    /rolled the draft back/i,
  );
  // The **board** is what forgets an undone pick. The transcript does not, and
  // must not: it records that pick 2 happened *and* that it was rolled back,
  // which is the difference between a record and a view. The ticker this line
  // used to read was derived from `picks`, so it forgot; chat is a transcript.
  const board = page.getByTestId("draft-board");
  const shown = (name: string) => name.split(",")[0]!;
  await expect(board).toContainText(shown(players[0]!.name));
  await expect(board).not.toContainText(shown(players[1]!.name));

  await page.getByTestId("chat-toggle").click();
  await expect(page.getByTestId("chat-list")).toContainText(players[0]!.name);
  await expect(page.getByTestId("chat-list")).toContainText(players[1]!.name);
  await expect(page.getByTestId("on-the-clock")).toContainText(/paused/i);

  // And the two undone players are pickable again.
  await page.getByTestId("draft-pause").click();
  await page.getByTestId("pool-search").fill(TEST_CLUB);
  await expect(page.getByTestId(`pick-${players[1]!.id}`)).toBeVisible();
  await draftPlayer(page, players[1]!.id);
  await expect(page.locator('[data-board-slot][data-state="filled"]')).toHaveCount(2);
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
  await draftPlayer(page, players[0]!.id);
  await expect(page.locator('[data-board-slot][data-state="filled"]')).toHaveCount(1);

  await page.getByTestId("draft-undo-toggle").click();
  // Nothing has been picked at 5 or later, so there is nothing to discard —
  // and the board must be left exactly as it was.
  await page.getByTestId("draft-undo-target").fill("5");
  await page.getByTestId("draft-undo").click();
  await expect(page.getByTestId("draft-undo-error")).toBeVisible();
  await expect(page.locator('[data-board-slot][data-state="filled"]')).toHaveCount(1);
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
  await draftPlayer(page, players[0]!.id);
  await expect(page.locator('[data-board-slot][data-state="filled"]')).toHaveCount(1);

  // A second tab, rendered before the undo and deaf to it.
  const other = await context.newPage();
  await withoutRealtime(other);
  await other.goto(`/leagues/${league.id}/draft`);
  await other.getByTestId("pool-search").fill(TEST_CLUB);
  await expect(other.getByTestId(`pick-${players[1]!.id}`)).toBeVisible();

  await page.getByTestId("draft-undo-toggle").click();
  await page.getByTestId("draft-undo-target").fill("1");
  await page.getByTestId("draft-undo").click();
  await expect(page.locator('[data-board-slot][data-state="filled"]')).toHaveCount(0);

  // The stale tab's pick has to be refused, not accepted into a paused draft.
  await submitPick(other, players[1]!.id);
  await expect(other.getByTestId("confirm-pick-error")).toContainText(/paused/i);
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
  await expect(page.locator('[data-board-slot][data-state="filled"]')).toHaveCount(0);

  // Somebody else's phone, in another room.
  await pickBehindTheirBack(league.id, players[0].id);

  // No `page.reload()` anywhere below, and that is the whole point.
  await expect(page.locator('[data-board-slot][data-state="filled"]')).toHaveCount(1, {
    timeout: 15_000,
  });
  // The board's cell truncates a long name, so the *sentence* is where the full
  // one lives — and it arrived over the same subscription with nobody
  // reloading, which is what this spec is really about.
  await expect(page.getByTestId("chat-latest")).toContainText(players[0].name);
  // The clock moved on to the next member, which is the part that was wrong.
  await expect(page.getByTestId("on-the-clock")).toContainText("Pick 2");
});

test("a pause reaches a room nobody is touching", async ({ page, context }) => {
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
  await draftPlayer(page, players[0]!.id);
  await expect(page.locator('[data-board-slot][data-state="filled"]')).toHaveCount(1);

  const pb = await superuser();
  const planted = await pb.collection("picks").getFirstListItem<{
    member: string;
    player: string;
  }>(`draft.league = '${league.id}'`, { requestKey: null });
  await pb.collection("roster_memberships").create(
    {
      league: league.id,
      member: planted.member,
      player: planted.player,
      from_date: "2026-09-08 12:00:00.000Z",
      to_date: "",
      acquired_via: "draft",
    },
    { requestKey: null },
  );

  await page.getByTestId("draft-reset-toggle").click();

  // A tap is not enough, and neither is the wrong word.
  await page.getByTestId("draft-reset-confirm").fill("reset please");
  await page.getByTestId("draft-reset").click();
  await expect(page.getByTestId("draft-reset-error")).toContainText("RESET");
  await expect(page.locator('[data-board-slot][data-state="filled"]')).toHaveCount(1);

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
  const left = await pb.collection("roster_memberships").getFullList({
    filter: `league = '${league.id}'`,
    requestKey: null,
  });
  expect(left).toHaveLength(0);
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

/* ── slice 3.7: pick confirmation, and the clock you can hear ────────────────
 *
 * `src/lib/cues/cues.test.ts` owns the cue's decision — that it fires on the
 * transition into your turn and never on a re-render, and that the toggle
 * governs the noise but never the announcement. What only a browser can answer
 * is that a tap now arms rather than picks, that the gesture the confirmation
 * exists to stop really cannot pick, and that coming on the clock says so.
 */

test("a tap arms a pick; it does not draft anybody", async ({
  page,
  context,
}) => {
  // Until 3.7 a tap on a pool row submitted immediately, so on the device draft
  // night happens on, one tap drafted a player irreversibly — undoable only by
  // a commissioner rollback, which deletes every pick after it too. Blueprint
  // 3.7 calls that "no fat-finger picks on mobile".
  const { commissioner, league, players } = await readyLeague("Arm League");
  await signIn(context, commissioner);
  await enterDraft(page, league.id);
  await page.getByTestId("pool-search").fill(TEST_CLUB);

  await page.getByTestId(`pick-${players[0]!.id}`).click();

  // Chosen, not drafted. The board is untouched.
  await expect(page.getByTestId("confirm-pick-go")).toBeVisible();
  // The **button** names the player, to a screen reader. Its visible label is
  // just `Draft`: with the name on it, it was 89 characters of uppercase in one
  // button — four wrapped lines at 390px, which also pushed `Cancel` onto a
  // line of its own. 3.7's critique measured that.
  await expect(page.getByTestId("confirm-pick-go")).toHaveAttribute(
    "aria-label",
    `Draft ${players[0]!.name}`,
  );
  // And `confirm-pick-who` appears **iff** it carries something the button does
  // not — a manager spending somebody else's turn. Asserted as the biconditional
  // rather than as a guess about who the seeded roll put first: the order comes
  // from a random seed, so "the commissioner picks first" is a coin flip, and
  // that assumption is what made the first version of this spec pass by luck.
  const yours = /you are on the clock/i.test(
    (await page.getByTestId("on-the-clock").textContent()) ?? "",
  );
  const who = page.getByTestId("confirm-pick-who");
  if (yours) {
    // The button already names the player; a second line would be the
    // duplication the critique measured at 41% of a phone.
    await expect(who).toHaveCount(0);
  } else {
    await expect(who).toContainText(/drafting for /i);
  }
  await expect(
    page.locator('[data-board-slot][data-state="filled"]'),
  ).toHaveCount(0);

  // And the confirming tap is in the band, where the clock is.
  const where = await page.evaluate(() => {
    const go = document.querySelector('[data-testid="confirm-pick-go"]')!;
    const band = document.querySelector('[data-testid="on-the-clock"]')!;
    return { inBand: band.contains(go) };
  });
  expect(where.inBand).toBe(true);

  await page.getByTestId("confirm-pick-go").click();
  await expect(
    page.locator('[data-board-slot][data-state="filled"]'),
  ).toHaveCount(1);
});

test("a double-tap on the row cannot draft anybody", async ({
  page,
  context,
}) => {
  // **The hazard the design exists to close.** With the confirm on the row's
  // own button, two taps inside 200ms armed and picked — so the guard would
  // have caught a stray single tap and missed the exact fat-finger gesture it
  // was built for. The confirm is in the band precisely so this cannot reach
  // it.
  const { commissioner, league, players } = await readyLeague("Thumb League");
  await signIn(context, commissioner);
  await enterDraft(page, league.id);
  await page.getByTestId("pool-search").fill(TEST_CLUB);

  const row = page.getByTestId(`pick-${players[0]!.id}`);
  await row.dblclick();
  // Still armed, still nothing drafted.
  await expect(page.getByTestId("confirm-pick-go")).toBeVisible();
  await expect(
    page.locator('[data-board-slot][data-state="filled"]'),
  ).toHaveCount(0);

  // Ten taps as fast as Playwright will send them, for good measure.
  for (let i = 0; i < 10; i += 1) await row.click({ delay: 0 });
  await expect(
    page.locator('[data-board-slot][data-state="filled"]'),
  ).toHaveCount(0);
});

test("cancel and Escape both put a chosen player back", async ({
  page,
  context,
}) => {
  const { commissioner, league, players } = await readyLeague("Cancel League");
  await signIn(context, commissioner);
  await enterDraft(page, league.id);
  await page.getByTestId("pool-search").fill(TEST_CLUB);

  // Cancel, by pointer — which the keyboard-only Escape never gave anybody.
  await page.getByTestId(`pick-${players[0]!.id}`).click();
  await page.getByTestId("confirm-pick-cancel").click();
  await expect(page.getByTestId("confirm-pick-go")).toHaveCount(0);

  // Escape, from the band. The handler sits above both the band and the pool,
  // which is the whole reason it is on the provider: before 3.3's critique the
  // pool's Escape lived on its search input and died the moment focus moved.
  await page.getByTestId(`pick-${players[0]!.id}`).click();
  await expect(page.getByTestId("confirm-pick-go")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("confirm-pick-go")).toHaveCount(0);
  // Focus goes back where choosing happens rather than to the document — the
  // defect 3.4b and 3.5 each shipped once.
  await expect(page.getByTestId("pool-search")).toBeFocused();

  await expect(
    page.locator('[data-board-slot][data-state="filled"]'),
  ).toHaveCount(0);
});

test("coming on the clock says so, and somebody else's turn does not", async ({
  page,
  context,
  browser,
}) => {
  // PRODUCT.md has promised since 2.6 that being on the clock is "announced to
  // assistive tech via a live region". This is that promise, and the *limit* on
  // it: the room re-renders on every pick in the league, and announcing each
  // would be the flood 3.3's critique measured in the pool.
  //
  // It asserts the **pairing** rather than who picks first. The order is rolled
  // from a random seed, so assuming the commissioner is first is a coin flip —
  // which is how the first version of this spec came to pass by luck and fail
  // once the band's copy changed underneath it. The invariant is stronger
  // anyway: of two rooms watching one draft, exactly the one whose banner says
  // "You are on the clock" has anything to say out loud.
  const { commissioner, other, league } = await readyLeague("Spoken Clock League");
  await signIn(context, commissioner);
  await enterDraft(page, league.id);

  const watcher = await browser.newContext();
  await signIn(watcher, other);
  const watching = await watcher.newPage();
  await watching.goto(`/leagues/${league.id}/draft`);
  await expect(watching.getByTestId("draft-room")).toBeVisible();

  const rooms = [page, watching];
  const banners = await Promise.all(
    rooms.map((room) => room.getByTestId("on-the-clock").textContent()),
  );
  const mine = banners.findIndex((text) => /you are on the clock/i.test(text ?? ""));
  expect(mine, "neither room claims the clock").toBeGreaterThanOrEqual(0);
  const theirs = mine === 0 ? 1 : 0;

  // The room whose turn it is says so, and names the pick and the round —
  // because "you are on the clock" alone makes somebody who is not looking
  // reach for the board to find out where the draft has got to.
  await expect(rooms[mine]!.getByTestId("clock-said")).toContainText(
    /your turn/i,
  );
  await expect(rooms[mine]!.getByTestId("clock-said")).toContainText(
    /pick 1, round 1/i,
  );
  // And the other says nothing at all. This is the flood assertion.
  await expect(rooms[theirs]!.getByTestId("clock-said")).toHaveText("");

  await watcher.close();
});

test("the sound cue is off until asked for, and remembered", async ({
  page,
  context,
}) => {
  // Off by default because a phone that makes a noise nobody chose, on a couch
  // full of friends with a television on, is worse than silence. Remembered per
  // device rather than per account: whether a phone should make a sound depends
  // on the phone and the room.
  const { commissioner, league } = await readyLeague("Cue League");
  await signIn(context, commissioner);
  await enterDraft(page, league.id);

  const toggle = page.getByTestId("cue-toggle");
  await expect(toggle).toHaveAttribute("data-enabled", "false");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(toggle).toHaveText(/sound off/i);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(toggle).toHaveText(/sound on/i);

  // Survives a reload, because it is the member's answer and not the page's.
  await page.reload();
  await expect(page.getByTestId("cue-toggle")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // 44px on both axes, which this repo has got wrong twice by writing
  // `min-h-11` and meaning both.
  const box = await page.getByTestId("cue-toggle").boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeGreaterThanOrEqual(44);
});

/* ── what 3.7's design critique found ────────────────────────────────────────
 *
 * The pass scored the surface 24/40 — the best in this project's corpus — and
 * two of its findings were P0. Each spec below is named after the defect it
 * catches, and each failed before the fix it guards.
 */

test("a refused pick keeps focus, and says so only once", async ({
  page,
  context,
}) => {
  // **Two P0s in one path.** Focus landed on `<body>` after a refusal — the
  // *sixth* occurrence of that defect in this project, on the one path where
  // somebody has just been told no, with a clock running. The focus effect was
  // keyed on `armed` alone and a refusal deliberately does not disarm, so it
  // never re-ran.
  //
  // And the refusal was announced *twice*: the band's `Correction` and the
  // row's strike were both polite live regions mounting in the same render, so
  // a screen reader heard "The draft is paused" from each.
  const { commissioner, league, players } = await readyLeague("Refused Focus League");
  await signIn(context, commissioner);
  await enterDraft(page, league.id);
  await page.getByTestId("pool-search").fill(TEST_CLUB);

  // Arm, then pause behind the room's back so the confirm is refused.
  await page.getByTestId(`pick-${players[0]!.id}`).click();
  await expect(page.getByTestId("confirm-pick-go")).toBeVisible();
  const pb = await superuser();
  const draft = (
    await pb.collection("drafts").getFullList({
      filter: `league = '${league.id}'`,
    })
  )[0]!;
  await pb.collection("drafts").update(draft.id, { status: "paused" });

  await page.getByTestId("confirm-pick-go").click();
  await expect(page.getByTestId("confirm-pick-error")).toContainText(/paused/i);

  // Focus is still somewhere deliberate, not on the document.
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.tagName ?? ""))
    .not.toBe("BODY");

  // Said once. The row still *shows* the refusal — 3.3's fix, which is a visual
  // claim — but only the band announces it.
  const live = await page.evaluate(() =>
    [...document.querySelectorAll("[aria-live], [role=alert], [role=status]")]
      .map((node) => node.textContent ?? "")
      .filter((text) => /paused/i.test(text)).length,
  );
  expect(live).toBe(1);
  await expect(page.getByTestId("pool-refused")).toBeVisible();
});

test("a paused draft offers no button the server would refuse", async ({
  page,
  context,
}) => {
  // The band was 380px of a 390px phone while paused — the same sentence three
  // times and a marker-red `Draft` at the centre of it — while every `Choose`
  // in the pool below had correctly withdrawn. `page.tsx` states the principle
  // in its own comment: offering a button the server is about to refuse is
  // worse than not offering one.
  const { commissioner, league, players } = await readyLeague("Paused Band League");
  await signIn(context, commissioner);
  await enterDraft(page, league.id);
  await page.getByTestId("pool-search").fill(TEST_CLUB);

  await page.getByTestId(`pick-${players[0]!.id}`).click();
  await expect(page.getByTestId("confirm-pick-go")).toBeVisible();

  await page.getByTestId("draft-pause").click();
  await expect(page.getByTestId("on-the-clock")).toContainText(/paused/i);

  // The act is gone; the pool agrees.
  await expect(page.getByTestId("confirm-pick-go")).toHaveCount(0);
  await expect(page.getByTestId(`pick-${players[0]!.id}`)).toHaveCount(0);
});

test("choosing from the pinned shortlist names whose turn it spends", async ({
  page,
  context,
}) => {
  // The two `Choose` buttons had diverged exactly as two copies of one thing
  // do: the pinned one hardcoded `forTeamName: null`, so a manager arming from
  // it on somebody else's turn read "Drafting P01…" with **no team named** — a
  // mis-pick that spends another member's turn, undoable only by a rollback
  // that deletes every pick after it. It also drew no armed material and kept
  // saying `Choose` while the same player's pool row said `Chosen`.
  //
  // One `ChooseButton` now serves both, so the divergence is unavailable.
  const chief = await createTestUser("chief");
  const league = await createLeagueFor(chief, "Pinned Names League");
  const mate = await createTestUser("mate");
  await addMemberTo(league.id, mate, "Mate FC");
  const wanted = await createPlayer("Pinnedone", { position: "G" });
  await createPlayer("Otherguy", { position: "F" });

  const pb = await superuser();
  const mine = (
    await pb.collection("league_members").getFullList<{ id: string }>({
      filter: `league = '${league.id}' && user = '${chief.id}'`,
    })
  )[0]!;
  await pb
    .collection("cheat_sheets")
    .create({ member: mine.id, ranking: [wanted.id], tiers: [], source: "csv" });

  await signIn(context, chief);
  await enterDraft(page, league.id);

  // Narrow the pool away from the sheet's player so the pinned block is drawn.
  await page.getByTestId("pool-search").fill("Otherguy");
  await expect(page.getByTestId(`pin-${wanted.id}`)).toBeVisible();
  await page.getByTestId(`pin-${wanted.id}`).click();

  // Armed, with the same material and the same label a pool row would give.
  await expect(page.getByTestId(`pin-${wanted.id}`)).toHaveText(/chosen/i);
  await expect(page.getByTestId(`pin-${wanted.id}`)).toHaveAttribute(
    "aria-label",
    /^Chosen /,
  );
  await expect(page.getByTestId("confirm-pick-go")).toHaveAttribute(
    "aria-label",
    `Draft ${wanted.name}`,
  );

  // And when it is not your turn, the band names whose turn is being spent.
  const banner = await page.getByTestId("on-the-clock").textContent();
  if (!/you are on the clock/i.test(banner ?? "")) {
    await expect(page.getByTestId("confirm-pick-who")).toContainText("Mate FC");
  }
});

test("the band stays a band: one act, and the name said once", async ({
  page,
  context,
}) => {
  // Measured before the fix at 390x844: the band went 118px -> 250px armed ->
  // 346px with a long name (41% of the phone) -> 380px showing a refusal (45%),
  // because the player's name was printed twice in 11px wide-tracked caps —
  // 92 characters in `confirm-pick-who` and 89 inside the button, both flagged
  // `all-caps-body` by the in-page detector.
  const chief = await createTestUser("chief");
  const league = await createLeagueFor(chief, "Band Size League");
  await addMemberTo(league.id, await createTestUser("mate"), "Mate FC");
  const long = await createPlayer("Konstantinoslongnameindeed", {
    position: "G",
  });
  await createPlayer("Shortone", { position: "F" });

  await signIn(context, chief);
  await page.setViewportSize({ width: 390, height: 844 });
  await enterDraft(page, league.id);
  await page.getByTestId("pool-search").fill(TEST_CLUB);
  await page.getByTestId(`pick-${long.id}`).click();
  await expect(page.getByTestId("confirm-pick-go")).toBeVisible();

  const band = await page.evaluate(() => {
    const node = document.querySelector('[data-testid="on-the-clock"]')!;
    const go = document.querySelector('[data-testid="confirm-pick-go"]')!;
    return {
      share: node.getBoundingClientRect().height / window.innerHeight,
      // The one act, named once. `Draft` alone rather than `Draft <83 chars>`.
      label: (go.textContent ?? "").trim(),
      // Marker edges anywhere inside the band: exactly one control may have
      // them, which is DESIGN.md's one-marker-act-per-surface rule.
      markerControls: [...node.querySelectorAll("*")].filter((el) => {
        const style = getComputedStyle(el);
        return (
          style.borderTopWidth === "2px" &&
          style.borderTopColor === getComputedStyle(go).borderTopColor
        );
      }).length,
    };
  });
  expect(band.label).toBe("Draft");
  // A third of a phone, not nearly half.
  expect(band.share).toBeLessThan(0.34);
  expect(band.markerControls).toBe(1);
});
