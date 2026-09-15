import { expect, test } from "@playwright/test";

import {
  addMemberTo,
  cleanupTestData,
  createLeagueFor,
  createTestUser,
  signIn,
  superuser,
} from "./helpers/session";

/**
 * The roll ceremony.
 *
 * `src/lib/roll/ceremony.test.ts` owns the phase arithmetic — every boundary,
 * every league size, and the clock-skew clamp — because it is pure and a
 * browser adds nothing to it. What only a browser can answer is the part the
 * feature actually promises: that pressing one button takes *the whole league*
 * somewhere, that a phone arriving late joins the draw already in progress
 * rather than restarting it, and that the ceremony is a one-way door rather
 * than a trap.
 *
 * ## Why these tests never wait 46 seconds
 *
 * The phase is derived from a stored instant, so backdating `rolled_at` puts
 * the page at whatever second we want to assert. That is a property of the
 * design rather than a testing trick: it is the same mechanism that lets a
 * member open the page late and see the right thing.
 */

test.afterEach(async () => {
  await cleanupTestData();
});

/** A league in setup with four named teams, commissioner included. */
async function ceremonyLeague(name: string) {
  const commissioner = await createTestUser("chief");
  const league = await createLeagueFor(commissioner, name);
  const member = await createTestUser("member");
  await addMemberTo(league.id, member, "Vafliai");
  await addMemberTo(league.id, await createTestUser("three"), "Krosas");
  await addMemberTo(league.id, await createTestUser("four"), "Virtuozai");

  const pb = await superuser();
  const own = (
    await pb.collection("league_members").getFullList<{ id: string }>({
      filter: `league = '${league.id}' && user = '${commissioner.id}'`,
    })
  )[0]!;
  await pb
    .collection("league_members")
    .update(own.id, { team_name: "Sostine" });
  return { commissioner, member, league };
}

/** Move the draw back in time, so the page is already at the instant we want. */
async function backdateRoll(leagueId: string, msAgo: number) {
  const pb = await superuser();
  const league = await pb.collection("leagues").getOne(leagueId);
  const settings = league.settings as Record<string, unknown>;
  await pb.collection("leagues").update(leagueId, {
    settings: {
      ...settings,
      rolled_at: new Date(Date.now() - msAgo).toISOString(),
    },
  });
}

test("the roll takes the whole league to the draw, not just the commissioner", async ({
  page,
  context,
  browser,
}) => {
  const { commissioner, member, league } = await ceremonyLeague("Draw League");

  // A member is sitting in the lobby with nothing to do, which is exactly the
  // state everyone is in before a roll.
  const memberContext = await browser.newContext();
  await signIn(memberContext, member);
  const memberPage = await memberContext.newPage();
  await memberPage.goto(`/leagues/${league.id}`);
  await expect(memberPage.getByTestId("member-list")).toBeVisible();

  await signIn(context, commissioner);
  await page.goto(`/leagues/${league.id}`);
  await page.getByTestId("draft-roll").click();

  // The commissioner pressed it, so the commissioner goes too.
  await page.waitForURL(/\/order$/);
  await expect(page.getByTestId("roll-announcer")).toBeVisible();

  // And the member is taken there without touching anything. This is the one
  // place in the app that moves somebody to a page they did not ask for.
  await memberPage.waitForURL(/\/order$/, { timeout: 15_000 });
  await expect(memberPage.getByTestId("roll-announcer")).toBeVisible();

  // Both are counting, and neither has been shown a name yet.
  await expect(page.getByTestId("roll-drawn-tally")).toContainText("0 of 4");
  await expect(memberPage.getByTestId("roll-drawn-tally")).toContainText(
    "0 of 4",
  );
  await expect(memberPage.getByTestId("roll-name")).toHaveCount(0);

  await memberContext.close();
});

