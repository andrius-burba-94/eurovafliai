import { defineConfig, devices } from "@playwright/test";

// 3007 by default — the app's canonical dev port. Overridable because
// `reuseExistingServer` will happily reuse a dev server started from a
// *different checkout* of this repo: run the suite from a git worktree while
// `npm run dev` is up in the main one and every spec silently tests the other
// working copy's code. Passing `E2E_PORT` gives the worktree its own server.
const PORT = Number(process.env.E2E_PORT ?? 3007);
// `localhost`, not 127.0.0.1: this is the app's canonical dev origin, the one
// registered as an OAuth redirect URI on the Google client. Browsing the other
// form would set auth cookies on a domain the real flow never uses.
const BASE_URL = `http://localhost:${PORT}`;

// Most specs prove server behaviour, and running them again on a Pixel 7
// doubled the suite without exercising anything new. Pull requests set
// `E2E_MOBILE_SCOPE=layout` and run only the specs where a phone renders
// differently (tab bar, More, the panel sheet, touch, the draft room at phone
// width). Pushes to main run every spec on both projects. A new spec that
// branches on `isMobile` or the project name belongs in this list.
const MOBILE_SCOPE = process.env.E2E_MOBILE_SCOPE ?? "all";
const MOBILE_LAYOUT_SPECS = [
  "a11y.spec.ts",
  "cheat-sheet.spec.ts",
  "design.spec.ts",
  "draft-board.spec.ts",
  "lineup.spec.ts",
  "matchday.spec.ts",
  "panel.spec.ts",
  "season-dashboard.spec.ts",
  "shell.spec.ts",
  "welcome.spec.ts",
].map((spec) => `**/${spec}`);

// Locally the suite boots the Next dev server itself, or reuses one that is
// already running. In CI it runs against `next start` over a build the job has
// just made: a cold dev server compiles each route on first visit, which on a
// two-core runner is slow enough to eat a spec's whole timeout and blame the
// spec. PocketBase is not started here — `npm run dev` does locally, and the
// CI job boots the pinned binary itself (see .github/workflows/ci.yml).
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Playwright's default is half the cores. The specs spend most of their time
  // waiting on the server, so one more worker than that is nearly free.
  workers: process.env.CI ? 3 : undefined,
  reporter: process.env.CI ? [["html"], ["list"]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    // Draft night is phones on a couch, and the draft room animates. Every spec
    // runs with motion off so assertions never race a transition. This lives
    // under `contextOptions` — there is no top-level `reducedMotion` in `use`.
    contextOptions: { reducedMotion: "reduce" },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      testMatch: MOBILE_SCOPE === "layout" ? MOBILE_LAYOUT_SPECS : undefined,
    },
  ],
  // Sweep leftovers before the suite and after it. The `afterEach` helper
  // cleans the run it belongs to; these two clean the runs that never got to
  // one — see `tests/e2e/helpers/sweep.ts`.
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",

  webServer: {
    command: process.env.CI ? `next start -p ${PORT}` : `next dev -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
