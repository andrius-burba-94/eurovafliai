import type { Page } from "@playwright/test";

/**
 * Cut a page off from realtime, so it can go stale on purpose.
 *
 * Both live surfaces subscribe over SSE and correct themselves, which means a
 * tab can no longer be *made* stale by changing the world behind it. Several
 * specs need one anyway, because the server-side refusals are the rule and the
 * disappearing button is only a courtesy: a phone that has lost its connection,
 * or a crafted request, must still be refused.
 *
 * Blocking the SSE endpoint is the honest way to stage that, and Playwright
 * really does intercept an `EventSource` — checked, because the alternative
 * would have been a spec that quietly proved nothing.
 *
 * Two things to know when using it:
 *
 * - **Arm it, then reload.** A stream that is already open stays open; the
 *   block only bites on the next connection attempt. And wait for the page you
 *   mean to reload to be *there* first, or you will reload the one before it.
 * - **Not before a lobby.** `LiveLobby` seeds its list into `useState` once and
 *   relies on its own subscription for everything after, so a lobby with no
 *   realtime never shows the rolled order and never offers the start button.
 */
export async function withoutRealtime(page: Page): Promise<void> {
  await page.route("**/api/realtime**", (route) => route.abort());
}
