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
  expect(html).toContain("matchnight broadcast, ADR-0011");
  expect(html).toContain("League, Drafts, EuroLeague and Manage");
  expect(html).toMatch(/Finished-game\s+standings are authoritative/);
});

/**
 * Relative luminance of the body's computed background. Read through a canvas
 * pixel, because the browser reports an OKLCH token as `lab(...)` and parsing
 * those numbers as RGB measures the wrong thing.
 */
async function groundLuminance(page: import("@playwright/test").Page) {
  return page.locator("body").evaluate((el) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d")!;
    context.fillStyle = getComputedStyle(el).backgroundColor;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b] = Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3)).map((v) => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  });
}

test("the ground follows the device, from CSS alone", async ({ page }) => {
  // ADR-0011 ships two grounds and no switch: the phone's own setting decides.
  // The thing worth asserting is that each arrives without JavaScript or a
  // stored preference, and that nothing is left that could override it.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/login");
  expect(await page.locator("html").evaluate((el) => getComputedStyle(el).colorScheme)).toBe("dark");
  await expect.poll(() => groundLuminance(page)).toBeLessThan(0.05);

  await page.emulateMedia({ colorScheme: "light" });
  expect(await page.locator("html").evaluate((el) => getComputedStyle(el).colorScheme)).toBe("light");
  await expect.poll(() => groundLuminance(page)).toBeGreaterThan(0.8);

  await expect(page.getByTestId("theme-control")).toHaveCount(0);
});

test("headlines are set in the broadcast face", async ({ page }) => {
  await page.goto("/login");
  const family = await page.locator("h1").first().evaluate((el) => getComputedStyle(el).fontFamily);
  expect(family).toContain("Barlow Condensed");
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
