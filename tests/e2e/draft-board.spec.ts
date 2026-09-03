import { expect, test, type Page } from "@playwright/test";

import { whoIsOnClock } from "../../src/lib/engine";
import {
  commitPick,
  findUnfinishedDraft,
  readPicks,
  toState,
} from "../../src/lib/drafts/pipeline";

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
 * The draft board — slice 3.1.
 *
 * The engine's own tests prove the layout arithmetic for every format and
 * member count (`src/lib/engine/board.test.ts`). What only a browser can prove
 * is the wiring: that a pick appears in *its own member's column* rather than
 * in draft order, that the marker rule sits on the slot the server says is on
 * the clock, and that the second motion event fires for somebody who was
 * watching and not for somebody who just opened the page.
 *
 * Two members, thirteen rounds, so the board is 26 slots — and round 2 turns,
 * which is where a board laid out by pick sequence instead of by member would
 * be visibly wrong.
 */

test.afterEach(async () => {
  await cleanupTestData();
});

/** Positions chosen so nine picks are all legal under 5G/5F/3C, either way the roll falls. */
const POOL: ("G" | "F")[] = ["G", "G", "F", "F", "G", "G", "F", "F", "G"];

async function boardLeague(name: string) {
  const commissioner = await createTestUser("chief");
  const league = await createLeagueFor(commissioner, name);
  const other = await createTestUser("other");
  await addMemberTo(league.id, other, "Other FC");
  const players = [];
  for (const [index, position] of POOL.entries()) {
    players.push(await createPlayer(`P${index}`, { position }));
  }
  return { commissioner, league, other, players };
}

/** The surname a board writes in a slot, out of the "Surname, First" the pool stores. */
const surname = (name: string): string => name.split(",")[0]!.trim();

/** Roll the order, start the draft, walk into the room. */
async function enterDraft(page: Page, leagueId: string) {
  await page.goto(`/leagues/${leagueId}`);
  await page.getByTestId("draft-roll").click();
  await page.getByTestId("start-draft").click();
  await page.getByTestId("enter-draft").click();
  await expect(page.getByTestId("draft-board")).toBeVisible();
}

/**
 * A pick made through the real pipeline by nobody the browser can see — the
 * same helper `draft.spec.ts` uses, and for the same reason: this is about what
 * the *watching* page does.
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

/** Every slot on the board, in DOM order. */
async function slotOrder(page: Page): Promise<string[]> {
  return page
    .locator("[data-board-slot]")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-testid") ?? ""),
    );
}

test("the board draws every slot before a single pick is made", async ({
  page,
  context,
}) => {
  const { commissioner, league } = await boardLeague("Board League");
  await signIn(context, commissioner);
  await enterDraft(page, league.id);

  // Two members, thirteen rounds. The Board-Shows-Its-Shape rule: an empty
  // board is drawn at full size rather than as "no picks yet".
  await expect(page.locator("[data-board-slot]")).toHaveCount(26);

  await expect(page.getByTestId("board-slot-1")).toHaveAttribute(
    "data-state",
    "live",
  );
  await expect(page.getByTestId("board-slot-2")).toHaveAttribute(
    "data-state",
    "waiting",
  );
  await expect(page.getByTestId("board-slot-26")).toHaveAttribute(
    "data-state",
    "waiting",
  );

  // A page load is not news: the second motion event must not have fired.
  await expect(page.locator("[data-advanced]")).toHaveCount(0);

  // The round numbers are the row headers, so a screen reader can say which
  // round a slot is in. 13 of them, plus the header row.
  await expect(page.getByRole("row")).toHaveCount(14);
});

