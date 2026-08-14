import { defineConfig } from "vitest/config";

// Unit tests only. `tests/e2e/**` is Playwright's territory and MUST stay
// excluded here — Vitest and Playwright both glob `*.spec.ts`, and letting
// Vitest pick up an E2E spec produces a confusing "test.describe is not a
// function" failure rather than a useful error.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts"],
    exclude: ["tests/e2e/**", "node_modules/**", ".next/**"],
  },
});
