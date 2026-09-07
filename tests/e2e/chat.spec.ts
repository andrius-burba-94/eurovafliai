import { expect, test, type Page } from "@playwright/test";

import {
  addMemberTo,
  cleanupTestData,
  createLeagueFor,
  createPlayer,
  createTestUser,
  signIn,
  superuser,
  TEST_CLUB,
} from "./helpers/session";

/**
 * League chat — slice 3.5.
 *
 * `src/lib/chat/messages.test.ts` owns every sentence the app can say, read as
 * prose, plus the rate limit and the body cap. `npm run pb:verify` owns the
 * rules: that a member of the league reads the whole conversation, that an
 * outsider reads none of it, and — the one that matters most — that a member
 * **cannot write chat with their own token**, which is what makes the
 * blueprint's withdrawn client-direct exception actually closed.
 *
 * What only a browser can answer is the claim the slice rests on: that a
 * message typed on one device appears on another **without that device asking
 * the server for anything**. Everything else here is a defect this slice could
 * plausibly have shipped.
 */

test.afterEach(async () => {
  await cleanupTestData();
});

async function chatLeague(name: string) {
  const commissioner = await createTestUser("chief");
  const league = await createLeagueFor(commissioner, name);
  const other = await createTestUser("other");
  await addMemberTo(league.id, other, "Other FC");
  // `createLeagueFor` leaves the commissioner's `team_name` empty, and chat is
  // the first surface that prints one for the *author* of something. Named
  // here so these specs assert the real sentence rather than the fallback —
  // which is separately worth keeping, and separately tested.
  const pb = await superuser();
  const own = (
    await pb.collection("league_members").getFullList<{ id: string }>({
      filter: `league = '${league.id}' && user = '${commissioner.id}'`,
    })
  )[0]!;
  await pb
    .collection("league_members")
    .update(own.id, { team_name: "Chief FC" });
  return { commissioner, other, league, ownMemberId: own.id };
}

const messages = (page: Page) => page.getByTestId("chat-message");

async function openChat(page: Page) {
  await expect(page.getByTestId("chat-toggle")).toBeVisible();
  if ((await page.getByTestId("chat-toggle").getAttribute("data-open")) !== "true") {
    await page.getByTestId("chat-toggle").click();
  }
  await expect(page.getByTestId("chat-list")).toBeVisible();
}

test("a message typed on one device appears on another, with no reload", async ({
  page,
  context,
  browser,
}) => {
  // **The claim the whole slice rests on.** The second page is never navigated
  // and never refreshed after its first load: if the message shows up there, it
  // came down the realtime stream and was appended in the browser. That is the
  // one thing the room's own pattern — subscribe, then ask the server to render
  // again — could not have given us without a round trip per line of text.
  const { commissioner, other, league } = await chatLeague("Chat League");

  await signIn(context, commissioner);
  await page.goto(`/leagues/${league.id}`);
  await openChat(page);

  const watcher = await browser.newContext();
  await signIn(watcher, other);
  const watching = await watcher.newPage();
  await watching.goto(`/leagues/${league.id}`);
  await openChat(watching);
  const before = await messages(watching).count();

  await page.getByTestId("chat-input").fill("is everyone here");
  await page.getByTestId("chat-send").click();

  // Arrives on the *other* device.
  await expect(messages(watching)).toHaveCount(before + 1);
  await expect(messages(watching).last()).toContainText("is everyone here");
  // Under the sender's own team name, not the reader's.
  await expect(messages(watching).last()).toContainText("Chief FC");

  await watcher.close();
});

