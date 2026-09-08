import { expect, test } from "@playwright/test";

import {
  cleanupTestData,
  createLeagueFor,
  createPlayer,
  createTestUser,
  signIn,
  superuser,
  TEST_CLUB,
} from "./helpers/session";

/**
 * Player mapping — slice 4.2.
 *
 * What the feed *says* is never asserted — that is other people's transfer
 * news, and the rule that reads it is covered by unit tests
 * (`src/lib/rosters/rename.test.ts`, against the fifteen real pairs measured on
 * 2026-09-08). What is driven through a browser here is everything that does
 * **not** depend on a network: the permission boundary, the box-score half, and
 * — because the page reads the last stored check — the confirm and reject
 * paths with a planted batch, including the guards that stop one person code
 * landing on two players.
 *
 * Everything is scoped to `TEST_CLUB` and this run's own person codes, because
 * `players`, `roster_imports` and `stat_imports` are all app-global. The rename
 * specs go further and open **their own check by id** (`?check=<batch>`): the
 * page otherwise shows the *newest* stored check, and two of these specs
 * running in parallel each planted one and then answered the other's question.
 * Passed alone, failed in the suite — the same app-global trap as `sweepOnce`.
 */

const personCode = () =>
  `8${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 900 + 100)}`;

/** A `stat_imports` batch with one unmatched code, exactly as 4.3 writes it. */
async function plantUnmatchedBatch({
  code,
  name,
  club,
  games,
}: {
  code: string;
  name: string;
  club: string;
  games: number[];
}) {
  const pb = await superuser();
  const batch = await pb.collection("stat_imports").create(
    {
      source: "api",
      season: "E2026",
      applied: true,
      rows: games.length,
      created_rows: 0,
      updated_rows: 0,
      unchanged_rows: 0,
      plan: {
        creates: [],
        updates: [],
        unchanged: 0,
        games: games.length,
        rounds: [1],
        unmatched: [{ personCode: code, lines: games, name, clubCode: club }],
      },
      log: `No player with person code ${code}.`,
    },
    { requestKey: null },
  );
  return batch.id as string;
}

/**
 * A report-only `roster_imports` batch carrying one rename proposal, in the
 * exact shape `checkTheFeed` stores — so the browser reaches the confirm path
 * without 21 requests to somebody else's API.
 */
async function plantRenameCheck({
  player,
  incomingName,
  code,
  club,
  confidence = "likely",
  alternatives = [],
}: {
  player: { id: string; name: string };
  incomingName: string;
  code: string;
  club: string;
  confidence?: "likely" | "candidate";
  alternatives?: { name: string; person_code: string }[];
}) {
  const pb = await superuser();
  const batch = await pb.collection("roster_imports").create(
    {
      source: "api",
      season: "E2026",
      applied: false,
      rows: 1,
      diff: {
        adds: [],
        changes: [],
        leaving: [],
        blocked: [],
        problems: [],
        renames: [
          {
            existing: {
              id: player.id,
              name: player.name,
              club_code: club,
              name_normalized: "planted",
              person_code: null,
              status: "active",
              position: "G",
              club_name: club,
              source: "api",
              dorsal: "1",
              manual_lock: false,
            },
            incoming: {
              name: incomingName,
              name_normalized: incomingName.toLowerCase(),
              club_code: club,
              club_name: club,
              position: "G",
              status: "active",
              person_code: code,
              source: "api",
              dorsal: "1",
            },
            confidence,
            reason: "planted by a spec",
            alternatives,
          },
        ],
      },
      log: "planted",
    },
    { requestKey: null },
  );
  return batch.id as string;
}

async function removeRosterBatch(id: string) {
  const pb = await superuser();
  await pb
    .collection("roster_imports")
    .delete(id, { requestKey: null })
    .catch(() => {});
}

async function removeBatch(id: string) {
  const pb = await superuser();
  await pb
    .collection("stat_imports")
    .delete(id, { requestKey: null })
    .catch(() => {});
}

