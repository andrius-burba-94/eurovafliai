import { expect, test, type Page } from "@playwright/test";

import {
  addMemberTo,
  cleanupTestData,
  createLeagueFor,
  createPlayer,
  createTestUser,
  draftPlayer,
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
/** The row's inner span, which carries `data-kind` and the focus target. */
const rows = (page: Page) => page.locator("[data-row]");

/**
 * Wait for the realtime stream to be up.
 *
 * Realtime does not replay, so a message written before the first `PB_CONNECT`
 * is simply missed — and a direct database write does not `revalidatePath`, so
 * nothing re-renders to heal it. Any spec that writes behind the page's back
 * has to wait for this first. Cost one of these specs on the first run.
 */
async function subscribed(page: Page) {
  await expect(page.getByTestId("chat-live")).toHaveAttribute(
    "data-live",
    "true",
  );
}

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
    await draftPlayer(page, player.id);
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
  await draftPlayer(page, player.id);
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
  const system = rows(page).filter({ hasText: /drafted/i }).last();
  await expect(system).toHaveAttribute("data-kind", "system");
  // And the material: a system line is `waiting` — dashed, this system's word
  // for something nobody has to act on — which is a second non-colour carrier
  // beside the absent team name and the sr-only prefix.
  await expect(
    messages(page).filter({ hasText: /drafted/i }).last(),
  ).toHaveAttribute("data-state", "waiting");

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
  await expect(rows(page).first()).toHaveAttribute("data-kind", "system");
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
  await draftPlayer(page, player.id);
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

/* ── what 3.5's design critique found ────────────────────────────────────────
 *
 * The pass scored the surface 21/40, and two of its findings were P0. Each spec
 * below is named after the defect it would catch, and each failed before the
 * fix it guards.
 */

test("the collapsed header shows the rollback, not a third of it", async ({
  page,
  context,
}) => {
  // The P0. Measured at 390x844 before the fix: the rollback line got 212px of
  // 350px — 43.7% of it visible — and a six-team roll showed 36 of 142
  // characters. Worse, the line *widened* when the panel was opened, because
  // the badge beside it hid: more room in the state where it is redundant.
  //
  // The panel being collapsed is justified entirely by that header being
  // readable, so this is the assertion the design rests on.
  const { commissioner, league } = await chatLeague("Clamp League");
  const pb = await superuser();
  await pb.collection("chat_messages").create({
    league: league.id,
    body: "Chief FC rolled the draft back to #9, discarding 4 picks. The draft is paused.",
    kind: "system",
  });

  await signIn(context, commissioner);
  await page.goto(`/leagues/${league.id}`);
  await expect(page.getByTestId("chat-toggle")).toHaveAttribute(
    "data-open",
    "false",
  );

  const shown = await page.getByTestId("chat-latest").evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      clamp: style.webkitLineClamp,
      wrap: style.overflowWrap,
      // How much of the sentence actually fits in the box it is given.
      visible: node.clientHeight / (parseFloat(style.lineHeight) || 1),
      hidden: node.scrollHeight - node.clientHeight,
    };
  });
  // **Nothing hidden** is the property that matters, and it holds at both
  // widths. Two lines was the first attempt and still hid 20px of the sentence
  // at 390px — 78 characters over a ~212px line is three lines, not two.
  expect(shown.clamp).toBe("3");
  expect(shown.hidden).toBe(0);
  // And an unbroken token cannot push the header wide.
  expect(shown.wrap).toBe("break-word");
});

