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

import { chromium, devices } from "playwright";

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

  const surfaces = [
    { name: "login", path: "/login", signedIn: false },
    { name: "home", path: "/", signedIn: true },
    { name: "lobby", path: `/leagues/${league.id}`, signedIn: true },
    { name: "players", path: "/players", signedIn: true },
    { name: "draft", path: `/leagues/${league.id}/draft`, signedIn: true },
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
