/**
 * Reading RotoWire's Euroleague pages — slice 9.4.
 *
 * Pure apart from one injected `fetch`: `parseRotowire` takes HTML and returns
 * rows, so every rule below is tested against saved markup rather than against
 * the live site.
 *
 * ## Why HTML at all, when D5 says no scraping
 *
 * D5 refused scraping for **stats**, and that refusal still holds — the
 * official feed serves box scores, and a parsed table would be a second,
 * worse answer to a question already answered well. Availability is a
 * different question with no official answer: `/injuries` and `/news` both 404
 * on api-live, and RotoWire publishes no Euroleague RSS (`sport=EURO` answers
 * 200 with an empty body; the NBA feed works). See ADR-0007.
 *
 * ## What the markup gives us, verified 2026-09-14
 *
 * Both views are server-rendered and use one block shape:
 *
 * ```html
 * <div class="news-update is-injured">
 *   <div class="news-update__top">
 *     <div class="news-update__playerhead">
 *       <a class="news-update__player-link" href="/euro/player/isaia-cordinier-1103">Isaia Cordinier</a>
 *       <div class="news-update__headline">Continues to recover</div>
 *   <div class="news-update__meta"><div><b class="news-update__pos">G</b>Anadolu Efes Istanbul</div>
 *     <div class="news-update__inj">Knee</div></div>
 *   <div class="news-update__main"><div class="news-update__timestamp">August 6, 2026</div>
 *     <div class="news-update__news">…prose…</div>
 * ```
 *
 * Two facts about the pages that shaped the design:
 *
 * - **Each view returns exactly 25 items** — the latest updates, not a census.
 *   So a player's *absence* from the injuries view proves nothing, and nothing
 *   here ever heals anybody on that basis.
 * - **The injuries view is a filter, not a separate feed.** `?view=injuries`
 *   returns the 25 newest items carrying `is-injured`; the plain view returns
 *   the 25 newest of everything, injury items among them. Both are read and
 *   deduplicated, because the transfer half of the slice only appears on the
 *   plain one and a busy injury week pushes injuries off it.
 *
 * `news-update__news` — the paragraph — is parsed by nothing here on purpose.
 */

import { fetchWithRetry, type FeedFetch } from "@/lib/euroleague/http";

export const ROTOWIRE_BASE = "https://www.rotowire.com";

/**
 * Both views, injuries first.
 *
 * Order matters only for readability of the log; the plan deduplicates by item
 * key, and an item on both pages is one item.
 */
export const ROTOWIRE_VIEWS = [
  `${ROTOWIRE_BASE}/euro/news.php?view=injuries`,
  `${ROTOWIRE_BASE}/euro/news.php`,
] as const;

/** One published item, as the page states it. */
export type ScrapedItem = {
  /** The publisher's player key: `isaia-cordinier-1103`. */
  readonly slug: string;
  readonly name: string;
  readonly headline: string;
  readonly url: string;
  /** The club the publisher lists, for a person to read. Never written to the pool. */
  readonly clubName: string;
  readonly position: string;
  /** `Knee`, `Undisclosed`, or empty on an item that is not an injury item. */
  readonly bodyPart: string;
  /** `YYYY-MM-DD`, or empty when the page used a form we do not read. */
  readonly published: string;
  /** The page marked this item as an injury item. */
  readonly injured: boolean;
};

const BLOCK = /<div class="news-update((?:\s+[^"]*)?)">([\s\S]*?)(?=<div class="news-update(?:\s+[^"]*)?">|<\/main|$)/g;
const PLAYER_LINK =
  /class="news-update__player-link"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/;
const HEADLINE = /class="news-update__headline"[^>]*>([\s\S]*?)<\/div>/;
const POSITION = /class="news-update__pos"[^>]*>([\s\S]*?)<\/b>/;
const META = /class="news-update__meta"[^>]*>\s*<div>([\s\S]*?)<\/div>/;
const BODY_PART = /class="news-update__inj"[^>]*>([\s\S]*?)<\/div>/;
const TIMESTAMP = /class="news-update__timestamp"[^>]*>([\s\S]*?)<\/div>/;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
  "#x27": "'",
};

