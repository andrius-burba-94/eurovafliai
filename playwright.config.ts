import { defineConfig, devices } from "@playwright/test";

const PORT = 3007;
const BASE_URL = `http://127.0.0.1:${PORT}`;

// E2E is local-first: it boots the Next dev server itself and reuses one that
// is already running. PocketBase is NOT started here — specs that need data
// come later (Phase 1+) and will document their own setup.
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
    command: "npm run dev:next",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
