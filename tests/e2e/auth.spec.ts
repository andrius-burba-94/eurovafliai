import { expect, test } from "@playwright/test";

/**
 * The auth surfaces, as far as they can be exercised without Google.
 *
 * Completing a real Google sign-in is deliberately out of scope: it needs
 * somebody's actual Google account, and automating a third-party login is both
 * fragile and a bad idea. What is covered here is every path on our side of the
 * redirect — protection, the login page, and each way the callback can fail.
 */

test("an anonymous visitor is sent to the login page", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login\?error=unauthorized/);
  await expect(page.getByTestId("login")).toBeVisible();
});

test("the login page offers Google and nothing else", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByTestId("login-google")).toBeVisible();
  // No password form: Google is the only way in, by design.
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});

test("the login button starts the Google handshake", async ({ page, request }) => {
  // Needs a configured Google provider, which needs real credentials. Skip
  // rather than fail where they are absent (CI, a fresh checkout).
  const methods = await request
    .get("http://127.0.0.1:8095/api/collections/users/auth-methods")
    .then((r) => r.json())
    .catch(() => null);
  test.skip(
    !methods?.oauth2?.providers?.some(
      (p: { name: string }) => p.name === "google",
    ),
    "Google provider not configured on this PocketBase",
  );

  await page.goto("/login");
  await page.getByTestId("login-google").click();

  await page.waitForURL(/accounts\.google\.com/);
  const url = new URL(page.url());
  const params = url.searchParams;

  // The redirect URI must be the `localhost` form: Google treats 127.0.0.1 as a
  // different URI and only this one is registered on the client.
  expect(params.get("redirect_uri")).toBe(
    "http://localhost:3007/auth/callback",
  );
  expect(params.get("code_challenge_method")).toBe("S256");
  expect(params.get("code_challenge")).toBeTruthy();
  expect(params.get("state")).toBeTruthy();
});

test("the callback refuses a request with no code", async ({ page }) => {
  await page.goto("/auth/callback");
  await expect(page).toHaveURL(/\/login\?error=missing_code/);
  await expect(page.getByTestId("login-error")).toBeVisible();
});

test("the callback refuses a forged state", async ({ page }) => {
  // No handshake cookie exists, so any state is a mismatch — which is exactly
  // what an unsolicited callback looks like.
  await page.goto("/auth/callback?code=whatever&state=forged");
  await expect(page).toHaveURL(/\/login\?error=state_mismatch/);
  await expect(page.getByTestId("login-error")).toContainText(
    "did not start here",
  );
});

test("a forged session cookie does not get you in", async ({ page, context }) => {
  // The proxy only checks that a cookie exists; getSession is what verifies it.
  // This is the test that the second layer is actually doing its job.
  await context.addCookies([
    {
      name: "eurovafliai_session",
      value: "not-a-real-token",
      domain: "localhost",
      path: "/",
    },
  ]);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});
