import { expect, test } from "@playwright/test";

import {
  cleanupTestData,
  addMemberTo,
  createLeagueFor,
  createTestUser,
  signIn,
} from "./helpers/session";

/**
 * Slice 2.3a — draft settings and order determination.
 *
 * The property worth protecting in a browser is the one a human would check on
 * draft night: the commissioner rolls, everybody gets exactly one slot, and
 * re-applying the roll does not reshuffle who drafts first.
 */

test.afterEach(async () => {
  await cleanupTestData();
});

test("a member cannot see the draft setup", async ({ page, context }) => {
  const commissioner = await createTestUser("boss");
  const league = await createLeagueFor(commissioner, "Setup League");
  const member = await createTestUser("member");
  await addMemberTo(league.id, member);

  await signIn(context, member);
  await page.goto(`/leagues/${league.id}`);

  await expect(page.getByTestId("member-list")).toBeVisible();
  await expect(page.getByTestId("draft-roll")).toBeHidden();
  await expect(page.getByTestId("draft-format")).toBeHidden();
});

test("the commissioner rolls, and the order is stable when re-applied", async ({
  page,
  context,
}) => {
  const commissioner = await createTestUser("roller");
  const league = await createLeagueFor(commissioner, "Roll League");
  for (const label of ["a", "b", "c"]) {
    await addMemberTo(league.id, await createTestUser(label));
  }

  await signIn(context, commissioner);
  await page.goto(`/leagues/${league.id}`);

  await expect(page.getByTestId("member-position")).toHaveCount(0);

  await page.getByTestId("draft-roll").click();

  // Four members, four slots, each exactly once.
  const positions = page.getByTestId("member-position");
  await expect(positions).toHaveCount(4);
  const first = await positions.allInnerTexts();
  expect([...first].sort()).toEqual(["01", "02", "03", "04"]);

  // Re-applying uses the stored seed, so the same people keep the same slots.
  // A fresh roll here would change who drafts first after everybody saw it.
  await page.getByTestId("draft-roll").click();
  await expect(page.getByTestId("member-position")).toHaveCount(4);
  const order = page.getByTestId("draft-order");
  await expect(order).toBeVisible();
  expect(await positions.allInnerTexts()).toEqual(first);
});

test("the browser refuses an impossible clock before the server sees it", async ({
  page,
  context,
}) => {
  const commissioner = await createTestUser("clocker");
  const league = await createLeagueFor(commissioner, "Clock League");
  await signIn(context, commissioner);
  await page.goto(`/leagues/${league.id}`);

  const seconds = page.getByTestId("draft-pick-seconds");
  await seconds.fill("3");
  await page.getByTestId("draft-settings-save").click();

  // `min` on the input means this never leaves the browser, so there is no
  // server message to wait for — asserting one would be asserting a path the
  // form cannot take. The server checks the same bounds anyway, for a crafted
  // post that skips the form entirely; that is defence in depth, not a
  // behaviour this page can exercise.
  await expect(seconds).toHaveJSProperty("validity.rangeUnderflow", true);
  await expect(page.getByTestId("draft-settings-error")).toBeHidden();
});

test("the server refuses reverse standings, and says why", async ({
  page,
  context,
}) => {
  // A server-side refusal with no HTML constraint in front of it, so this
  // genuinely exercises the action's own validation.
  const commissioner = await createTestUser("reverser");
  const league = await createLeagueFor(commissioner, "Reverse League");
  await addMemberTo(league.id, await createTestUser("second"));
  await signIn(context, commissioner);
  await page.goto(`/leagues/${league.id}`);

  await page.getByTestId("draft-order-mode").selectOption("reverse_standings");
  await page.getByTestId("draft-settings-save").click();
  await expect(page.getByTestId("draft-order-mode")).toHaveValue(
    "reverse_standings",
  );

  await page.getByTestId("draft-roll").click();
  await expect(page.getByTestId("draft-order-error")).toContainText(/Phase 4/i);
  // And nothing was positioned, so a refused mode cannot half-roll a draft.
  await expect(page.getByTestId("member-position")).toHaveCount(0);
});

