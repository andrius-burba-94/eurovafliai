import { expect, type Page } from "@playwright/test";

/**
 * Routes behind a `loading.tsx` stream, so by the time `notFound()` is reached
 * the 200 and the shell have already gone out and the not-found page arrives in
 * the stream. The status is therefore not the fact to assert — the rendered
 * outcome is, and it is the same for a thing that does not exist and one that
 * is not yours, which is the property every caller here cares about.
 */
export async function expectNotFound(page: Page) {
  await expect(page.getByTestId("not-found")).toBeVisible();
  await expect(page.getByTestId("not-found-home")).toBeVisible();
}
