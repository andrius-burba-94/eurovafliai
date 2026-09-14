import { expect, test, type Page } from "@playwright/test";

import { findUnfinishedDraft } from "../../src/lib/drafts/pipeline";

import {
  addMemberTo,
  cleanupTestData,
  createLeagueFor,
  createPlayer,
  createTestUser,
  draftPlayer,
  signIn,
  superuser,
  TEST_CLUB,
} from "./helpers/session";

/**
 * The commissioner's panel — slice 9.2.
 *
 * Three of its four controls are new, and each is here for a different reason.
 * The **per-member autodraft** switch has worked server-side since 2.5 and had
 * no surface at all, so the thing worth asserting is that the toggle reaches
 * the right member's record. The **clock** carries the one correctness
 * question blueprint D13 named — what happens to a deadline already running —
 * and the answer is asserted against the record the worker enforces, not
 * against the countdown a browser draws. **"Pick for them"** is a walk rather
 * than an act, so what it has to prove is where it leaves the focus.
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

async function enterDraft(page: Page, leagueId: string) {
  await page.goto(`/leagues/${leagueId}`);
  await page.getByTestId("draft-roll").click();
  await page.getByTestId("start-draft").click();
  await page.getByTestId("enter-draft").click();
  // 20s, for the reason `draftPlayer` states: on a dev server under parallel
  // workers, first render of this route is slower than the default fuse, and
  // that reads as a broken room rather than a slow one.
  await expect(page.getByTestId("draft-room")).toBeVisible({
    timeout: 20_000,
  });
}

/** The draft as the worker reads it. */
async function draftRecord(leagueId: string) {
  const pb = await superuser();
  const draft = await findUnfinishedDraft(pb, leagueId);
  if (!draft) throw new Error("no live draft");
  return draft;
}

test("the panel is a named, framed region and lists every member", async ({
  page,
  context,
}) => {
  const { commissioner, league } = await readyLeague("Panel League");
  await signIn(context, commissioner);
  await enterDraft(page, league.id);

  // It was an anonymous `<div>` until 9.2: a screen reader landed in the
  // room's only cluster of commissioner controls and was told nothing.
  const panel = page.getByRole("region", {
    name: "Running the draft",
    exact: true,
  });
  await expect(panel).toHaveAttribute("data-framed", "true");
  await expect(panel).toHaveAttribute("data-testid", "draft-controls");
  await expect(panel).toContainText("60s a pick");
  await expect(panel.getByTestId("autodraft-member")).toHaveCount(2);

  // Draft order, the same order the board reads across and the radar down.
  const draft = await draftRecord(league.id);
  const pb = await superuser();
  const names = await Promise.all(
    draft.order.map(async (memberId) => {
      const member = await pb
        .collection("league_members")
        .getOne<{
          team_name?: string;
          expand?: { user?: { name?: string } };
        }>(memberId, { expand: "user", requestKey: null });
      return member.team_name || member.expand?.user?.name || "";
    }),
  );
  const rows = panel.getByTestId("autodraft-member");
  for (const [index, name] of names.entries()) {
    await expect(rows.nth(index)).toContainText(name);
  }
});

test("a manager arms somebody else's autodraft from the panel", async ({
  page,
  context,
}) => {
  const { commissioner, league, other } = await readyLeague("Dead Phone League");
  await signIn(context, commissioner);
  await enterDraft(page, league.id);

  const pb = await superuser();
  const theirs = (
    await pb.collection("league_members").getFullList<{
      id: string;
      user: string;
      autodraft_enabled?: boolean;
    }>({ filter: `league = '${league.id}'`, requestKey: null })
  ).find((member) => member.user === other.id)!;
  expect(Boolean(theirs.autodraft_enabled)).toBe(false);

  const row = page
    .getByTestId("autodraft-member")
    .filter({ hasText: "Other FC" });
  await expect(row).toContainText(/pick for themselves|on the clock now/i);
  await row.getByTestId(`autodraft-for-${theirs.id}`).click();

  // The row says so, and — the part that matters — the sweep's own field moved
  // on the member the manager meant, not on the manager.
  //
  // Generous, for the reason `draftPlayer` is: every one of these waits on an
  // action that revalidates both the lobby and the room, and the default 5s is
  // enough in isolation and not enough under parallel workers on a dev server.
  await expect(row).toContainText(/engine picks for them/i, {
    timeout: 20_000,
  });
  const armed = await pb
    .collection("league_members")
    .getOne<{ autodraft_enabled?: boolean }>(theirs.id, { requestKey: null });
  expect(Boolean(armed.autodraft_enabled)).toBe(true);

  await row.getByTestId(`autodraft-for-${theirs.id}`).click();
  await expect(row).toContainText(/pick for themselves|on the clock now/i, {
    timeout: 20_000,
  });
  const handedBack = await pb
    .collection("league_members")
    .getOne<{ autodraft_enabled?: boolean }>(theirs.id, { requestKey: null });
  expect(Boolean(handedBack.autodraft_enabled)).toBe(false);
});

