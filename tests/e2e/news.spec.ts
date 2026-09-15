import { expect, test, type Page } from "@playwright/test";

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
 * Injuries and moves — slice 9.4.
 *
 * What RotoWire says is never asserted here: the parser is unit-tested against
 * saved markup (`src/lib/news/rotowire.test.ts`) and the pass against the
 * strict fake (`ingest.test.ts`), and a spec that fetched somebody else's
 * website would fail on their Tuesday rather than on our bug.
 *
 * So the items are **planted in exactly the shape the pass writes**, and what
 * is driven through a browser is everything that does not need a network: the
 * board and its links, the pool carrying the flag, the correction that marks a
 * player available again — including the part that makes it stick — and the
 * mapping question an unmatched name raises.
 *
 * `player_news` is app-global, like `players` and `stat_imports` before it, so
 * every row here is keyed to this run's own slug and cleaned up by it.
 */

const run = `e2e${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const slugs: string[] = [];

async function plantItem({
  slug,
  name,
  playerId = "",
  headline,
  bodyPart = "Knee",
  published = "2026-09-13",
  injured = true,
  applied = true,
}: {
  slug: string;
  name: string;
  playerId?: string;
  headline: string;
  bodyPart?: string;
  published?: string;
  injured?: boolean;
  applied?: boolean;
}): Promise<string> {
  const pb = await superuser();
  if (!slugs.includes(slug)) slugs.push(slug);
  const item = await pb.collection("player_news").create(
    {
      source: "rotowire",
      source_key: `${slug}|${published}|${headline.toLowerCase()}`,
      slug,
      player: playerId,
      name,
      club_name: "E2E Test Club",
      position: "G",
      body_part: injured ? bodyPart : "",
      headline,
      url: `https://www.rotowire.com/euro/player/${slug}`,
      published,
      status: injured ? "injured" : "",
      applied,
    },
    { requestKey: null },
  );
  return item.id as string;
}

/** The board is app-global, so find this run's row rather than the first one. */
const itemRow = (page: Page, headline: string) =>
  page.getByTestId("news-item").filter({ hasText: headline });

test.afterAll(async () => {
  const pb = await superuser();
  for (const slug of slugs) {
    const rows = await pb
      .collection("player_news")
      .getFullList({ filter: `slug = '${slug}'`, requestKey: null })
      .catch(() => []);
    for (const row of rows) {
      await pb
        .collection("player_news")
        .delete(row.id, { requestKey: null })
        .catch(() => {});
    }
  }
  await cleanupTestData();
});

test("an injury item marks the player in the pool, and links back to who said it", async ({
  page,
  context,
}) => {
  const commissioner = await createTestUser("news-reader");
  await createLeagueFor(commissioner, "News League");
  const player = await createPlayer("Kneed", { status: "injured" });
  const headline = `Sits with sore knee ${run}`;
  await plantItem({
    slug: `${run}-kneed`,
    name: player.name,
    playerId: player.id,
    headline,
  });

  await signIn(context, commissioner);
  await page.goto("/players/news");

  const row = itemRow(page, headline);
  await expect(row).toBeVisible();
  await expect(row).toContainText(player.name);
  // The fact, not the article: body part and date, and their link for the rest.
  await expect(row).toContainText("Knee");
  await expect(row).toContainText("13 Sep 2026");
  await expect(row.getByTestId("news-link")).toHaveAttribute(
    "href",
    `https://www.rotowire.com/euro/player/${run}-kneed`,
  );
  // An item that is currently why somebody is unavailable is struck live.
  await expect(row).toHaveAttribute("data-state", "live");

  // The pool says the word on the player it applies to, which is the whole
  // point of feeding `players.status` rather than building a parallel flag.
  await page.goto("/players");
  await page.locator("details", { hasText: TEST_CLUB }).locator("summary").click();
  await expect(
    page.getByTestId("pool-player").filter({ hasText: player.name }),
  ).toContainText("injured");
});

