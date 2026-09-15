import { expect, test, type Page } from "@playwright/test";

import { cleanupTestData, createTestUser, signIn } from "./helpers/session";

/**
 * The night board — slice 9.5.
 *
 * Every *ratio* is measured in `src/app/tokens.test.ts`, on both grounds, and
 * none of that is repeated here. What a browser is needed for is the part
 * arithmetic cannot see: that the second palette is actually in force, that it
 * reaches a page before it is painted rather than after, and that the system
 * preference decides until somebody says otherwise.
 */

/**
 * How light the ground is, 0–100.
 *
 * Read from the computed value of `--color-stock`, which comes back as
 * `lab(93.39% …)` rather than the `oklch()` that was authored — Chromium
 * normalizes wide-gamut colours on the way out. So the number is parsed rather
 * than the string compared: what these specs assert is *which* ground is in
 * force, and a day board at 93 against a night board at 12 says that without
 * pinning the assertion to a colour syntax we do not control.
 */
async function groundLightness(page: Page): Promise<number> {
  const value = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--color-stock")
      .trim(),
  );
  const parsed = /^\w+\(\s*([\d.]+)/.exec(value);
  expect(parsed, `could not read a lightness from "${value}"`).not.toBeNull();
  return Number(parsed![1]);
}

const DAY = 80;
const NIGHT = 30;

test.afterAll(async () => {
  await cleanupTestData();
});

test("the system preference decides before anybody has chosen", async ({
  browser,
}) => {
  const dark = await browser.newContext({ colorScheme: "dark" });
  const light = await browser.newContext({ colorScheme: "light" });
  const onDark = await dark.newPage();
  const onLight = await light.newPage();

  await onDark.goto("/login");
  await onLight.goto("/login");

  // No JavaScript ran to decide this — it is the stylesheet's media query, so
  // a reader with scripts off gets the ground their phone asked for.
  expect(await groundLightness(onDark)).toBeLessThan(NIGHT);
  expect(await groundLightness(onLight)).toBeGreaterThan(DAY);
  await expect(onDark.getByTestId("theme-control")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(onLight.getByTestId("theme-control")).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  await dark.close();
  await light.close();
});

test("choosing the night board holds across a navigation, and arrives before the paint", async ({
  page,
  context,
}) => {
  const user = await createTestUser("night-owl");
  await signIn(context, user);

  await page.goto("/players");
  // The control is the only thing on this page that needs JavaScript, and a
  // tap it swallows is a tap nobody repeats. In dev the pool's payload is
  // ~1,000 players, so waiting for the network to settle is waiting for
  // hydration — measured: the same click one second earlier does nothing.
  await page.waitForLoadState("networkidle");
  expect(await groundLightness(page)).toBeGreaterThan(DAY);

  await page.getByTestId("theme-control").click();
  await expect(page.getByTestId("theme-control")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(await groundLightness(page)).toBeLessThan(NIGHT);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  // The attribute is on `<html>` from the first byte the browser parses, not
  // applied by an effect afterwards — the difference between a dark page and a
  // dark page that flashes white at somebody in a dark room.
  const html = await page.evaluate(async () => {
    const response = await fetch("/players");
    return response.text();
  });
  expect(html).toContain("localStorage.getItem");

  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await groundLightness(page)).toBeLessThan(NIGHT);
  // And the rail carries the switch on every surface, which is why it lives
  // there rather than in each page's own action slot.
  await expect(page.getByTestId("theme-control")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("choosing what the system already wants stops overriding it", async ({
  browser,
}) => {
  const context = await browser.newContext({ colorScheme: "dark" });
  const page = await context.newPage();
  await page.goto("/login");
  await page.waitForLoadState("networkidle");

  // Day, against a night phone: an override, and it is stored.
  await page.getByTestId("theme-control").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(
    await page.evaluate(() => localStorage.getItem("eurovafliai-theme")),
  ).toBe("day");

  // Back to night — which is what the phone asked for, so nothing is stored
  // and the page follows the system again rather than being pinned to it.
  await page.getByTestId("theme-control").click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", "light");
  expect(
    await page.evaluate(() => localStorage.getItem("eurovafliai-theme")),
  ).toBeNull();
  expect(await groundLightness(page)).toBeLessThan(NIGHT);

  await context.close();
});

test("the board keeps its materials on the night ground", async ({
  browser,
}) => {
  const context = await browser.newContext({ colorScheme: "dark" });
  const page = await context.newPage();
  const user = await createTestUser("night-board");
  await signIn(context, user);
  await page.goto("/");

  // Nothing floats and nothing glows, on either ground — D17's refusal is not
  // suspended by the lamp being off.
  const decorated = await page.evaluate(() =>
    [...document.querySelectorAll("*")].filter((node) => {
      const style = getComputedStyle(node);
      return style.boxShadow !== "none" || style.textShadow !== "none";
    }).length,
  );
  expect(decorated).toBe(0);

  await context.close();
});
