import { expect, test } from "@playwright/test";

import { cleanupTestData, createTestUser, signIn } from "./helpers/session";

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
  expect(html).toContain("League, Drafts and EuroLeague");
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

const colorScheme = (page: import("@playwright/test").Page) =>
  page.locator("html").evaluate((el) => getComputedStyle(el).colorScheme);

test("with no choice stored, the ground follows the device", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/login");
  await expect.poll(() => colorScheme(page)).toBe("dark");
  await expect.poll(() => groundLuminance(page)).toBeLessThan(0.05);

  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(() => colorScheme(page)).toBe("light");
  await expect.poll(() => groundLuminance(page)).toBeGreaterThan(0.8);
});

test("a held ground survives a reload and ignores the device", async ({ page, context }) => {
  const user = await createTestUser("theme");
  await signIn(context, user);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");

  // From `lg` the sidebar's one button opens System, Light and Dark upward;
  // below it the More sheet spells the three out. Each waits for the hydrated
  // choice.
  const sidebar = await page.getByTestId("theme-switch").isVisible();
  const choose = async (choice: "system" | "light" | "dark") => {
    if (sidebar) {
      await page.getByTestId("theme-switch-button").click();
      await expect(page.getByTestId("theme-switch-button-panel")).toBeVisible();
      await page.getByTestId(`theme-switch-${choice}`).click();
      await expect(page.getByTestId("theme-switch-button-panel")).toBeHidden();
      await expect(page.getByTestId("theme-switch")).toHaveAttribute("data-choice", choice);
    } else {
      await page.getByTestId("more-menu").click();
      await page.getByTestId(`theme-switch-more-${choice}`).check({ force: true });
      await expect(page.getByTestId("theme-switch-more")).toHaveAttribute("data-choice", choice);
    }
  };
  const settled = async (choice: string) =>
    sidebar
      ? expect(page.getByTestId("theme-switch")).toHaveAttribute("data-choice", choice)
      : undefined;

  await settled("system");
  await choose("light");
  await expect.poll(() => colorScheme(page)).toBe("light");

  // Painted light before any script of ours hydrates: the head script read the cookie.
  await page.reload();
  expect(await page.locator("html").getAttribute("data-theme")).toBe("light");
  await expect.poll(() => groundLuminance(page)).toBeGreaterThan(0.8);

  await page.emulateMedia({ colorScheme: "light" });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(() => colorScheme(page)).toBe("light");

  await settled("light");
  await choose("system");
  await expect.poll(() => colorScheme(page)).toBe("dark");
});

test("the welcome headline uses the quieter display face", async ({ page }) => {
  await page.goto("/login");
  const family = await page.locator("h1").first().evaluate((el) => getComputedStyle(el).fontFamily);
  expect(family).toContain("Space Grotesk");
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

test.afterAll(async () => {
  await cleanupTestData();
});