test("a commissioner marks a player available again, and the next pass cannot undo it", async ({
  page,
  context,
}) => {
  const commissioner = await createTestUser("news-fixer");
  await createLeagueFor(commissioner, "Fit Again League");
  const player = await createPlayer("Healed", { status: "injured" });
  const headline = `Out with injury ${run}`;
  const itemId = await plantItem({
    slug: `${run}-healed`,
    name: player.name,
    playerId: player.id,
    headline,
    // Not yet spent: this is the item that would flag them again.
    applied: false,
  });

  await signIn(context, commissioner);
  await page.goto("/players/news");

  const control = page.getByTestId(`mark-fit-${player.id}`);
  await expect(control).toBeVisible();
  await control.click();

  await expect(page.getByTestId("news-done")).toContainText(
    "available again",
    { timeout: 20_000 },
  );

  const pb = await superuser();
  const after = await pb
    .collection("players")
    .getOne(player.id, { requestKey: null });
  expect(after.status).toBe("active");

  // The second write is what makes the correction stick: an unspent item is
  // three weeks of reason for the next hourly pass to flag them straight back.
  const item = await pb
    .collection("player_news")
    .getOne(itemId, { requestKey: null });
  expect(item.applied).toBe(true);

  // And the player is no longer listed as unavailable.
  await expect(page.getByTestId(`unfit-${player.id}`)).toHaveCount(0);
});

test("a published name nobody answers to becomes a mapping question", async ({
  page,
  context,
}) => {
  const commissioner = await createTestUser("news-mapper");
  await createLeagueFor(commissioner, "Mapping News League");
  const player = await createPlayer("Namesake", { status: "active" });
  // The publisher's form of a name the pool holds differently — the common
  // case this queue exists for. Candidates are ranked over the whole pool, so
  // the name has to be close enough to be offered, which the real ones are.
  const published = player.name.replace(", E2e", "");
  const slug = `${run}-unmatched`;
  const headline = `Sidelined with injury ${run}`;
  await plantItem({
    slug,
    name: published,
    headline,
    applied: false,
  });

  await signIn(context, commissioner);

  // The board shows it, and says plainly that it belongs to nobody yet.
  await page.goto("/players/news");
  await expect(itemRow(page, headline)).toContainText("unmatched");

  // The question itself is asked where the other two identity questions are.
  await page.goto("/players/mapping");
  const row = page.getByTestId(`news-name-${slug}`);
  await expect(row).toBeVisible();
  await expect(row).toContainText(published);

  await row.getByTestId(`news-choice-${slug}`).selectOption(player.id);
  await row.getByTestId(`news-attach-${slug}`).click();

  await expect(page.getByTestId("mapping-done")).toContainText(player.name, {
    timeout: 20_000,
  });
  // Answered questions leave the list — the same rule the other two halves
  // follow, and the reason this surface is worth opening at all.
  await expect(page.getByTestId(`news-name-${slug}`)).toHaveCount(0);

  const pb = await superuser();
  const rows = await pb
    .collection("player_news")
    .getFullList({ filter: `slug = '${slug}'`, requestKey: null });
  expect(rows[0].player).toBe(player.id);
  // Mapping a name says who somebody is, never that they are hurt: the item
  // stays unapplied so the next pass decides that under its own rules.
  expect(rows[0].applied).toBe(false);
});

test("a member who runs no league reads the news but cannot correct it", async ({
  page,
  context,
}) => {
  const commissioner = await createTestUser("news-owner");
  const bystander = await createTestUser("news-bystander");
  await createLeagueFor(commissioner, "Read Only League");
  const player = await createPlayer("Watched", { status: "injured" });
  const headline = `Bothered by back problem ${run}`;
  await plantItem({
    slug: `${run}-watched`,
    name: player.name,
    playerId: player.id,
    headline,
  });

  await signIn(context, bystander);
  await page.goto("/players/news");

  await expect(itemRow(page, headline)).toBeVisible();
  // Reading is everybody's; the two corrections are the commissioner's.
  await expect(page.getByTestId("news-flagged")).toHaveCount(0);
  await expect(page.getByTestId("news-refresh")).toHaveCount(0);
  await expect(page.getByTestId(`mark-fit-${player.id}`)).toHaveCount(0);
});