test("a rollback announces itself, and is readable without opening the panel", async ({
  page,
  context,
}) => {
  // 2.4's deferred line, and the reason this slice is not just sociable. An
  // undo has been silent since 2.4 to anybody not watching the room — the picks
  // are simply not there any more, which is the least explicable state this app
  // can be in.
  //
  // Asserted through the *collapsed* header, because that is the state the room
  // is in by default: a panel that had to be opened would have defeated the
  // point.
  const { commissioner, league } = await chatLeague("Rollback League");
  const players = [];
  for (let i = 0; i < 4; i += 1) {
    players.push(await createPlayer(`Chat${i}`, { position: "GFC"[i % 3] }));
  }

  await signIn(context, commissioner);
  await page.goto(`/leagues/${league.id}`);
  await page.getByTestId("draft-roll").click();
  await page.getByTestId("start-draft").click();
  await page.getByTestId("enter-draft").click();
  await expect(page.getByTestId("pick-pool")).toBeVisible();

  // Two picks, so there is something to discard.
  await page.getByTestId("filter-club").selectOption(TEST_CLUB);
  for (const player of players.slice(0, 2)) {
    await page.getByTestId(`pick-${player.id}`).click();
    await expect(page.getByTestId("board-slot-1")).toBeVisible();
  }

  // Rollback lives behind a pause — the console only offers it to a stopped
  // draft, which is 2.4's own decision and not this slice's business.
  await page.getByTestId("draft-pause").click();
  await page.getByTestId("draft-undo-toggle").click();
  await expect(page.getByTestId("draft-undo-target")).toBeVisible();
  await page.getByTestId("draft-undo-target").fill("1");
  await page.getByTestId("draft-undo").click();

  // The panel is shut, and the announcement is still on screen.
  await expect(page.getByTestId("chat-toggle")).toHaveAttribute(
    "data-open",
    "false",
  );
  await expect(page.getByTestId("chat-latest")).toContainText(
    /rolled the draft back to #1/i,
  );
  // Both numbers, because "the draft was rolled back" tells somebody who was
  // away nothing about whether their own pick survived.
  await expect(page.getByTestId("chat-latest")).toContainText(/discarding/i);
});

test("a pick announces itself, in the app's own voice", async ({
  page,
  context,
}) => {
  const { commissioner, league } = await chatLeague("Pick Chat League");
  const player = await createPlayer("Chatpick", { position: "G" });

  await signIn(context, commissioner);
  await page.goto(`/leagues/${league.id}`);
  await page.getByTestId("draft-roll").click();
  await page.getByTestId("start-draft").click();
  await page.getByTestId("enter-draft").click();
  await page.getByTestId("filter-club").selectOption(TEST_CLUB);
  await page.getByTestId(`pick-${player.id}`).click();
  await expect(page.getByTestId("board-slot-1")).toBeVisible();

  // First: did the announcement actually get written? If this fails the
  // problem is the pipeline, not the panel — `announce` swallows its own
  // errors by design, so a missing row is otherwise silent.
  const pb = await superuser();
  await expect
    .poll(async () =>
      (
        await pb.collection("chat_messages").getFullList({
          filter: `league = '${league.id}' && kind = 'system'`,
        })
      ).map((row) => (row as { body?: string }).body ?? ""),
    )
    .toEqual(expect.arrayContaining([expect.stringMatching(/drafted/i)]));

  await openChat(page);
  const system = messages(page).filter({ hasText: /drafted/i }).last();
  await expect(system).toHaveAttribute("data-kind", "system");

  // Rail blue, and — because colour must never be the only carrier — no team
  // name beside it. The `sr-only` "The app:" is what a screen reader gets
  // instead, so the distinction survives greyscale and a colour-vision
  // simulation, which is the failure 3.2's critique measured in the radar.
  const drawn = await system.evaluate((node) => {
    const tinted = node.querySelector(".chat-system");
    return {
      colour: tinted ? getComputedStyle(tinted).color : "",
      inkColour: getComputedStyle(document.body).color,
      saysApp: node.textContent?.includes("The app:") ?? false,
    };
  });
  expect(drawn.saysApp).toBe(true);
  expect(drawn.colour).not.toBe("");
  expect(drawn.colour).not.toBe(drawn.inkColour);
});

