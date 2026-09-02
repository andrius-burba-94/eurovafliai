import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Unit tests only. `tests/e2e/**` is Playwright's territory and MUST stay
// excluded here — Vitest and Playwright both glob `*.spec.ts`, and letting
// Vitest pick up an E2E spec produces a confusing "test.describe is not a
// function" failure rather than a useful error.
export default defineConfig({
  // `@/…` is resolved by Next from tsconfig `paths`, and by tsx and Playwright
  // the same way. Vitest reads none of that, so a test that imports a module
  // which imports `@/lib/engine` fails with "cannot find package" — pointing at
  // the test rather than at the missing alias, which is a confusing five
  // minutes. The engine's own tests use relative paths and never needed this;
  // the worker's do, because the worker is wired through the app's modules.
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts"],
    exclude: ["tests/e2e/**", "node_modules/**", ".next/**"],
  },
});
