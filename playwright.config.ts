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
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: process.env.CI ? `next start -p ${PORT}` : `next dev -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