test("an announcement is said out loud; a member's message is not", async ({
  page,
  context,
}) => {
  // The other P0: there was **no live region on this surface at all**, so the
  // rollback this slice exists for was silent to a screen reader whether the
  // panel was open or shut.
  //
  // The limit is as important as the region. 3.3's critique found the pool's
  // live region narrating a rebuilt row on every keystroke and every pick in
  // the league — so this one carries announcements only. A conversation that
  // interrupts whatever you were reading is worse than one you go and look at.
  const { commissioner, league } = await chatLeague("Spoken League");
  const pb = await superuser();

  await signIn(context, commissioner);
  await page.goto(`/leagues/${league.id}`);
  const said = page.getByTestId("chat-said");
  await expect(said).toHaveAttribute("aria-live", "polite");
  await subscribed(page);

  await pb.collection("chat_messages").create({
    league: league.id,
    body: "The draft is paused. Nobody is on the clock.",
    kind: "system",
  });
  // Arrived at all, first — so a failure below names the live region rather
  // than the subscription.
  await expect(page.getByTestId("chat-latest")).toContainText(
    "Nobody is on the clock",
  );
  await expect(said).toContainText("Nobody is on the clock");

  // A member's line changes the transcript and the header, and says nothing.
  await openChat(page);
  await page.getByTestId("chat-input").fill("what happened");
  await page.getByTestId("chat-send").click();
  await expect(page.getByTestId("chat-latest")).toContainText("what happened");
  // Never spoken. The region is a *channel*, not a record — it holds whatever
  // was last worth saying and goes quiet otherwise, which is why this asserts
  // the absence of the chatter rather than the persistence of the
  // announcement. Asserting the latter was the first version and it was wrong
  // about what a live region is for.
  await expect(said).not.toContainText("what happened");
});

test("the transcript is reachable by keyboard with nothing in it of yours", async ({
  page,
  context,
}) => {
  // WCAG 2.1.1, and the identical defect 3.1 fixed on the board's scrollport:
  // a scrolling region with no focusable children cannot be scrolled by
  // keyboard at all. Measured before the fix for a member with no messages of
  // their own: `tabindex: null, role: null, aria-label: null,
  // focusableDescendants: 0`, over a 2304px transcript in a 338px box.
  const { other, league } = await chatLeague("Keyboard League");
  const pb = await superuser();
  for (let i = 0; i < 12; i += 1) {
    await pb.collection("chat_messages").create({
      league: league.id,
      body: `The draft order was rolled: 1. Chief FC · 2. Other FC. Line ${i}.`,
      kind: "system",
    });
  }

  // Signed in as the member who has said nothing.
  await signIn(context, other);
  await page.goto(`/leagues/${league.id}`);
  await openChat(page);

  const region = page.getByTestId("chat-list");
  await expect(region).toHaveAttribute("role", "region");
  await expect(region).toHaveAttribute("tabindex", "0");
  await expect(region).toHaveAttribute("aria-label", /transcript/i);

  // And it genuinely scrolls from the keyboard. Opening lands on the newest
  // message, so start from the top or there is nowhere further to go.
  await region.evaluate((node) => {
    node.scrollTop = 0;
  });
  await region.focus();
  await page.keyboard.press("End");
  await expect
    .poll(() => region.evaluate((node) => node.scrollTop))
    .toBeGreaterThan(0);
});

test("deleting a message can be undone, and never drops focus", async ({
  page,
  context,
}) => {
  // Third slice running that this project has concluded a destructive action
  // wants a way back rather than a confirmation in front of it — 3.4a said it
  // about the whole sheet, 3.4b about a row, and here delete was one tap with
  // no confirm, no undo, focus on `<body>`, and the body genuinely cleared in
  // the database.
  const { commissioner, league } = await chatLeague("Undo Chat League");

  await signIn(context, commissioner);
  await page.goto(`/leagues/${league.id}`);
  await openChat(page);
  await page.getByTestId("chat-input").fill("something regrettable");
  await page.getByTestId("chat-send").click();
  await expect(messages(page).last()).toContainText("something regrettable");

  // Focus stays in the box after sending. It used to land on `<body>`, because
  // clearing the box disables the button that was just clicked.
  await expect
    .poll(() =>
      page.evaluate(
        () => document.activeElement?.getAttribute("data-testid") ?? "",
      ),
    )
    .toBe("chat-input");

  await page.getByTestId("chat-retract").last().click();
  await expect(messages(page).last()).toContainText("Message deleted");
  // Focus moved to the row that became the tombstone, not to the document.
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.tagName ?? ""))
    .not.toBe("BODY");

  // And there is a way back.
  await expect(page.getByTestId("chat-undone")).toBeVisible();
  await page.getByTestId("chat-putback").click();
  await expect
    .poll(() => page.getByTestId("chat-list").textContent())
    .toContain("something regrettable");
});