test("a phone that opens late joins the draw in progress", async ({
  page,
  context,
}) => {
  // The defect this guards is the obvious implementation: a countdown started
  // by a client timer when the page loads. Every device would run its own
  // private ceremony, and a member who opened the page twelve seconds late
  // would watch a draw the rest of the room had already finished.
  const { commissioner, league } = await ceremonyLeague("Late League");

  await signIn(context, commissioner);
  await page.goto(`/leagues/${league.id}`);
  await page.getByTestId("draft-roll").click();
  await page.waitForURL(/\/order$/);

  // Fourteen seconds in: the count is over and the draw is under way. The page
  // is *live* while we look at it — a slot lands every three seconds — so this
  // asserts the draw's invariants rather than one particular step, and reads
  // the DOM in a single pass so the assertions cannot straddle a step
  // boundary. Pinning "slot 04 exactly" would be a test that fails whenever a
  // page load crossed a three-second line: a flake rather than a finding.
  await backdateRoll(league.id, 14_000);
  await page.reload();
  await expect(page.getByTestId("roll-announcer")).toBeVisible();

  const snapshot = await page.evaluate(() => ({
    figure: document
      .querySelector('[data-testid="roll-figure"]')
      ?.textContent?.trim(),
    name: document
      .querySelector('[data-testid="roll-name"]')
      ?.textContent?.trim(),
    tally: document
      .querySelector('[data-testid="roll-drawn-tally"]')
      ?.textContent?.trim(),
    slots: [...document.querySelectorAll('[data-testid="roll-slot"]')].map(
      (node) => node.textContent?.trim() ?? "",
    ),
  }));

  // It joined the draw in progress: past the count, short of the finish.
  const landed = Number(snapshot.figure);
  expect(landed).toBeGreaterThanOrEqual(1);
  expect(landed).toBeLessThanOrEqual(4);
  expect(snapshot.name).toBeTruthy();

  // The tally, the announcer and the list all agree. Two surfaces disagreeing
  // about who was just drawn is the defect that actually matters here.
  expect(snapshot.tally).toContain(`${4 - landed + 1} of 4`);
  expect(snapshot.slots).toHaveLength(4);
  expect(snapshot.slots[landed - 1]).toContain(snapshot.name);

  // And the draw walks *down*: everything from the frontier down has a name,
  // everything above it is still blank.
  snapshot.slots.forEach((row, index) => {
    if (index + 1 >= landed) expect(row).not.toContain("Not drawn");
    else expect(row).toContain("Not drawn");
  });
});

test("a draw that finished reads as an order, not as a countdown", async ({
  page,
  context,
}) => {
  const { commissioner, league } = await ceremonyLeague("Finished League");

  await signIn(context, commissioner);
  await page.goto(`/leagues/${league.id}`);
  await page.getByTestId("draft-roll").click();
  await page.waitForURL(/\/order$/);

  await backdateRoll(league.id, 10 * 60 * 1000);
  await page.reload();

  // No clock, because there is nothing left to count.
  await expect(page.getByTestId("roll-figure")).toHaveCount(0);
  await expect(page.getByTestId("roll-announcer")).toContainText(/first pick/i);
  await expect(page.getByTestId("roll-drawn-tally")).toContainText("4 of 4");
  await expect(page.getByTestId("roll-slot")).toHaveCount(4);
  await expect(page.getByTestId("roll-announcer")).not.toContainText(
    /drawing in/i,
  );

  // Every slot has a name on it, and the order reads 01 down to 04.
  const rows = await page.getByTestId("roll-slot").allInnerTexts();
  expect(rows.map((row) => row.match(/\d\d/)?.[0])).toEqual([
    "01",
    "02",
    "03",
    "04",
  ]);
  for (const row of rows) expect(row).not.toContain("Not drawn");

  // And the way out is offered, so the ceremony is not a room with no door.
  await expect(page.getByTestId("roll-to-lobby")).toBeVisible();
  await expect(page.getByTestId("roll-skip")).toHaveCount(0);
});

