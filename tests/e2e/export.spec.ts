import { expect, test } from "@playwright/test";

import {
  cleanupTestData,
  createLeagueFor,
  createPlayer,
  createTestUser,
  signIn,
  superuser,
} from "./helpers/session";

/**
 * Exporting a league's draft.
 *
 * The draft is planted rather than played: this spec is about the file that
 * comes out, and driving thirteen rounds through the room to get one would be
 * testing the pipeline again in a slower place. `draft.spec.ts` owns picking.
 */

test.afterEach(async () => {
  await cleanupTestData();
});

/** A league with a two-round, two-player draft already complete. */
async function leagueWithDraft(label: string) {
  const commissioner = await createTestUser(label);
  const league = await createLeagueFor(commissioner, "Export League");
  const pb = await superuser();
  const members = await pb
    .collection("league_members")
    .getFullList<{ id: string; user: string }>({
      filter: `league = '${league.id}'`,
      requestKey: null,
    });
  const seat = members.find((row) => row.user === commissioner.id);
  if (!seat) throw new Error("membership missing");

  // `createPlayer` names its rows "<label> <unique>, E2e", so every planted
  // player already carries the comma that "Surname, Firstname" gives every
  // real one — which is exactly the character an export that forgot to quote
  // would corrupt on, on its first row rather than on an edge case.
  const guard = await createPlayer("ExportedGuard", { position: "G" });
  const center = await createPlayer("ExportedCenter", { position: "C" });

  const draft = await pb.collection("drafts").create(
    {
      league: league.id,
      format: "snake",
      status: "complete",
      order: [seat.id],
      rounds: 2,
      seed: "export-e2e",
    },
    { requestKey: null },
  );
  // Centre taken first, so "grouped by G/F/C" is a real assertion rather than
  // one that happens to agree with pick order.
  await pb.collection("picks").create(
    { draft: draft.id, overall_no: 1, round: 1, slot: 1, member: seat.id, player: center.id, is_auto: false },
    { requestKey: null },
  );
  await pb.collection("picks").create(
    { draft: draft.id, overall_no: 2, round: 2, slot: 1, member: seat.id, player: guard.id, is_auto: true },
    { requestKey: null },
  );

  return { commissioner, league, guard, center };
}

test("a member exports the rosters as CSV from the lobby", async ({
  page,
  context,
}) => {
  const { commissioner, league, guard, center } = await leagueWithDraft("exporter");

  await signIn(context, commissioner);
  await page.goto(`/leagues/${league.id}`);

  // The way in is a door on the lobby, for any member.
  await expect(page.getByTestId("lobby-export")).toBeVisible();
  await page.getByTestId("lobby-export").click();

  await expect(page.getByTestId("export-form")).toBeVisible();
  // All four kinds are offered, and all four start selected.
  for (const kind of ["results", "rosters", "order", "pool"]) {
    await expect(page.getByTestId(`export-include-${kind}`)).toBeChecked();
  }

  // Just the rosters, as CSV.
  for (const kind of ["results", "order", "pool"]) {
    await page.getByTestId(`export-include-${kind}`).uncheck();
  }

  const download = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export-download").click(),
  ]).then(([event]) => event);

  expect(download.suggestedFilename()).toMatch(
    /^export-league-rosters-\d{4}-\d{2}-\d{2}\.csv$/,
  );

  const body = await download
    .createReadStream()
    .then(async (stream) => {
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks).toString("utf8");
    });

  const lines = body.trim().split("\r\n");
  expect(lines[0]).toBe("Team,Position,Player,Club,Round,Overall");
  // G before C, though the centre was picked first — and both names quoted.
  expect(lines[1]).toContain(`"${guard.name}"`);
  expect(lines[1]).toContain(",G,");
  expect(lines[2]).toContain(`"${center.name}"`);
  expect(lines[2]).toContain(",C,");
});

test("the download refuses somebody who is not in the league", async ({
  context,
}) => {
  const { league } = await leagueWithDraft("exportowner");
  const outsider = await createTestUser("exportoutsider");
  await signIn(context, outsider);

  const response = await context.request.get(
    `/leagues/${league.id}/export/download?include=rosters`,
  );
  // The same answer as a league that does not exist, so nobody can probe.
  expect(response.status()).toBe(404);
});

test("a league that has not drafted says so instead of offering a button", async ({
  page,
  context,
}) => {
  const commissioner = await createTestUser("exportnodraft");
  const league = await createLeagueFor(commissioner, "Undrafted League");

  await signIn(context, commissioner);
  await page.goto(`/leagues/${league.id}/export`);

  await expect(page.getByTestId("export-empty")).toBeVisible();
  await expect(page.getByTestId("export-form")).toHaveCount(0);
});