test("rolling needs somebody to roll for", async ({ page, context }) => {
  const commissioner = await createTestUser("lonely");
  const league = await createLeagueFor(commissioner, "Lonely League");
  await signIn(context, commissioner);
  await page.goto(`/leagues/${league.id}`);

  await page.getByTestId("draft-roll").click();
  await expect(page.getByTestId("draft-order-error")).toContainText(
    /one more member/i,
  );
});

test("reshuffling needs a deliberate tick, then draws a different order", async ({
  page,
  context,
}) => {
  const commissioner = await createTestUser("shuffler");
  const league = await createLeagueFor(commissioner, "Shuffle League");
  for (const label of ["a", "b", "c", "d", "e"]) {
    await addMemberTo(league.id, await createTestUser(label));
  }

  await signIn(context, commissioner);
  await page.goto(`/leagues/${league.id}`);
  await page.getByTestId("draft-roll").click();
  await expect(page.getByTestId("member-position")).toHaveCount(6);

  const before = await page
    .getByTestId("draft-order")
    .locator("li")
    .allInnerTexts();

  // Reshuffling is folded away behind a disclosure, so it takes a deliberate
  // open before there is even a button to press.
  await page.getByText("Reshuffle…").click();

  // Unticked: refused, and the order is untouched. A reshuffle changes who
  // picks first, so it must not happen because somebody brushed a button.
  await page.getByTestId("draft-reshuffle").click();
  await expect(page.getByTestId("draft-reshuffle-error")).toContainText(
    /tick the box/i,
  );
  expect(
    await page.getByTestId("draft-order").locator("li").allInnerTexts(),
  ).toEqual(before);

  await page.getByTestId("draft-reshuffle-confirm").check();
  await page.getByTestId("draft-reshuffle").click();

  // Still exactly one slot each, and with six members a different draw is all
  // but certain (1 in 720 of matching).
  const positions = page.getByTestId("member-position");
  await expect(positions).toHaveCount(6);
  expect([...(await positions.allInnerTexts())].sort()).toEqual([
    "01",
    "02",
    "03",
    "04",
    "05",
    "06",
  ]);
  // Poll rather than read once: the new order arrives over the realtime
  // subscription, so a bare read races it. (With six members an identical
  // re-draw is 1 in 720 — the one flake this spec accepts.)
  await expect
    .poll(async () =>
      (
        await page.getByTestId("draft-order").locator("li").allInnerTexts()
      ).join("|"),
    )
    .not.toBe(before.join("|"));
});

test.describe("the reveal", () => {
  // The suite forces `prefers-reduced-motion: reduce` in playwright.config.ts,
  // which is why every other spec here never sees the staged reveal — and is
  // itself the coverage for the reduced-motion path. This block opts back in.
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("plays when the order lands, and not on a reload", async ({
    page,
    context,
  }) => {
    const commissioner = await createTestUser("revealer");
    const league = await createLeagueFor(commissioner, "Reveal League");
    for (const label of ["a", "b"]) {
      await addMemberTo(league.id, await createTestUser(label));
    }

    await signIn(context, commissioner);
    await page.goto(`/leagues/${league.id}`);
    await page.getByTestId("draft-roll").click();

    // The order arrives one slot at a time, so the whole set is not there at once.
    await expect(page.getByTestId("reveal-running")).toBeVisible();
    await expect(page.getByTestId("reveal-running")).toBeHidden({
      timeout: 10_000,
    });
    await expect(page.getByTestId("member-position")).toHaveCount(3);

    // A refresh shows the finished order immediately: the reveal is for the
    // moment it lands, not a thing to sit through on every page load.
    await page.reload();
    await expect(page.getByTestId("member-position")).toHaveCount(3);
    await expect(page.getByTestId("reveal-running")).toBeHidden();
  });
});

test("with reduced motion the order simply appears", async ({
  page,
  context,
}) => {
  // Inherits the suite's forced `reduce`. The staging IS the effect, so there
  // is no slower version of it — the whole order lands at once.
  const commissioner = await createTestUser("calm");
  const league = await createLeagueFor(commissioner, "Calm League");
  await addMemberTo(league.id, await createTestUser("other"));

  await signIn(context, commissioner);
  await page.goto(`/leagues/${league.id}`);
  await page.getByTestId("draft-roll").click();

  await expect(page.getByTestId("member-position")).toHaveCount(2);
  await expect(page.getByTestId("reveal-running")).toBeHidden();
});