test("the ceremony is a one-way door: going back does not drag you in again", async ({
  page,
  context,
}) => {
  // The trap this guards: "bring everyone in while the draw is live" plus a
  // door back to the lobby is an infinite loop, because the draw is still live
  // when they arrive. One automatic trip per device per roll.
  const { commissioner, league } = await ceremonyLeague("One Way League");

  await signIn(context, commissioner);
  await page.goto(`/leagues/${league.id}`);
  await page.getByTestId("draft-roll").click();
  await page.waitForURL(/\/order$/);

  // Still mid-draw, and back to the lobby by hand.
  await page.goto(`/leagues/${league.id}`);
  await expect(page.getByTestId("member-list")).toBeVisible();

  // It must stay put. Given a generous window to be pulled away in.
  await page.waitForTimeout(3_000);
  expect(new URL(page.url()).pathname).toBe(`/leagues/${league.id}`);
  await expect(page.getByTestId("member-list")).toBeVisible();
});

test("skipping goes straight to the finished order", async ({
  page,
  context,
}) => {
  const { commissioner, league } = await ceremonyLeague("Skip League");

  await signIn(context, commissioner);
  await page.goto(`/leagues/${league.id}`);
  await page.getByTestId("draft-roll").click();
  await page.waitForURL(/\/order$/);

  await expect(page.getByTestId("roll-drawn-tally")).toContainText("0 of 4");
  await page.getByTestId("roll-skip").click();

  await expect(page.getByTestId("roll-drawn-tally")).toContainText("4 of 4");
  await expect(page.getByTestId("roll-announcer")).toContainText(/first pick/i);
  await expect(page.getByTestId("roll-to-lobby")).toBeVisible();
});

test("a slot rises as it is drawn, and simply appears under reduced motion", async ({
  page,
  context,
  browser,
}) => {
  // DESIGN.md's Three Events Rule was raised to four for this animation
  // (ADR-0007), and the guard that makes a fourth acceptable is the same one
  // the other three carry: `prefers-reduced-motion` handled *inside* the
  // utility, never at the call site. Asserted on the computed style rather
  // than trusted from the media query.
  const { commissioner, league } = await ceremonyLeague("Motion League");

  await signIn(context, commissioner);
  await page.goto(`/leagues/${league.id}`);
  await page.getByTestId("draft-roll").click();
  await page.waitForURL(/\/order$/);
  await backdateRoll(league.id, 12_000);

  // The whole suite runs with `reducedMotion: "reduce"`, so this page is the
  // reduced case already: the slot is there, with no animation at all.
  await page.reload();
  const drawn = page.locator(".slot-drawn").first();
  await expect(drawn).toBeVisible();
  expect(
    await drawn.evaluate((node) => getComputedStyle(node).animationName),
  ).toBe("none");

  // And with motion allowed it rises, on this system's one curve.
  const movingContext = await browser.newContext({
    reducedMotion: "no-preference",
  });
  await signIn(movingContext, commissioner);
  const moving = await movingContext.newPage();
  await moving.goto(`/leagues/${league.id}/order`);
  const rising = moving.locator(".slot-drawn").first();
  await expect(rising).toBeVisible();
  const style = await rising.evaluate((node) => {
    const computed = getComputedStyle(node);
    return {
      name: computed.animationName,
      duration: computed.animationDuration,
      timing: computed.animationTimingFunction,
    };
  });
  expect(style.name).toBe("slot-drawn");
  // Slow on purpose: the brief asks for a slot to appear slowly, and 260ms —
  // `card-lands`, the animation this is not — is a flinch.
  expect(style.duration).toBe("0.9s");
  expect(style.timing).toBe("cubic-bezier(0.22, 1, 0.36, 1)");

  await movingContext.close();
});

