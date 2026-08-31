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