test("a pick lands in its own member's column, and round two turns", async ({
  page,
  context,
}) => {
  const { commissioner, league, players } = await boardLeague("Snake League");
  await signIn(context, commissioner);
  await enterDraft(page, league.id);

  // The layout decision, stated as DOM order: columns are members, so with two
  // members the second row reads 4 then 3. A board laid out by pick sequence
  // would read 3 then 4, and every column would be a zigzag of both rosters.
  const order = await slotOrder(page);
  expect(order.slice(0, 4)).toEqual([
    "board-slot-1",
    "board-slot-2",
    "board-slot-4",
    "board-slot-3",
  ]);
  expect(order.slice(4, 6)).toEqual(["board-slot-5", "board-slot-6"]);

  await page.getByTestId("pool-search").fill(TEST_CLUB);
  await page.getByTestId(`pick-${players[0]!.id}`).click();

  const first = page.getByTestId("board-slot-1");
  await expect(first).toHaveAttribute("data-state", "filled");
  await expect(first).toContainText(surname(players[0]!.name));
  // The marker moved on, and it is the server that says where to.
  await expect(page.getByTestId("board-slot-2")).toHaveAttribute(
    "data-state",
    "live",
  );
});

test("the live rule advances for a viewer who was watching, and not for one who just arrived", async ({
  page,
  context,
}) => {
  // The signal the second motion event is keyed on. Rendering it from server
  // state would replay the animation on every load, which is the objection
  // DESIGN.md raises against motion without a signal.
  const { commissioner, league, players } = await boardLeague("Motion League");
  await signIn(context, commissioner);
  await enterDraft(page, league.id);

  await expect(page.locator("[data-advanced]")).toHaveCount(0);

  await pickBehindTheirBack(league.id, players[0]!.id);

  // Arrives over SSE, so the room re-renders itself and the rule advances.
  const second = page.getByTestId("board-slot-2");
  await expect(second).toHaveAttribute("data-state", "live");
  await expect(second).toHaveAttribute("data-advanced", "true");

  // The same board, opened fresh: still on the clock, still not animated.
  await page.reload();
  await expect(page.getByTestId("board-slot-2")).toHaveAttribute(
    "data-state",
    "live",
  );
  await expect(page.locator("[data-advanced]")).toHaveCount(0);
});

test("the ticker keeps the last eight; the board keeps all of them", async ({
  page,
  context,
}) => {
  const { commissioner, league, players } = await boardLeague("Ticker League");
  await signIn(context, commissioner);
  await enterDraft(page, league.id);

  for (const player of players) {
    await pickBehindTheirBack(league.id, player.id);
  }

  await page.reload();

  // Nine picks made, eight in the run — the board below the fold is no longer
  // the history, because the board above it is.
  await expect(page.getByTestId("board-pick")).toHaveCount(8);
  await expect(page.getByTestId("pick-list")).not.toContainText(
    surname(players[0]!.name),
  );
  await expect(page.getByTestId("pick-list")).toContainText(
    surname(players[8]!.name),
  );

  // The board still has the first pick, in the first slot, where it happened.
  await expect(page.getByTestId("board-slot-1")).toContainText(
    surname(players[0]!.name),
  );
  await expect(page.getByTestId("board-slot-9")).toContainText(
    surname(players[8]!.name),
  );
});

/**
 * What the marker rule actually paints, which the attribute assertions above
 * cannot see.
 *
 * Worth pinning because every way this breaks is invisible: a renamed keyframe,
 * a Tailwind layer that starts winning the cascade, or a reduced-motion guard
 * that drops the rule instead of the travel. The last one is the one that
 * matters — DESIGN.md's promise is that the state change still lands and only
 * the movement goes, so somebody with motion turned off must still be able to
 * see who is on the clock.
 */
async function markerRule(page: Page, overallNo: number) {
  return page.getByTestId(`board-slot-${overallNo}`).evaluate((node) => {
    const after = window.getComputedStyle(node, "::after");
    return {
      animationName: after.animationName,
      background: after.backgroundColor,
      height: after.height,
    };
  });
}

test("the marker rule is painted, and reduced motion drops the travel and not the rule", async ({
  page,
  context,
}) => {
  // The suite forces `reducedMotion: "reduce"` for every project, so this is
  // the reduced case; the one below opts out of it.
  const { commissioner, league, players } = await boardLeague("Reduced League");
  await signIn(context, commissioner);
  await enterDraft(page, league.id);
  await pickBehindTheirBack(league.id, players[0]!.id);
  await expect(page.getByTestId("board-slot-2")).toHaveAttribute(
    "data-advanced",
    "true",
  );

  const rule = await markerRule(page, 2);
  expect(rule.animationName).toBe("none");
  // Still 2px of marker across the slot: the rule arrived, it just did not
  // travel. `animation: none` leaves the overlay at its resting scale.
  expect(rule.height).toBe("2px");
  expect(rule.background).not.toBe("rgba(0, 0, 0, 0)");
});

