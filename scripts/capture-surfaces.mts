/**
 * Capture every signed-in surface at the sizes we ship, into
 * `.impeccable/review/`, for a design review.
 *
 * Sessions come from the E2E helpers, so the screenshots are of the real app
 * with a real PocketBase token — not a storybook or a mock. Entrance motion is
 * disabled through `prefers-reduced-motion`, because an element still mid-
 * animation photographs as a missing element and gets "fixed" into a regression.
 *
 *   npm run capture          # with `npm run dev` already running
 *
 * Local only, and it cleans up the users and leagues it creates.
 */
import { mkdirSync } from "node:fs";

import { chromium, devices, expect, type Page } from "@playwright/test";

import {
  cleanupTestData,
  createLeagueFor,
  createTestUser,
  signIn,
} from "../tests/e2e/helpers/session";

const BASE = "http://localhost:3007";
const OUT = ".impeccable/review";

const VIEWPORTS = [
  { name: "desktop", viewport: { width: 1440, height: 900 } },
  { name: "mobile", ...devices["Pixel 7"] },
] as const;

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

try {
  const commissioner = await createTestUser("Rimas");
  const league = await createLeagueFor(commissioner, "Vafliai 2027");

  const { default: PocketBase } = await import("pocketbase");
  const { parseServerEnv } = await import("../src/lib/config/schema");
  const env = parseServerEnv(process.env);
  const pb = new PocketBase(env.PB_INTERNAL_URL);
  await pb
    .collection("_superusers")
    .authWithPassword(env.PB_SUPERUSER_EMAIL, env.PB_SUPERUSER_PASSWORD);

  // A lobby with one member reads as a bug rather than as a design; seed a
  // couple more so the empty bays and the taken ones are both on screen.
  for (const label of ["Gintaras", "Motiejus"]) {
    const member = await createTestUser(label);
    await pb
      .collection("league_members")
      .create(
        { league: league.id, user: member.id, team_name: `${label} Ballers` },
        { requestKey: null },
      );
  }

  /**
   * The draft room, mid-draft and on the clock.
   *
   * Planted rather than clicked: the room only looks like itself with a live
   * draft, a running deadline and a board that has something on it, and none of
   * that survives a screenshot script politely using the UI. Two minutes on the
   * clock so the countdown photographs mid-run rather than at "Time's up".
   */
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
      rounds: 13,
      current_pick: 1,
      pick_seconds: 120,
      deadline: new Date(Date.now() + 118_000).toISOString().replace("T", " "),
      seed: "capture",
    },
    { requestKey: null },
  );
  await pb
    .collection("leagues")
    .update(league.id, { status: "drafting" }, { requestKey: null });

  // One pick on the board, so the run of slots photographs as a board rather
  // than as an empty state. Skipped when this checkout has never run
  // `npm run rosters:sync` — an empty pool is a real surface too.
  const [topOfPool] = await pb.collection("players").getFullList({
    filter: "status != 'left'",
    sort: "name",
    requestKey: null,
  });
  if (topOfPool) {
    await pb.collection("picks").create(
      {
        draft: draft.id,
        overall_no: 1,
        round: 1,
        slot: 1,
        member: members[0].id,
        player: topOfPool.id,
        is_auto: false,
      },
      { requestKey: null },
    );
    await pb
      .collection("drafts")
      .update(draft.id, { current_pick: 2 }, { requestKey: null });
  }

  /**
   * A cheat sheet for the commissioner — slice 3.4.
   *
   * Fourteen real players across three tiers, so the sheet photographs as a
   * sheet (tier runs, two-digit ranks) and the room photographs with its
   * pinned shortlist and its `#rank` marks rather than without them. Planted
   * through the same `saveSheet` the server action uses, so what is on screen
   * is what the app would have written.
   */
  const sheetPlayers = await pb.collection("players").getFullList({
    filter: "status != 'left'",
    sort: "name",
    requestKey: null,
  });
  const rankedFor = sheetPlayers
    .filter((player) => player.id !== topOfPool?.id)
    .slice(0, 14)
    .map((player) => player.id);

  const { saveSheet } = await import("../src/lib/sheets/store");
  await saveSheet(
    pb,
    members[0].id,
    { ranking: rankedFor, tiers: [4, 9] },
    "csv",
  );

  /**
   * A second league with no sheet in it, so the empty state is photographed
   * from the real route rather than staged by deleting one. A member who has
   * never written a sheet is the common case on the night before a draft.
   */
  const otherLeague = await createLeagueFor(commissioner, "Vafliai Reserves");

  const surfaces: {
    name: string;
    path: string;
    signedIn: boolean;
    /** Drive the page into the state worth photographing. */
    before?: (page: Page) => Promise<void>;
    /**
     * One assertion about the picture's own content, before the shutter.
     *
     * Not optional and not ceremony. A script that drives a surface and then
     * screenshots it can fail half way and still produce a plausible image:
     * two identical pictures once went to a design review as "the radar at 20
     * picks and at 60 picks", and both were the radar at one pick. The
     * reviewer caught it. One `expect` on a rendered count or string is the
     * whole fix, and it is cheaper than the review it protects.
     */
    assert: (page: Page) => Promise<void>;
  }[] = [
    {
      name: "login",
      path: "/login",
      signedIn: false,
      assert: async (page) => {
        await expect(
          page.getByRole("button", { name: /google/i }),
        ).toBeVisible();
      },
    },
    {
      name: "home",
      path: "/",
      signedIn: true,
      assert: async (page) => {
        await expect(page.getByText("Vafliai 2027")).toBeVisible();
      },
    },
    {
      name: "lobby",
      path: `/leagues/${league.id}`,
      signedIn: true,
      assert: async (page) => {
        await expect(page.getByTestId("lobby-sheet")).toBeVisible();
      },
    },
    {
      name: "players",
      path: "/players",
      signedIn: true,
      assert: async (page) => {
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      },
    },
    {
      name: "draft",
      path: `/leagues/${league.id}/draft`,
      signedIn: true,
      assert: async (page) => {
        // The room at rest *with* a sheet: the pool is in the sheet's order,
        // eight rows deep, each carrying its place — and the pinned block is
        // deliberately absent, because at rest it would be these same rows
        // again. All four are things 3.4a decided and all four would be
        // silently wrong in a picture that merely looked like a draft room.
        await expect(page.getByTestId("pool-row")).toHaveCount(8);
        await expect(
          page.getByTestId("pool-row").first().getByTestId("pool-sheet-rank"),
        ).toHaveText("#1");
        await expect(page.getByTestId("sheet-pinned")).toHaveCount(0);
        await expect(page.getByTestId("edit-sheet")).toBeVisible();
      },
    },
    {
      name: "draft-pinned",
      path: `/leagues/${league.id}/draft`,
      signedIn: true,
      before: async (page) => {
        // Narrowed, which is the only state the pinned shortlist is drawn in.
        await page.getByTestId("filter-position-G").click();
      },
      assert: async (page) => {
        await expect(page.getByTestId("sheet-pinned-row")).toHaveCount(3);
      },
    },
    {
      name: "sheet",
      path: `/leagues/${league.id}/sheet`,
      signedIn: true,
      assert: async (page) => {
        // Three tier runs, fourteen rows, and the ranks reaching two digits —
        // the density the surface actually has to survive.
        await expect(page.getByTestId("sheet-row")).toHaveCount(14);
        await expect(page.getByTestId("sheet-tier-3")).toBeVisible();
        await expect(page.getByTestId("sheet-row").nth(13)).toContainText("14");
      },
    },
    {
      name: "sheet-plan",
      path: `/leagues/${league.id}/sheet`,
      signedIn: true,
      before: async (page) => {
        // A paste with one line of each outcome: two that resolve, one the
        // pool has never heard of. The confirm step and the left-out run are
        // the halves of this surface a saved sheet never shows.
        await page
          .getByTestId("sheet-input")
          .fill(
            `1,1,${sheetPlayers[3]?.name}\n2,1,${sheetPlayers[4]?.name}\n3,2,Zdenek Vopicka`,
          );
        await page.getByTestId("sheet-preview").click();
        await page.getByTestId("sheet-apply").waitFor();
      },
      assert: async (page) => {
        await expect(page.getByTestId("sheet-resolved")).toBeVisible();
        await expect(page.getByTestId("sheet-unresolved")).toContainText(
          "Zdenek Vopicka",
        );
      },
    },
    {
      name: "sheet-empty",
      path: `/leagues/${otherLeague.id}/sheet`,
      signedIn: true,
      assert: async (page) => {
        await expect(page.getByTestId("sheet-row")).toHaveCount(0);
        await expect(page.getByText("not ranked anybody")).toBeVisible();
      },
    },
  ];

  for (const { name: sizeName, ...device } of VIEWPORTS) {
    for (const surface of surfaces) {
      const context = await browser.newContext({
        ...device,
        reducedMotion: "reduce",
      });
      if (surface.signedIn) await signIn(context, commissioner);

      const page = await context.newPage();
      await page.goto(`${BASE}${surface.path}`, { waitUntil: "networkidle" });
      // Next's dev-tools bubble sits over the bottom-left corner and is not
      // part of the design; a reviewer should not have to discount it. After
      // the navigation, not before: a style tag belongs to one document.
      await page
        .addStyleTag({ content: "nextjs-portal{display:none!important}" })
        .catch(() => {});
      await surface.before?.(page);
      await surface.assert(page);
      // Fonts settle after networkidle often enough to photograph a fallback.
      await page.evaluate(() => document.fonts.ready);
      const file = `${OUT}/${sizeName}-${surface.name}.png`;
      await page.screenshot({ path: file, fullPage: true });
      console.log(`captured ${file}`);
      await context.close();
    }
  }
} finally {
  await browser.close();
  await cleanupTestData();
}