/** Tags out, entities back, whitespace collapsed. */
function text(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&([a-z]+|#x?[0-9a-f]+);/gi, (match, name: string) => {
      const key = name.toLowerCase();
      if (ENTITIES[key]) return ENTITIES[key];
      const numeric = /^#(x?)([0-9a-f]+)$/i.exec(key);
      if (!numeric) return match;
      const code = Number.parseInt(numeric[2], numeric[1] ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    })
    .replace(/\s+/g, " ")
    .trim();
}

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/**
 * `August 6, 2026` → `2026-08-06`.
 *
 * Anything else — a relative stamp, a format change — returns empty rather
 * than a guess. An item with no date is still a real item, and the key it gets
 * simply leans on its headline instead; a *wrong* date would sort a stale
 * injury to the top of the page.
 */
export function parseNewsDate(raw: string): string {
  const parsed = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/.exec(raw.trim());
  if (!parsed) return "";
  const month = MONTHS.indexOf(parsed[1].toLowerCase());
  if (month === -1) return "";
  const day = Number(parsed[2]);
  if (day < 1 || day > 31) return "";
  return `${parsed[3]}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** `/euro/player/isaia-cordinier-1103` → `isaia-cordinier-1103`. */
function slugFrom(href: string): string {
  const parsed = /\/euro\/player\/([^/?#]+)/.exec(href);
  return parsed ? parsed[1] : "";
}

/**
 * Every item one page states, in page order.
 *
 * A block without a player link or without a headline is skipped in silence:
 * the same markup carries club notes and promotional cards, and neither is a
 * fact about a player.
 */
export function parseRotowire(html: string): ScrapedItem[] {
  const items: ScrapedItem[] = [];

  for (const block of html.matchAll(BLOCK)) {
    const classes = block[1] ?? "";
    const body = block[2] ?? "";

    const link = PLAYER_LINK.exec(body);
    const headline = HEADLINE.exec(body);
    if (!link || !headline) continue;

    const slug = slugFrom(link[1]);
    const name = text(link[2]);
    const title = text(headline[1]);
    if (!slug || !name || !title) continue;

    const meta = META.exec(body);
    const position = text(POSITION.exec(body)?.[1] ?? "");
    // The meta line is the position letter glued to the club name — `<b>G</b>`
    // then `Anadolu Efes Istanbul` — so the club is what is left after it.
    const clubName = text(meta?.[1] ?? "").slice(position.length).trim();

    items.push({
      slug,
      name,
      headline: title,
      url: `${ROTOWIRE_BASE}${link[1]}`,
      clubName,
      position,
      bodyPart: text(BODY_PART.exec(body)?.[1] ?? ""),
      published: parseNewsDate(text(TIMESTAMP.exec(body)?.[1] ?? "")),
      injured: classes.includes("is-injured"),
    });
  }

  return items;
}

/**
 * Read both views and return their items, deduplicated by item key.
 *
 * Failing to read one view is not failing the pass: the injuries view carries
 * the availability facts and the plain view carries the transfers, and half of
 * something outside our control is worth having. A view that throws is
 * reported through `onProgress` and the caller sees it in the pass's problems.
 */
export async function fetchRotowireNews({
  doFetch = fetch,
  onProgress,
  views = ROTOWIRE_VIEWS,
}: {
  doFetch?: FeedFetch;
  onProgress?: (message: string) => void;
  views?: readonly string[];
} = {}): Promise<{ items: ScrapedItem[]; problems: string[] }> {
  const seen = new Set<string>();
  const items: ScrapedItem[] = [];
  const problems: string[] = [];

  for (const url of views) {
    try {
      const response = await fetchWithRetry(url, {
        doFetch,
        accept: "text/html",
        onWait: onProgress,
      });
      const found = parseRotowire(await response.text());
      if (found.length === 0) {
        problems.push(
          `${url} parsed to no items at all — the markup has probably changed.`,
        );
      }
      for (const item of found) {
        const key = `${item.slug}|${item.published}|${item.headline}`;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push(item);
      }
      onProgress?.(`${url} · ${found.length} item(s)`);
    } catch (error) {
      problems.push(
        `${url} could not be read: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return { items, problems };
}
