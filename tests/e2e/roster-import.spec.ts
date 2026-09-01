import { expect, test } from "@playwright/test";

import {
  cleanupTestData,
  createLeagueFor,
  createPlayer,
  createTestUser,
  resetRosterAuthority,
  signIn,
  TEST_CLUB,
} from "./helpers/session";

/**
 * The CSV front door — slice 2.1b.
 *
 * The pool is app-global, so these specs plant their own players and assert on
 * counts and messages rather than on whatever the last sync ingested.
 */

// Serial, not parallel. These specs touch app-global state — the roster
// authority and the shared pool — so two workers running them at once had one
// spec's authority flip decide another spec's outcome. Found the hard way.
test.describe.configure({ mode: "serial" });

test.afterEach(async () => {
  await cleanupTestData();
  await resetRosterAuthority();
});

test("a member with no league of their own cannot reach the importer", async ({
  page,
  context,
}) => {
  const nobody = await createTestUser("nobody");
  await signIn(context, nobody);

  await page.goto("/players/import");
  // notFound, not a refusal: the page does not confirm it exists.
  await expect(page.getByText(/404|not found/i).first()).toBeVisible();
});

test("a commissioner previews a CSV without writing anything", async ({
  page,
  context,
}) => {
  const commissioner = await createTestUser("importer");
  await createLeagueFor(commissioner, "Import League");
  await signIn(context, commissioner);

  await page.goto("/players/import");
  await expect(page.getByTestId("roster-import")).toBeVisible();

  await page
    .getByTestId("csv-input")
    .fill(`"Newman, Alfred",${TEST_CLUB},G\n"Broken, Row",${TEST_CLUB},wing`);

  await page.getByTestId("csv-preview").click();

  // The plan, before anything is written.
  await expect(page.getByTestId("import-plan")).toBeVisible();
  await expect(page.getByTestId("import-plan")).toContainText("New players");
  // The bad line is reported by number, and does not cost the good one.
  await expect(page.getByTestId("import-problems")).toContainText(/line 2/i);
  await expect(page.getByTestId("import-sample")).toContainText(
    "Newman, Alfred",
  );

  // Nothing applied yet.
  await expect(page.getByTestId("import-applied")).toHaveCount(0);
});

test("with the API holding authority, applying records instead of writing", async ({
  page,
  context,
}) => {
  const commissioner = await createTestUser("recorder");
  await createLeagueFor(commissioner, "Record League");
  await signIn(context, commissioner);

  await page.goto("/players/import");
  await expect(page.getByText(/api may write/i)).toBeVisible();

  const ghost = `Ghost ${Date.now()}, Player`;
  await page.getByTestId("csv-input").fill(`"${ghost}",${TEST_CLUB},C`);
  await page.getByTestId("csv-preview").click();
  await page.getByTestId("csv-apply").click();

  // The drift report: recorded, nothing written.
  await expect(page.getByTestId("import-applied")).toContainText(
    /recorded, not applied/i,
  );

  await page.goto("/players");
  await expect(page.getByTestId("players")).not.toContainText(ghost);
});

test("handing authority to the CSV arms the write, and the guard holds", async ({
  page,
  context,
}) => {
  const commissioner = await createTestUser("switcher");
  await createLeagueFor(commissioner, "Switch League");
  const locked = await createPlayer("Locked", {
    position: "C",
    manual_lock: true,
  });
  await signIn(context, commissioner);

  await page.goto("/players/import");
  await page.getByTestId("authority-switch").click();
  await expect(page.getByText(/csv may write/i)).toBeVisible();

  await page
    .getByTestId("csv-input")
    .fill(`"${locked.name}",${TEST_CLUB},G\n"Fresh, Face",${TEST_CLUB},F`);
  await page.getByTestId("csv-preview").click();

  // The lock holds: the sheet disagrees about the position and is refused.
  await expect(page.getByTestId("import-plan")).toContainText(
    "Locked, so untouched",
  );

  // The apply button now says it will really write, which is the wiring this
  // spec exists to prove.
  await expect(page.getByTestId("csv-apply")).toContainText(
    /apply to the pool/i,
  );

  // This spec deliberately stops short of applying. A two-line sheet against a
  // three-hundred-player pool marks almost all of it as departed, and an E2E
  // run must not do that to shared state — an earlier version of this test did,
  // and left the pool empty for every spec that followed.
  //
  // The mass-departure guard is covered where it is deterministic:
  // `assessDepartures` in src/lib/rosters/diff.test.ts. Whether it fires here
  // depends on how much of the ambient pool is active, which is not this
  // spec's business.

  // Hand it back, so the next spec starts from the default.
  await page.getByTestId("authority-switch").click();
  await expect(page.getByText(/api may write/i)).toBeVisible();
});