test("deleting your own message leaves a tombstone, and the body is gone", async ({
  page,
  context,
}) => {
  const { commissioner, league } = await chatLeague("Tombstone League");

  await signIn(context, commissioner);
  await page.goto(`/leagues/${league.id}`);
  await openChat(page);
  await page.getByTestId("chat-input").fill("delete me please");
  await page.getByTestId("chat-send").click();
  await expect(messages(page).last()).toContainText("delete me please");

  await page.getByTestId("chat-retract").last().click();

  // The row stays, the text does not, and the team name is still there — the
  // transcript is honest about having changed.
  await expect(messages(page).last()).toContainText("Message deleted");
  await expect(messages(page).last()).toContainText("Chief FC");
  await expect(messages(page).last()).not.toContainText("delete me please");

  // And it is gone from the database rather than hidden by the client: hiding
  // it would leave it readable to anyone holding a member's token, which is
  // every member of the league.
  const pb = await superuser();
  const stored = await pb.collection("chat_messages").getFullList<{
    body?: string;
    deleted?: boolean;
  }>({ filter: `league = '${league.id}'` });
  expect(stored).toHaveLength(1);
  expect(stored[0]!.body).toBe("");
  expect(stored[0]!.deleted).toBe(true);
});

test("a system announcement offers nobody a delete", async ({
  page,
  context,
}) => {
  // A rollback announcement that could be removed would be worse than none.
  const { commissioner, league } = await chatLeague("No Delete League");
  const pb = await superuser();
  await pb.collection("chat_messages").create({
    league: league.id,
    body: "The draft is paused.",
    kind: "system",
  });

  await signIn(context, commissioner);
  await page.goto(`/leagues/${league.id}`);
  await openChat(page);
  await expect(messages(page)).toHaveCount(1);
  await expect(messages(page).first()).toHaveAttribute("data-kind", "system");
  await expect(page.getByTestId("chat-retract")).toHaveCount(0);
});

test("sending twice in a moment is refused, and the sentence is not lost", async ({
  page,
  context,
}) => {
  const { commissioner, league } = await chatLeague("Fast League");

  await signIn(context, commissioner);
  await page.goto(`/leagues/${league.id}`);
  await openChat(page);

  await page.getByTestId("chat-input").fill("first");
  await page.getByTestId("chat-send").click();
  await expect(messages(page).last()).toContainText("first");

  await page.getByTestId("chat-input").fill("second, straight away");
  await page.getByTestId("chat-send").click();

  await expect(page.getByTestId("chat-error")).toBeVisible();
  await expect(page.getByTestId("chat-error")).toContainText(/slow down/i);
  // Handed back rather than swallowed: a refusal must never cost somebody the
  // sentence they typed.
  await expect(page.getByTestId("chat-input")).toHaveValue(
    "second, straight away",
  );
  await expect(messages(page)).toHaveCount(1);
});

test("the room lost its ticker and kept everything else", async ({
  page,
  context,
}) => {
  // Chat replaced the ticker rather than joining it. This asserts the removal,
  // so a future merge cannot quietly restore the duplication.
  const { commissioner, league } = await chatLeague("No Ticker League");
  const player = await createPlayer("Tickerless", { position: "G" });

  await signIn(context, commissioner);
  await page.goto(`/leagues/${league.id}`);
  await page.getByTestId("draft-roll").click();
  await page.getByTestId("start-draft").click();
  await page.getByTestId("enter-draft").click();

  await expect(page.getByTestId("pick-list")).toHaveCount(0);
  await expect(page.getByText("Recent picks")).toHaveCount(0);

  // The board, the radar, the pool and chat all still there.
  await expect(page.getByTestId("draft-board")).toBeVisible();
  await expect(page.getByTestId("pick-pool")).toBeVisible();
  await expect(page.getByTestId("chat-toggle")).toBeVisible();

  // And the pick still lands, which is the thing that must not have broken.
  await page.getByTestId("filter-club").selectOption(TEST_CLUB);
  await page.getByTestId(`pick-${player.id}`).click();
  await expect(page.getByTestId("board-slot-1")).toHaveAttribute(
    "data-state",
    "filled",
  );
});

test("the roll announces itself in the lobby, where it happens", async ({
  page,
  context,
}) => {
  const { commissioner, league } = await chatLeague("Roll Chat League");

  await signIn(context, commissioner);
  await page.goto(`/leagues/${league.id}`);
  await page.getByTestId("draft-roll").click();

  await expect(page.getByTestId("chat-latest")).toContainText(
    /the draft order was rolled/i,
  );
  // The whole order, numbered — it is the announcement people scroll back to.
  await openChat(page);
  await expect(messages(page).last()).toContainText("1.");
  await expect(messages(page).last()).toContainText("Chief FC");
});