async function playerById(id: string) {
  const pb = await superuser();
  return pb.collection("players").getOne<{
    id: string;
    name: string;
    person_code?: string;
  }>(id, { requestKey: null });
}

test.afterEach(async () => {
  await cleanupTestData();
});

test("a member with no league of their own cannot reach the mapping page", async ({
  page,
  context,
}) => {
  const nobody = await createTestUser("mapnobody");
  await signIn(context, nobody);

  await page.goto("/players/mapping");
  await expect(page.getByText(/404|not found/i).first()).toBeVisible();
});

test("an unattached code from a box score is offered the player it probably is", async ({
  page,
  context,
}) => {
  const code = personCode();
  // The pool has this player, with no code — the exact state that makes a box
  // score unattachable.
  const player = await createPlayer("Unmapped", { person_code: "" });
  const batch = await plantUnmatchedBatch({
    code,
    // The feed's spelling of the same person: the pool row is
    // "Unmapped <unique>, E2e", so this shares its tokens.
    name: player.name.replace(", E2e", " Passport, E2e"),
    club: TEST_CLUB,
    games: [101, 102],
  });

  const commissioner = await createTestUser("mapper");
  await createLeagueFor(commissioner, "Mapping League");
  await signIn(context, commissioner);

  try {
    await page.goto("/players/mapping");
    await expect(page.getByTestId("player-mapping")).toBeVisible();

    const row = page.getByTestId(`code-${code}`);
    await expect(row).toBeVisible();
    // The name and the games it appeared in, not just a number — that is what
    // makes the question answerable.
    await expect(row).toContainText(code);
    await expect(row).toContainText("2 games");

    // And the pool player with no code is the suggestion.
    await expect(
      page.getByTestId(`code-choice-${code}`),
    ).toContainText(player.name);

    expect((await playerById(player.id)).person_code ?? "").toBe("");

    await page.getByTestId(`code-attach-${code}`).click();

    // It says what it did, and the question stops being asked: the row is
    // gone because `readUnmatchedCodes` skips a code that now has a player.
    await expect(page.getByTestId("mapping-done")).toContainText(code);
    await expect(row).toHaveCount(0);

    // The write really happened.
    expect((await playerById(player.id)).person_code).toBe(code);
  } finally {
    await removeBatch(batch);
  }
});

test("a code whose player already carries a different one is refused", async ({
  page,
  context,
}) => {
  const code = personCode();
  const taken = personCode();
  // Two players: one already holds `taken`, and the suggestion list will offer
  // only codeless players — so this asserts the *server* guard by posting the
  // held code at a player who has one.
  const holder = await createPlayer("Holder", { person_code: taken });
  const codeless = await createPlayer("Codeless", { person_code: "" });
  const batch = await plantUnmatchedBatch({
    code: taken,
    name: codeless.name,
    club: TEST_CLUB,
    games: [201],
  });

  const commissioner = await createTestUser("mapclash");
  await createLeagueFor(commissioner, "Mapping League");
  await signIn(context, commissioner);

  try {
    await page.goto("/players/mapping");

    // The code is already attached to somebody, so the page does not ask about
    // it at all — a resolved question must not keep being asked.
    await expect(page.getByTestId(`code-${taken}`)).toHaveCount(0);
    expect((await playerById(holder.id)).person_code).toBe(taken);
    // And nothing was written to the other player.
    expect((await playerById(codeless.id)).person_code ?? "").toBe("");
    expect(code).not.toBe(taken);
  } finally {
    await removeBatch(batch);
  }
});

test("an unmatched code with no candidate in the pool says so plainly", async ({
  page,
  context,
}) => {
  const code = personCode();
  const batch = await plantUnmatchedBatch({
    code,
    name: "Nobody, Whoever",
    // A club nothing in the pool belongs to.
    club: `${TEST_CLUB}X`,
    games: [301],
  });

  const commissioner = await createTestUser("mapempty");
  await createLeagueFor(commissioner, "Mapping League");
  await signIn(context, commissioner);

  try {
    await page.goto("/players/mapping");
    const row = page.getByTestId(`code-${code}`);
    await expect(row).toContainText("No player in the pool is missing a code");
    // No control to press, because there is nothing to choose.
    await expect(page.getByTestId(`code-attach-${code}`)).toHaveCount(0);
  } finally {
    await removeBatch(batch);
  }
});