test("starting the draft ends the draw, even inside its own window", async ({
  page,
  context,
}) => {
  // Found by the full suite rather than by reasoning, and it was a real defect
  // rather than a test artifact. `sessionStorage` is per *tab*, so a second tab
  // carries no record of having attended; when a start-over sent that tab back
  // to the lobby while a four-team ceremony was still inside its ~22 seconds,
  // the tab was yanked to the draw — for a draft that had just been thrown
  // away. `draft.spec.ts`'s "a room whose draft was reset follows it back to
  // the lobby" failed on both projects, consistently.
  //
  // The fix is a statement rather than a guard: starting the draft ends the
  // draw, whatever the clock says, because at that point the order is not a
  // plan any more — the same line `reshuffleDraftOrder` draws.
  const { commissioner, league } = await ceremonyLeague("Window League");

  await signIn(context, commissioner);
  await page.goto(`/leagues/${league.id}`);
  await page.getByTestId("draft-roll").click();
  await page.waitForURL(/\/order$/);

  // Straight back and on with it, well inside the ceremony's own window.
  await page.goto(`/leagues/${league.id}`);
  await page.getByTestId("start-draft").click();
  await expect(page.getByTestId("enter-draft")).toBeVisible();

  // A tab that never attended the draw. It must not be summoned to one.
  const fresh = await context.newPage();
  await fresh.goto(`/leagues/${league.id}`);
  await expect(fresh.getByTestId("member-list")).toBeVisible();
  await fresh.waitForTimeout(2_000);
  expect(new URL(fresh.url()).pathname).toBe(`/leagues/${league.id}`);

  // And the ceremony URL has nothing left to show. Waited for by its
  // destination rather than by reading the URL straight after `goto`: the page
  // redirects from a server component after the shell has already flushed, so
  // the browser performs it as a client-side navigation a beat later. Asserting
  // the URL immediately passed on desktop and failed on the emulated phone
  // every time, which is a slower hydration rather than a different outcome.
  await fresh.goto(`/leagues/${league.id}/order`);
  await expect(fresh.getByTestId("lobby")).toBeVisible();
  expect(new URL(fresh.url()).pathname).toBe(`/leagues/${league.id}`);
  await fresh.close();
});

test("a reshuffle changes the order without summoning the league again", async ({
  page,
  context,
}) => {
  // The decision recorded in ADR-0007: the ceremony belongs to the first draw.
  // A reshuffle updates the order in the lobby, where 2.3b's staged reveal
  // still plays, rather than pulling everyone back to watch a second one.
  const { commissioner, league } = await ceremonyLeague("Reshuffle League");

  await signIn(context, commissioner);
  await page.goto(`/leagues/${league.id}`);
  await page.getByTestId("draft-roll").click();
  await page.waitForURL(/\/order$/);

  await backdateRoll(league.id, 10 * 60 * 1000);
  await page.goto(`/leagues/${league.id}`);
  await expect(page.getByTestId("draft-order")).toBeVisible();

  await page.getByTestId("draft-reshuffle-toggle").click();
  await page.getByTestId("draft-reshuffle-confirm").check();
  await page.getByTestId("draft-reshuffle").click();

  // The lobby keeps them, and the order is still readable there.
  await expect(page.getByTestId("draft-order")).toBeVisible();
  await page.waitForTimeout(2_000);
  expect(new URL(page.url()).pathname).toBe(`/leagues/${league.id}`);
});

test("an order set by hand was never drawn, so there is nothing to watch", async ({
  page,
  context,
}) => {
  const { commissioner, league } = await ceremonyLeague("By Hand League");

  await signIn(context, commissioner);
  await page.goto(`/leagues/${league.id}`);
  await page.getByTestId("draft-roll").click();
  await page.waitForURL(/\/order$/);
  await backdateRoll(league.id, 10 * 60 * 1000);

  // Keeping the order by hand clears the seed and the instant with it.
  await page.goto(`/leagues/${league.id}`);
  await page.getByTestId("draft-manual").click();
  // Wait for the write, not for the button. Clearing the seed turns "Re-apply
  // the roll" back into "Roll the order", so the button's own label is the
  // signal that the state this test depends on has landed — rather than racing
  // the action and asking the ceremony URL too early.
  await expect(page.getByTestId("draft-roll")).toContainText(/roll the order/i);

  // The ceremony URL now has nothing to show and hands back to the lobby.
  await page.goto(`/leagues/${league.id}/order`);
  await expect(page.getByTestId("lobby")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(`/leagues/${league.id}`);
});