test("the transcript is made of the board's material, and closes", async ({
  page,
  context,
}) => {
  // It was `<p>` rows in an unruled `overflow-y-auto` div: measured
  // `border-bottom: 0px`, no top rule, nothing closing it — while every other
  // list in this app is a `Slots` run whose top border *is* its state. The
  // radar's critique fixed "the list used to just stop"; 3.5 re-introduced it,
  // and swapping the strings would have dropped this panel into any app.
  const { commissioner, league } = await chatLeague("Material League");
  const pb = await superuser();
  await pb.collection("chat_messages").create({
    league: league.id,
    body: "The draft is running again.",
    kind: "system",
  });

  await signIn(context, commissioner);
  await page.goto(`/leagues/${league.id}`);
  await openChat(page);

  const drawn = await page.getByTestId("chat-run").evaluate((node) => {
    const style = getComputedStyle(node);
    const row = node.querySelector('[data-testid="chat-message"]')!;
    return {
      closes: style.borderBottomWidth,
      role: node.getAttribute("role"),
      rowRule: getComputedStyle(row).borderTopWidth,
      rowStyle: getComputedStyle(row).borderTopStyle,
    };
  });
  // The run closes, the way every `Slots` in this app does.
  expect(drawn.closes).toBe("1px");
  expect(drawn.role).toBe("list");
  // And the row carries a rule rather than floating in a gap.
  expect(drawn.rowRule).not.toBe("0px");
  expect(drawn.rowStyle).toBe("dashed");
});

test("a pasted URL cannot push the panel sideways", async ({
  page,
  context,
}) => {
  // Measured: a 118-character URL hid **526px** inside the panel at 390px,
  // because `overflow-y-auto` makes `overflow-x` compute to `auto` and an
  // unbroken token simply pushed the row wide. The 302-character message
  // wrapped fine — it was specifically the token.
  const { commissioner, league } = await chatLeague("URL League");
  const pb = await superuser();
  await pb.collection("chat_messages").create({
    league: league.id,
    author: null,
    body: "https://www.euroleaguebasketball.net/en/euroleague/news/a-very-long-slug-that-nobody-would-ever-shorten-before-pasting-it-here/",
    kind: "system",
  });

  await signIn(context, commissioner);
  await page.goto(`/leagues/${league.id}`);
  await openChat(page);

  const overflow = await page.getByTestId("chat-list").evaluate((node) => ({
    hidden: node.scrollWidth - node.clientWidth,
    page:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  }));
  expect(overflow.hidden).toBe(0);
  expect(overflow.page).toBe(0);
});

test("every message carries a time, and the panel keeps its total", async ({
  page,
  context,
}) => {
  // CONTEXT.md calls chat "the record of draft night" and it shipped with no
  // clock, so working out whether your pick survived a rollback meant reading
  // upward through prose.
  //
  // And the Bank aside used to be *replaced* by the unread count exactly when
  // there was unread — losing the one number that gives the badge its scale.
  const { commissioner, league } = await chatLeague("Clock League");
  const pb = await superuser();
  for (let i = 0; i < 3; i += 1) {
    await pb.collection("chat_messages").create({
      league: league.id,
      body: `The draft is paused. Nobody is on the clock. (${i})`,
      kind: "system",
    });
  }

  await signIn(context, commissioner);
  await page.goto(`/leagues/${league.id}`);

  // The total is on the closed panel, alongside the unread badge rather than
  // instead of it.
  await expect(page.getByText("3 messages")).toBeVisible();
  await expect(page.getByTestId("chat-unread")).toContainText("3 new");

  await openChat(page);
  const times = page.locator("[data-row] time");
  await expect(times).toHaveCount(3);
  await expect(times.first()).toHaveAttribute("datetime", /^\d{4}-\d{2}-\d{2}/);
  await expect(times.first()).toHaveText(/^\d{2}:\d{2}$/);
});
