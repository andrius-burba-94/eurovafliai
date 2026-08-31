import { expect, test } from "@playwright/test";

import {
  addMemberTo,
  cleanupTestData,
  createLeagueFor,
  createTestUser,
  signIn,
} from "./helpers/session";

/**
 * Slice 1.3b — the lobby, finished: real names, a live list, and the three
 * controls that make it a room rather than a read-out.
 *
 * Needs a running PocketBase (`npm run dev`).
 */

test.afterAll(async () => {
  await cleanupTestData();
});

test("a member sees their co-member's actual name", async ({ page, context }) => {
  // The guard for issue #15. `users` was on PocketBase's self-only read rules,
  // so `expand: "user"` returned nothing for anyone but the viewer and every
  // other row rendered as "Unknown member". The old specs missed it because
  // they only ever asserted on team names, which live on `league_members` and
  // need no expand — so this one asserts on the NAME, deliberately.
  const commissioner = await createTestUser("rimas");
  const { id } = await createLeagueFor(commissioner, "Named League");

  const joiner = await createTestUser("motiejus");
  await addMemberTo(id, joiner);
  await signIn(context, joiner);

  await page.goto(`/leagues/${id}`);

  const list = page.getByTestId("member-list");
  await expect(list).toContainText("rimas");
  await expect(list).not.toContainText("Unknown member");
});

test("the list updates live when somebody else joins", async ({
  page,
  context,
}) => {
  const commissioner = await createTestUser("watcher");
  const { id } = await createLeagueFor(commissioner, "Live League");
  await signIn(context, commissioner);

  await page.goto(`/leagues/${id}`);
  await expect(page.getByTestId("member")).toHaveCount(1);

  // Written straight to PocketBase, so nothing this browser did causes it. If
  // the row appears, it appeared over the subscription.
  const latecomer = await createTestUser("latecomer");
  await addMemberTo(id, latecomer);

  await expect(page.getByTestId("member")).toHaveCount(2);
  await expect(page.getByTestId("member-list")).toContainText("latecomer");
});

test("a member names their own team, and it lands on the board", async ({
  page,
  context,
}) => {
  const commissioner = await createTestUser("namer");
  const { id } = await createLeagueFor(commissioner, "Naming League");
  await signIn(context, commissioner);

  await page.goto(`/leagues/${id}`);

  await page.getByTestId("team-name-input").fill("  Vilnius   Vafliai ");
  await page.getByTestId("save-team-name").click();

  // Normalized on the way in: collapsed whitespace, trimmed. Asserted in the
  // casing it is *stored* in — `CardName` uppercases in CSS, which the DOM text
  // does not reflect.
  await expect(page.getByTestId("member-list")).toContainText("Vilnius Vafliai");
  // The display name stays visible beside the team name, so the row still says
  // who it is.
  await expect(page.getByTestId("member-name")).toContainText("namer");
});

test("an over-long team name is refused, and the typed value survives", async ({
  page,
  context,
}) => {
  const commissioner = await createTestUser("longname");
  const { id } = await createLeagueFor(commissioner, "Long Name League");
  await signIn(context, commissioner);

  await page.goto(`/leagues/${id}`);

  const input = page.getByTestId("team-name-input");
  // `maxLength` stops a human typing past the limit, so drive the value in
  // directly — the point is that the server refuses it either way.
  const tooLong = "x".repeat(41);
  await input.evaluate((element, value) => {
    const field = element as HTMLInputElement;
    field.value = value;
  }, tooLong);
  await page.getByTestId("save-team-name").click();

  await expect(page.getByTestId("team-name-error")).toBeVisible();
  // React 19 clears uncontrolled inputs across a server-action transition, so
  // this asserts the echo-back is actually wired.
  await expect(input).toHaveValue(tooLong);
});

test("a member marks themselves ready, and can take it back", async ({
  page,
  context,
}) => {
  const commissioner = await createTestUser("keen");
  const { id } = await createLeagueFor(commissioner, "Ready League");
  await signIn(context, commissioner);

  await page.goto(`/leagues/${id}`);
  await expect(page.getByTestId("member-tally")).toContainText("0 of 1 ready");

  await page.getByTestId("toggle-ready").click();
  await expect(page.getByTestId("member-tally")).toContainText("1 of 1 ready");
  await expect(page.getByTestId("member-labels").first()).toContainText("ready");

  await page.getByTestId("toggle-ready").click();
  await expect(page.getByTestId("member-tally")).toContainText("0 of 1 ready");
});

test("the commissioner removes a member, and the slot frees up", async ({
  page,
  context,
}) => {
  const commissioner = await createTestUser("boss");
  const { id } = await createLeagueFor(commissioner, "Kick League");
  const doomed = await createTestUser("doomed");
  await addMemberTo(id, doomed);
  await signIn(context, commissioner);

  await page.goto(`/leagues/${id}`);
  await expect(page.getByTestId("member")).toHaveCount(2);

  // The commissioner's powers are folded away behind a per-row summary.
  await page.getByTestId("manage-member").first().click();
  await page.getByTestId("kick-member").first().click();

  await expect(page.getByTestId("member")).toHaveCount(1);
  await expect(page.getByTestId("member-list")).not.toContainText("doomed");
});

test("an ordinary member gets no manage controls at all", async ({
  page,
  context,
}) => {
  const commissioner = await createTestUser("owner3");
  const { id } = await createLeagueFor(commissioner, "No Powers League");
  const plain = await createTestUser("plain");
  await addMemberTo(id, plain);
  await signIn(context, plain);

  await page.goto(`/leagues/${id}`);
  await expect(page.getByTestId("member")).toHaveCount(2);

  await expect(page.getByTestId("manage-member")).toHaveCount(0);
  await expect(page.getByTestId("kick-member")).toHaveCount(0);
  // They can still name their own team.
  await expect(page.getByTestId("team-name-input")).toBeVisible();
});

test("the commissioner cannot remove themselves", async ({ page, context }) => {
  const commissioner = await createTestUser("selfkick");
  const { id } = await createLeagueFor(commissioner, "Self Kick League");
  await signIn(context, commissioner);

  await page.goto(`/leagues/${id}`);

  // Their own row carries no Manage summary — `ensureCommissionerMembership`
  // would put them straight back, so offering it would be a lie.
  await expect(page.getByTestId("member")).toHaveCount(1);
  await expect(page.getByTestId("manage-member")).toHaveCount(0);
});
