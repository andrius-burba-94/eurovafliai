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

test("the ground is the midnight board, from CSS rather than from a script", async ({
  page,
}) => {
  // Phase 10 removed the second ground, the `<head>` override script and the
  // rail's switch. The thing worth asserting is not the hex — `tokens.test.ts`
  // owns every ratio — but that the dark ground arrives *without* JavaScript
  // and without a stored preference, which is what the deleted script used to
  // guarantee and what a regression here would silently undo.
  await page.goto("/login");

  const scheme = await page
    .locator("html")
    .evaluate((el) => getComputedStyle(el).colorScheme);
  expect(scheme).toBe("dark");

  // The ground is dark. Parsed rather than string-matched, because the token is
  // OKLCH and the browser reports whatever space it resolved to.
  const luminance = await page.locator("body").evaluate((el) => {
    const [r, g, b] = getComputedStyle(el)
      .backgroundColor.match(/[\d.]+/g)!
      .slice(0, 3)
      .map((v) => {
        const c = Number(v) / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  });
  expect(luminance).toBeLessThan(0.05);

  // And nothing is left that could switch it.
  await expect(page.getByTestId("theme-control")).toHaveCount(0);
});

test("the board's own font is the one actually rendering", async ({ page }) => {
  // Issue #7 was exactly this: a webfont downloaded on every cold load while
  // the body rendered in Arial, because `body` hardcoded a stack that
  // overrode the token. Assert the computed family, not the token.
  await page.goto("/login");
  const family = await page
    .locator("body")
    .evaluate((el) => getComputedStyle(el).fontFamily);
  expect(family).toContain("Space Grotesk");
  expect(family).not.toContain("Arial");
});

test("a figure in a column renders in the mono face, and prose does not", async ({
  page,
}) => {
  // 10.3's whole boundary in one assertion, in the browser, because the failure
  // is invisible in review either way round: a `stat` cell that silently fell
  // back to the sans face looks fine, and a sentence that picked up the mono
  // face looks like a bug nobody can name.
  await page.goto("/login");

  const both = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.innerHTML = `<span class="stat" id="p-stat">22.1</span><span id="p-prose">prose</span>`;
    document.body.append(probe);
    const read = (id: string) =>
      getComputedStyle(document.getElementById(id)!).fontFamily;
    const result = { stat: read("p-stat"), prose: read("p-prose") };
    probe.remove();
    return result;
  });

  expect(both.stat).toContain("JetBrains Mono");
  expect(both.prose).toContain("Space Grotesk");
  expect(both.prose).not.toContain("JetBrains Mono");
});
