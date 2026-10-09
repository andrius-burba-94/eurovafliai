import { expect, test } from "@playwright/test";

import {
  addMemberTo,
  cleanupTestData,
  createLeagueFor,
  createTestUser,
  grantManage,
  signIn,
  superuser,
} from "./helpers/session";
import { expectNotFound } from "./helpers/not-found";

/**
 * League settings (7.1): the commissioner's page for a league in season —
 * write-ups on/off and voice, who helps run it, and the way out.
 *
 * Needs a running PocketBase (`npm run dev`).
 */

test.afterAll(async () => {
  await cleanupTestData();
});

async function seasonLeague(name: string) {
  const commissioner = await createTestUser("settings-owner");
  const member = await createTestUser("settings-member");
  const { id } = await createLeagueFor(commissioner, name);
  await addMemberTo(id, member, "Second Five");
  const pb = await superuser();
  await pb.collection("leagues").update(id, { status: "season" }, { requestKey: null });
  return { id, commissioner, member };
}

test("League settings is a gear on the League header, for managers only", async ({ page, context, browser }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "the sidebar is lg and up");
  const { id, commissioner, member } = await seasonLeague("Geared League");
  await signIn(context, commissioner);
  await page.goto(`/l/${id}`);
  const gear = page.getByTestId("sidebar").getByRole("link", { name: "League settings" });
  const box = await gear.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await gear.click();
  await expect(page).toHaveURL(new RegExp(`/l/[^/]+/settings$`));
  await expect(page.getByTestId("sidebar").getByRole("link", { name: "League settings" })).toHaveAttribute("aria-current", "page");

  const plain = await browser.newContext();
  await signIn(plain, member);
  const plainPage = await plain.newPage();
  await plainPage.goto(`/l/${id}`);
  await expect(plainPage.getByTestId("sidebar").getByTestId("nav-group-league")).toBeVisible();
  await expect(plainPage.getByRole("link", { name: "League settings" })).toHaveCount(0);
  await plain.close();
});

test("the commissioner turns write-ups off and changes their voice", async ({ page, context }) => {
  const { id, commissioner } = await seasonLeague("Written League");
  await signIn(context, commissioner);

  await page.goto(`/l/${id}/settings`);
  await expect(page.getByTestId("writeup-enabled")).toHaveValue("on");
  await expect(page.getByTestId("writeup-voice")).toHaveValue("analyst");

  await page.getByTestId("writeup-enabled").selectOption("off");
  await page.getByTestId("writeup-voice").selectOption("pundit");
  await page.getByTestId("writeup-settings-save").click();
  // The form reads back what was saved, and so does the database.
  await expect(page.getByTestId("writeup-enabled")).toHaveValue("off");
  await expect(page.getByTestId("writeup-voice")).toHaveValue("pundit");

  const pb = await superuser();
  await expect
    .poll(async () => (await pb.collection("leagues").getOne(id, { requestKey: null })).settings.ai)
    .toEqual({ enabled: false, voice: "pundit" });
  // The draft's own settings survive the write.
  expect((await pb.collection("leagues").getOne(id, { requestKey: null })).settings.max_members).toBe(12);

  await page.reload();
  await expect(page.getByTestId("writeup-enabled")).toHaveValue("off");
});

test("in season a member can be renamed but not removed", async ({ page, context }) => {
  const { id, commissioner } = await seasonLeague("Kept League");
  await signIn(context, commissioner);

  await page.goto(`/l/${id}/settings`);
  const row = page.getByTestId("settings-member").filter({ hasText: "Second Five" });
  await row.getByTestId("manage-member").click();
  await expect(row.getByTestId("member-permission")).toBeVisible();
  await expect(row.getByTestId("kick-member")).toHaveCount(0);
});

test("a deputy reads the write-up setting; a plain member gets no page", async ({ page, context, browser }) => {
  const { id, member } = await seasonLeague("Ranked League");
  const deputy = await createTestUser("settings-deputy");
  await addMemberTo(id, deputy, "Deputy Five");
  await grantManage(id, deputy);

  await signIn(context, deputy);
  await page.goto(`/l/${id}/settings`);
  await expect(page.getByTestId("writeup-settings-readonly")).toContainText("On, in the analyst's voice.");
  await expect(page.getByTestId("writeup-settings")).toHaveCount(0);
  await expect(page.getByTestId("delete-league-toggle")).toHaveCount(0);

  const plain = await browser.newContext();
  await signIn(plain, member);
  const plainPage = await plain.newPage();
  await plainPage.goto(`/l/${id}/settings`);
  await expectNotFound(plainPage);
  await plain.close();
});