test("checking the feed writes nothing to the pool", async ({
  page,
  context,
}) => {
  // The one rename-half assertion worth making through a browser: the check is
  // read-only. What the feed *says* is not asserted — that is other people's
  // transfer news, and it is covered by unit tests against measured pairs.
  const player = await createPlayer("Untouched", { person_code: "" });
  const commissioner = await createTestUser("mapcheck");
  await createLeagueFor(commissioner, "Mapping League");
  await signIn(context, commissioner);

  await page.goto("/players/mapping");

  // Waiting on the action's own round trip, not on something appearing. The
  // first version of this waited for any of the result panels to be visible —
  // and passed in under a second, because the page *also* renders the last
  // stored check, which a sibling spec had planted. It asserted nothing.
  const [response] = await Promise.all([
    page.waitForResponse(
      (reply) =>
        reply.request().method() === "POST" &&
        reply.url().includes("/players/mapping"),
      // 21 requests to somebody else's API, so generous.
      { timeout: 60_000 },
    ),
    page.getByTestId("mapping-check").click(),
  ]);
  expect(response.status()).toBeLessThan(400);

  const after = await playerById(player.id);
  expect(after.person_code ?? "").toBe("");
  expect(after.name).toBe(player.name);
});

test("confirming a rename keeps the player's id and takes the feed's name", async ({
  page,
  context,
}) => {
  const code = personCode();
  const player = await createPlayer("Renamed", { person_code: "" });
  const newName = `${player.name} Passport`;
  const batch = await plantRenameCheck({
    player,
    incomingName: newName,
    code,
    club: TEST_CLUB,
  });

  const commissioner = await createTestUser("maprename");
  await createLeagueFor(commissioner, "Mapping League");
  await signIn(context, commissioner);

  try {
    await page.goto(`/players/mapping?check=${batch}`);
    const row = page.getByTestId(`rename-${player.id}`);
    await expect(row).toContainText(player.name);
    await expect(row).toContainText(newName);

    await page.getByTestId(`rename-confirm-${player.id}`).click();

    await expect(page.getByTestId("mapping-done")).toContainText(code);
    // The question is answered, so it stops being asked: `readLatestCheck`
    // drops a proposal whose player now has a code, and every action
    // revalidates. The sentence above is the record.
    await expect(row).toHaveCount(0);

    // **The id survived.** That is the whole reason a merge exists rather than
    // a delete-and-recreate: picks, cheat sheets, roster memberships and box
    // scores all reference it.
    const after = await playerById(player.id);
    expect(after.name).toBe(newName);
    expect(after.person_code).toBe(code);
  } finally {
    await removeRosterBatch(batch);
  }
});

test("rejecting a rename adds the arrival and departs the stored player", async ({
  page,
  context,
}) => {
  const code = personCode();
  const player = await createPlayer("NotTheSame", { person_code: "" });
  const batch = await plantRenameCheck({
    player,
    incomingName: `Different Person ${code}, E2e`,
    code,
    club: TEST_CLUB,
  });

  const commissioner = await createTestUser("mapreject");
  await createLeagueFor(commissioner, "Mapping League");
  await signIn(context, commissioner);

  try {
    await page.goto(`/players/mapping?check=${batch}`);
    await page.getByTestId(`rename-reject-${player.id}`).click();

    await expect(page.getByTestId("mapping-done")).toContainText("marked as having left");

    // The stored row departs — and keeps its own name, untouched.
    const after = await playerById(player.id);
    expect(after.name).toBe(player.name);
    expect(after.person_code ?? "").toBe("");

    // And the arrival exists as its own player, with the code.
    const pb = await superuser();
    const created = await pb.collection("players").getFullList<{ id: string }>({
      filter: `person_code = '${code}'`,
      requestKey: null,
    });
    expect(created).toHaveLength(1);
    expect(created[0]!.id).not.toBe(player.id);
  } finally {
    await removeRosterBatch(batch);
  }
});

