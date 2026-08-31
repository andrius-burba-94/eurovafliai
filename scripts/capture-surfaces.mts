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

  // A lobby with one member reads as a bug rather than as a design; seed a
  // couple more so the empty bays and the taken ones are both on screen.
  for (const label of ["Gintaras", "Motiejus"]) {
    const member = await createTestUser(label);
    const { default: PocketBase } = await import("pocketbase");
    const { parseServerEnv } = await import("../src/lib/config/schema");
    const env = parseServerEnv(process.env);
    const pb = new PocketBase(env.PB_INTERNAL_URL);
    await pb
      .collection("_superusers")
      .authWithPassword(env.PB_SUPERUSER_EMAIL, env.PB_SUPERUSER_PASSWORD);
    await pb.collection("league_members").create(
      { league: league.id, user: member.id, team_name: `${label} Ballers` },
      { requestKey: null },
    );
  }

  const surfaces = [
    { name: "login", path: "/login", signedIn: false },
    { name: "home", path: "/", signedIn: true },
    { name: "lobby", path: `/leagues/${league.id}`, signedIn: true },
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