test("the clock can be changed mid-draft, and restarts from now", async ({
  page,
  context,
}) => {
  const { commissioner, league } = await readyLeague("Slow Room League");
  await signIn(context, commissioner);
  await enterDraft(page, league.id);

  const pb = await superuser();
  const before = await draftRecord(league.id);
  expect(before.pick_seconds).toBe(60);

  // **The decisive setup.** A deadline already in the past is what a long pick
  // looks like to this action, and it is the case that separates the two
  // possible implementations: computed from the pick's original start, a cut to
  // 30 seconds would land the new deadline further in the past and hand the
  // member on the clock straight to the sweep. Computed from now — which is
  // what `setPickClock` does — it is always a fresh clock.
  await pb
    .collection("drafts")
    .update(
      before.id,
      { deadline: new Date(Date.now() - 10_000).toISOString() },
      { requestKey: null },
    );

  await page.getByTestId("draft-clock-seconds").fill("30");
  await page.getByTestId("draft-clock").click();
  await expect(page.getByTestId("draft-controls")).toContainText("30s a pick", {
    timeout: 20_000,
  });

  const after = await draftRecord(league.id);
  expect(after.pick_seconds).toBe(30);
  const left = new Date(after.deadline).getTime() - Date.now();
  expect(left).toBeGreaterThan(20_000);
  expect(left).toBeLessThanOrEqual(30_000);

  // A rule of the room changed, so the room is told.
  await page.getByTestId("chat-toggle").click();
  await expect(page.getByTestId("chat-list")).toContainText(
    "The pick clock is now 30 seconds.",
  );

  // And the league's own default followed it, so a start-over does not quietly
  // go back to a minute.
  const league_ = await pb
    .collection("leagues")
    .getOne<{ settings: { pick_seconds?: number } }>(league.id, {
      requestKey: null,
    });
  expect(league_.settings.pick_seconds).toBe(30);

  // Out of bounds never leaves the browser, the same answer the lobby's setup
  // form gives — so there is no server message to wait for, and nothing moves.
  // The action checks the same bounds for a post that skips the form.
  const seconds = page.getByTestId("draft-clock-seconds");
  await seconds.fill("5");
  await page.getByTestId("draft-clock").click();
  await expect(seconds).toHaveJSProperty("validity.rangeUnderflow", true);
  expect((await draftRecord(league.id)).pick_seconds).toBe(30);
});

test("pick for them walks the manager to the pool, focused", async ({
  page,
  context,
}) => {
  const { commissioner, league, players } = await readyLeague("Relay League");
  await signIn(context, commissioner);
  await enterDraft(page, league.id);

  // Get to a turn that is not the manager's own — the roll decides who starts,
  // so spend the first pick if it landed on them.
  const banner = await page.getByTestId("on-the-clock").textContent();
  if (/you are on the clock/i.test(banner ?? "")) {
    await page.getByTestId("pool-search").fill(TEST_CLUB);
    await draftPlayer(page, players[0]!.id);
  }
  await expect(page.getByTestId("on-the-clock")).toContainText(
    /is on the clock/i,
  );

  // It names whose turn it is spending, which is the whole point: the pool's
  // heading changes 600px further down the page and nothing said so up here.
  const jump = page.getByTestId("pick-for-them");
  await expect(jump).toContainText(/pick for/i);
  await jump.click();
  await expect(page.getByTestId("pool-search")).toBeFocused();
});

test("an ordinary member gets no panel at all", async ({ page, context }) => {
  const { commissioner, league, other } = await readyLeague("Quiet Panel");
  await signIn(context, commissioner);
  await enterDraft(page, league.id);

  const member = await context.browser()!.newContext();
  await signIn(member, other);
  const theirs = await member.newPage();
  await theirs.goto(`/leagues/${league.id}/draft`);
  await expect(theirs.getByTestId("draft-room")).toBeVisible();
  await expect(theirs.getByTestId("draft-controls")).toHaveCount(0);
  await expect(theirs.getByTestId("autodraft-member")).toHaveCount(0);
  await expect(theirs.getByTestId("draft-clock")).toHaveCount(0);
  await expect(theirs.getByTestId("pick-for-them")).toHaveCount(0);
  // Their own switch is theirs, and stays.
  await expect(theirs.getByTestId("autodraft-toggle")).toBeVisible();
  await member.close();
});