test.describe("with motion allowed", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("the rule advances by animation, not by appearing", async ({
    page,
    context,
  }) => {
    const { commissioner, league, players } = await boardLeague("Motion On");
    await signIn(context, commissioner);
    await enterDraft(page, league.id);
    await pickBehindTheirBack(league.id, players[0]!.id);
    await expect(page.getByTestId("board-slot-2")).toHaveAttribute(
      "data-advanced",
      "true",
    );

    const rule = await markerRule(page, 2);
    expect(rule.animationName).toBe("rule-advances");
    expect(rule.height).toBe("2px");
  });
});

test("a paused board keeps its marker on the slot the draft stands at", async ({
  page,
  context,
}) => {
  const { commissioner, league, players } = await boardLeague("Paused League");
  await signIn(context, commissioner);
  await enterDraft(page, league.id);
  await pickBehindTheirBack(league.id, players[0]!.id);
  await expect(page.getByTestId("board-slot-2")).toHaveAttribute(
    "data-state",
    "live",
  );

  await page.getByTestId("draft-pause").click();
  await expect(page.getByTestId("on-the-clock")).toContainText(/paused/i);

  // Nobody is on the clock, but the draft still stands at pick 2 — and the
  // banner above is struck in marker, so the board is too.
  await expect(page.getByTestId("board-slot-2")).toHaveAttribute(
    "data-state",
    "live",
  );
  await expect(page.getByTestId("board-slot-3")).toHaveAttribute(
    "data-state",
    "waiting",
  );

  // A pause is not an advance. Slot 2 still carries the mark from the pick that
  // genuinely moved the clock there a moment ago — the animation ran once and
  // the attribute is simply left where it landed — but exactly one slot has it,
  // which is the cleanup loop in `board-scroll.tsx` doing its job.
  await expect(page.locator("[data-advanced]")).toHaveCount(1);
  await expect(page.getByTestId("board-slot-2")).toHaveAttribute(
    "data-advanced",
    "true",
  );
});

test.describe("the rule travels the way the round is drafted", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("forward in round one, backward in round two", async ({
    page,
    context,
  }) => {
    // Two members, so round 2 is reversed and pick 3 sits in it. Half of all
    // advances in a snake draft travel right to left, and a rule that always
    // grew from the left would move against the round it was advancing through.
    const { commissioner, league, players } = await boardLeague("Origin");
    await signIn(context, commissioner);
    await enterDraft(page, league.id);

    await pickBehindTheirBack(league.id, players[0]!.id);
    await expect(page.getByTestId("board-slot-2")).toHaveAttribute(
      "data-advanced",
      "true",
    );
    // Round 1 is drafted left to right.
    await expect(page.getByTestId("board-slot-2")).not.toHaveAttribute(
      "data-reversed",
      "true",
    );
    const forward = await page.getByTestId("board-slot-2").evaluate((node) => ({
      origin: window.getComputedStyle(node, "::after").transformOrigin,
      width: node.clientWidth,
    }));
    expect(Number.parseFloat(forward.origin)).toBeCloseTo(0, 1);

    await pickBehindTheirBack(league.id, players[1]!.id);
    const third = page.getByTestId("board-slot-3");
    await expect(third).toHaveAttribute("data-advanced", "true");
    // Round 2, drafted right to left.
    await expect(third).toHaveAttribute("data-reversed", "true");
    const back = await third.evaluate((node) => ({
      origin: window.getComputedStyle(node, "::after").transformOrigin,
      width: node.clientWidth,
    }));
    expect(Number.parseFloat(back.origin)).toBeGreaterThan(back.width / 2);
  });
});