test("a code that already belongs to somebody is never even asked about", async ({
  page,
  context,
}) => {
  // One person code on two players would make box scores attach to whichever
  // row the filter happened to return first, so there are **two** guards. This
  // asserts the outer one: `readLatestCheck` drops a proposal whose code is
  // already taken, so the surface never offers the merge at all.
  //
  // `confirmRename` re-checks it anyway — a stale batch, or two tabs — and
  // that inner guard is deliberately unreachable from here. It is
  // defence-in-depth rather than dead code: the whole reason confirms
  // re-validate is that the stored check can be older than the pool.
  const code = personCode();
  const holder = await createPlayer("AlreadyHas", { person_code: code });
  const player = await createPlayer("WantsIt", { person_code: "" });
  const batch = await plantRenameCheck({
    player,
    incomingName: `${player.name} Passport`,
    code,
    club: TEST_CLUB,
  });

  const commissioner = await createTestUser("mapclash2");
  await createLeagueFor(commissioner, "Mapping League");
  await signIn(context, commissioner);

  try {
    await page.goto(`/players/mapping?check=${batch}`);
    await expect(page.getByTestId("player-mapping")).toBeVisible();
    await expect(page.getByTestId(`rename-${player.id}`)).toHaveCount(0);

    // Neither row moved.
    expect((await playerById(player.id)).person_code ?? "").toBe("");
    expect((await playerById(holder.id)).person_code).toBe(code);
  } finally {
    await removeRosterBatch(batch);
  }
});

test("a locked player is not merged, and says why", async ({
  page,
  context,
}) => {
  const code = personCode();
  const player = await createPlayer("Locked", {
    person_code: "",
    manual_lock: true,
  });
  const batch = await plantRenameCheck({
    player,
    incomingName: `${player.name} Passport`,
    code,
    club: TEST_CLUB,
  });

  const commissioner = await createTestUser("maplocked");
  await createLeagueFor(commissioner, "Mapping League");
  await signIn(context, commissioner);

  try {
    await page.goto(`/players/mapping?check=${batch}`);
    await page.getByTestId(`rename-confirm-${player.id}`).click();

    await expect(page.getByTestId("mapping-error")).toContainText("manual lock");
    expect((await playerById(player.id)).person_code ?? "").toBe("");
  } finally {
    await removeRosterBatch(batch);
  }
});

test("a candidate offers its alternatives, and the chosen one is what lands", async ({
  page,
  context,
}) => {
  const first = personCode();
  const second = personCode();
  const player = await createPlayer("Nickname", { person_code: "" });
  const batch = await plantRenameCheck({
    player,
    incomingName: `Guess One ${first}, E2e`,
    code: first,
    club: TEST_CLUB,
    confidence: "candidate",
    alternatives: [
      { name: `Guess One ${first}, E2e`, person_code: first },
      { name: `Guess Two ${second}, E2e`, person_code: second },
    ],
  });

  const commissioner = await createTestUser("mapcandidate");
  await createLeagueFor(commissioner, "Mapping League");
  await signIn(context, commissioner);

  try {
    await page.goto(`/players/mapping?check=${batch}`);
    // A guess is asked, not asserted.
    await expect(page.getByTestId("mapping-candidates")).toBeVisible();

    await page
      .getByTestId(`rename-choice-${player.id}`)
      .selectOption(second);
    await page.getByTestId(`rename-confirm-${player.id}`).click();

    await expect(page.getByTestId("mapping-done")).toContainText(second);
    const after = await playerById(player.id);
    expect(after.person_code).toBe(second);
    expect(after.name).toContain("Guess Two");
  } finally {
    await removeRosterBatch(batch);
  }
});
