import { expect, test } from "@playwright/test";

test("welcome page explains the product and loads the right artwork", async ({ page, isMobile }) => {
  await page.goto("/login");

  await expect(page).toHaveTitle("EuroLeague Fantasy Draft | Eurovafliai");
  await expect(page.getByRole("heading", { name: /EuroLeague\s*Fantasy Draft/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible();

  const art = page.locator(".welcome-art img");
  await expect.poll(() => art.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  const source = await art.evaluate((img: HTMLImageElement) => img.currentSrc);
  expect(source).toContain(isMobile ? "welcome-draft-board-mobile.webp" : "welcome-draft-board-wide.webp");

  if (isMobile) {
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeInViewport();
  }
});

test("numbered bubbles select the three steps with the keyboard", async ({ page }) => {
  await page.goto("/login");
  const panel = page.getByTestId("welcome-feature-panel");
  await expect(panel).toContainText("Create a league");
  await expect(panel).toContainText("Set up your league and share its invite code with friends.");

  const second = page.getByTestId("welcome-bubble-2");
  await second.focus();
  await page.keyboard.press("Enter");
  await expect(second).toHaveAttribute("aria-pressed", "true");
  await expect(panel).toContainText("Draft live");
  await expect(panel).toContainText("Make your picks together as the board updates for everyone.");
  await expect(page.getByTestId("welcome-rotation")).toHaveText("Play");
  await expect(panel).toHaveAttribute("aria-live", "polite");

  const third = page.getByTestId("welcome-bubble-3");
  await third.focus();
  await page.keyboard.press("Space");
  await expect(third).toHaveAttribute("aria-pressed", "true");
  await expect(panel).toContainText("Follow the season");
  await expect(panel).toContainText("See fantasy points and standings throughout the EuroLeague season.");
});

test("reduced motion starts paused and Play resumes rotation", async ({ page }) => {
  await page.goto("/login");
  const rotation = page.getByTestId("welcome-rotation");
  await expect(rotation).toHaveText("Play");
  await rotation.click();
  await expect(rotation).toHaveText("Pause");
  await expect(page.getByTestId("welcome-feature-panel")).toHaveAttribute("aria-live", "off");
  await rotation.click();
  await expect(rotation).toHaveText("Play");
});

test("automatic pages advance every seven seconds while visible and can be paused", async ({ page, isMobile }) => {
  test.skip(isMobile, "Desktop viewport keeps the section visible without pointer hover during scroll");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/login");
  await page.evaluate(() => window.scrollTo(0, 200));
  const panel = page.getByTestId("welcome-feature-panel");
  const rotation = page.getByTestId("welcome-rotation");
  await expect(rotation).toHaveText("Pause");
  await expect(panel).toContainText("Create a league");
  await expect(panel).toContainText("Draft live", { timeout: 9_000 });

  await rotation.hover();
  await expect(rotation).toHaveText("Play");
  await expect(panel).toContainText("Draft live");
  await expect(panel).toHaveAttribute("aria-live", "polite");
  await rotation.click();
  await expect(rotation).toHaveText("Pause");
  await page.getByTestId("welcome-bubble-3").focus();
  await expect(rotation).toHaveText("Play");
});
