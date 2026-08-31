import { expect, test } from "@playwright/test";

/**
 * The design foundation's own guards.
 *
 * Both of these protect against a failure that is invisible in review: the
 * page looks right, and something load-bearing has silently gone.
 */

test("the direction contract survives into the emitted markup", async ({
  page,
}) => {
  // It shipped as a JSX comment first, which is a JavaScript comment: it
  // reached a sourcemap and nothing else. A contract the build erases is a
  // contract nobody can audit, so this asserts on the served HTML.
  await page.goto("/login");
  const html = await page.content();
  expect(html).toContain("DIRECTION CONTRACT");
  expect(html).toContain("seed 32792572");
  expect(html).toContain("FINISH: unreviewed and undocumented is unfinished");
});

test("the board's own font is the one actually rendering", async ({ page }) => {
  // Issue #7 was exactly this: a webfont downloaded on every cold load while
  // the body rendered in Arial, because `body` hardcoded a stack that
  // overrode the token. Assert the computed family, not the token.
  await page.goto("/login");
  const family = await page
    .locator("body")
    .evaluate((el) => getComputedStyle(el).fontFamily);
  expect(family).toContain("Archivo");
  expect(family).not.toContain("Arial");
});
