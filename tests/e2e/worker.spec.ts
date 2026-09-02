import { expect, test } from "@playwright/test";

import { parsePbDate } from "../../src/lib/drafts/due";
import { deadlineFrom } from "../../src/lib/drafts/pipeline";
import { sweepOnce } from "../../src/worker/sweep";

import {
  addMemberTo,
  cleanupTestData,
  createLeagueFor,
  createPlayer,
  createTestUser,
  signIn,
  superuser,
} from "./helpers/session";

/**
 * The worker's sweep, against the real PocketBase — slice 2.5.
 *
 * The unit suite (`src/worker/sweep.test.ts`) covers the awkward states with a
 * fake. What only the real database can prove is the part the fake had to
 * imitate: that the filters parse, that `is_auto` and the composite indexes
 * behave as the migration says, and that a pick written by the worker is the
 * same shape as a pick written by a browser.
 *
 * No worker daemon is started. The specs call `sweepOnce` directly, which is
 * exactly one tick of it, and pass `onlyDraft` so a suite run against a
 * developer's own database cannot autodraft into a league they were testing by
 * hand.
 */

test.afterEach(async () => {
  await cleanupTestData();
});

/**
 * A deadline `offsetMs` from now, written the way the app writes one — through
 * `deadlineFrom`, not a local copy of it. A spec that formats its own dates is
 * a spec that keeps passing after the stored format changes.
 */
function stamp(offsetMs: number): string {
  return deadlineFrom(new Date(Date.now() + offsetMs), 0);
}

/**
 * A league mid-draft, planted rather than clicked.
 *
 * The UI path for starting a draft is covered by `draft.spec.ts`; what these
 * specs need is a draft whose deadline is wherever they say it is, which is not
 * something a browser can arrange.
 */
async function liveDraft(name: string, deadlineOffsetMs: number) {
  const commissioner = await createTestUser("chief");
  const league = await createLeagueFor(commissioner, name);
  const other = await createTestUser("other");
  await addMemberTo(league.id, other, "Other FC");
  // A pool of its own, so the spec works whether or not this checkout has ever
  // run `npm run rosters:sync`.
  await Promise.all([
    createPlayer("Alpha", { position: "G" }),
    createPlayer("Bravo", { position: "F" }),
    createPlayer("Charlie", { position: "C" }),
  ]);

  const pb = await superuser();
  const members = await pb.collection("league_members").getFullList({
    filter: `league = '${league.id}'`,
    sort: "created",
    requestKey: null,
  });
  for (const [index, member] of members.entries()) {
    await pb
      .collection("league_members")
      .update(member.id, { draft_position: index + 1 }, { requestKey: null });
  }

  const draft = await pb.collection("drafts").create(
    {
      league: league.id,
      format: "snake",
      status: "live",
      order: members.map((member) => member.id),
      // The league's own template: 5G + 5F + 3C.
      rounds: 13,
      current_pick: 1,
      pick_seconds: 60,
      deadline: stamp(deadlineOffsetMs),
      seed: "e2e-seed",
    },
    { requestKey: null },
  );

  return { pb, league, commissioner, other, members, draft };
}

/** One tick, scoped to the draft under test. */
async function tick(draftId: string, graceMs?: number) {
  const pb = await superuser();
  const messages: string[] = [];
  const report = await sweepOnce({
    pb,
    clock: () => new Date(),
    log: (message) => messages.push(message),
    onlyDraft: draftId,
    graceMs,
  });
  return { report, messages };
}

test("the sweep picks for a member who has run out of time", async () => {
  const { pb, draft, members } = await liveDraft("Timeout League", -5_000);

  const { report } = await tick(draft.id);
  expect(report.autopicked).toBe(1);

  const picks = await pb.collection("picks").getFullList({
    filter: `draft = '${draft.id}'`,
    requestKey: null,
  });
  expect(picks).toHaveLength(1);
  expect(picks[0]).toMatchObject({
    overall_no: 1,
    round: 1,
    slot: 1,
    member: members[0].id,
    is_auto: true,
  });

  // Pick-then-advance: the draft moved on, with a fresh clock for the next one.
  const after = await pb
    .collection("drafts")
    .getOne(draft.id, { requestKey: null });
  expect(after.current_pick).toBe(2);
  // Read back through the app's own parser, so this asserts the format the
  // sweep actually has to survive rather than one the spec invented.
  expect(parsePbDate(after.deadline)?.getTime()).toBeGreaterThan(Date.now());
});

test("and leaves a member alone while they still have time", async () => {
  const { pb, draft } = await liveDraft("Patient League", 60_000);

  const { report } = await tick(draft.id);
  expect(report.autopicked).toBe(0);

  const picks = await pb
    .collection("picks")
    .getFullList({ filter: `draft = '${draft.id}'`, requestKey: null });
  expect(picks).toEqual([]);
});

test("a member who armed autodraft is picked for without waiting", async () => {
  const { pb, draft, members } = await liveDraft("Armed League", 60_000);
  await pb
    .collection("league_members")
    .update(members[0].id, { autodraft_enabled: true }, { requestKey: null });

  const { report, messages } = await tick(draft.id);
  expect(report.autopicked).toBe(1);
  expect(messages.join(" ")).toContain("autodraft armed");

  const picks = await pb
    .collection("picks")
    .getFullList({ filter: `draft = '${draft.id}'`, requestKey: null });
  expect(picks[0]).toMatchObject({ member: members[0].id, is_auto: true });
});

test("a pick that landed without the draft advancing is repaired", async () => {
  // ADR-0003's one intermediate state, staged against the real database: the
  // pick exists, `current_pick` still points at it.
  const { pb, draft, members } = await liveDraft("Repair League", 60_000);
  const player = await createPlayer("Delta", { position: "G" });
  await pb.collection("picks").create(
    {
      draft: draft.id,
      overall_no: 1,
      round: 1,
      slot: 1,
      member: members[0].id,
      player: player.id,
      is_auto: false,
    },
    { requestKey: null },
  );

  const { report } = await tick(draft.id);
  expect(report.repaired).toBe(1);

  const after = await pb
    .collection("drafts")
    .getOne(draft.id, { requestKey: null });
  expect(after.current_pick).toBe(2);
  // A repair advances; it does not pick.
  const picks = await pb
    .collection("picks")
    .getFullList({ filter: `draft = '${draft.id}'`, requestKey: null });
  expect(picks).toHaveLength(1);
});

test("the room counts down, and shows the autodraft that lands in it", async ({
  page,
  context,
}) => {
  // Two seconds on the clock: long enough to see it running, short enough that
  // the room is past zero and pulling for itself by the time the sweep runs.
  const { commissioner, league, draft } = await liveDraft("Clock League", 2_000);
  await signIn(context, commissioner);

  await page.goto(`/leagues/${league.id}/draft`);
  await expect(page.getByTestId("draft-room")).toBeVisible();
  await expect(page.getByTestId("pick-clock")).toContainText(/Time left|Time's up/);

  // The offset endpoint the countdown corrects itself against. Asserted here
  // rather than assumed: the component swallows a failed fetch on purpose and
  // falls back to the local clock, so a broken `/api/time` would look exactly
  // like a working one from the outside.
  const time = await page.request.get("/api/time");
  const body = (await time.json()) as { now?: number };
  expect(typeof body.now).toBe("number");
  expect(Math.abs((body.now ?? 0) - Date.now())).toBeLessThan(60_000);

  // Past the deadline and past the sweep's grace period, then one tick.
  await page.waitForTimeout(3_500);
  const { report } = await tick(draft.id);
  expect(report.autopicked).toBe(1);

  // Nobody reloaded: the countdown pulls the page for itself after zero, which
  // is what stands in for realtime until Phase 3.2.
  await expect(page.getByTestId("board-pick")).toHaveCount(1, {
    timeout: 20_000,
  });
  await expect(page.getByTestId("board-pick")).toContainText("auto");
});

test("a member can hand their picks to the engine", async ({
  page,
  context,
}) => {
  const { commissioner, league } = await liveDraft("Handover League", 60_000);
  await signIn(context, commissioner);

  await page.goto(`/leagues/${league.id}/draft`);
  await expect(page.getByTestId("autodraft-state")).toContainText(
    "Autodraft is off",
  );

  await page.getByTestId("autodraft-toggle").click();
  await expect(page.getByTestId("autodraft-state")).toContainText(
    "Autodraft is on",
  );
  await expect(page.getByTestId("autodraft-toggle")).toContainText(
    "Take my picks back",
  );
});
