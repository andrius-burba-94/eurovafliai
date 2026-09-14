/**
 * What one news pass would do, worked out before anything is written.
 *
 * Pure: no PocketBase, no network, no clock — `now` is an argument. The same
 * shape as `src/lib/stats/plan.ts` and for the same reason: the decisions worth
 * arguing about (who this item is about, whether it may touch a player's
 * status) are decided here, where they can be tested, and `store.ts` only
 * carries them out.
 */

import { normalizeName } from "@/lib/rosters/normalize";
import { looksLikeRename } from "@/lib/rosters/rename";

import type { ScrapedItem } from "./rotowire";

/** What an item asserts about availability. Empty means it asserts nothing. */
export type NewsStatus = "injured" | "doubtful" | "";

/** The pool as this module needs it. */
export type NewsPlayerRow = {
  readonly id: string;
  readonly name: string;
  readonly name_normalized?: string;
  readonly club_code: string;
  readonly status: string;
  readonly manual_lock?: boolean;
};

/** A stored item, as this module needs it. */
export type StoredNewsItem = {
  readonly id: string;
  readonly source_key: string;
  readonly slug: string;
  readonly player?: string;
  readonly applied?: boolean;
  readonly name: string;
  readonly headline: string;
  readonly published?: string;
  readonly status?: string;
  readonly body_part?: string;
  readonly club_name?: string;
  readonly position?: string;
  readonly url?: string;
};

/** The row shape `player_news` stores. */
export type NewsRow = {
  readonly source: "rotowire";
  readonly source_key: string;
  readonly slug: string;
  readonly player: string;
  readonly name: string;
  readonly club_name: string;
  readonly position: string;
  readonly body_part: string;
  readonly headline: string;
  readonly url: string;
  readonly published: string;
  readonly status: NewsStatus;
  readonly applied: boolean;
};

export type StatusChange = {
  readonly playerId: string;
  readonly playerName: string;
  readonly from: string;
  readonly to: NewsStatus;
  readonly sourceKey: string;
  readonly headline: string;
};

/** A published name the pool could not resolve to exactly one player. */
export type UnmatchedName = {
  readonly slug: string;
  readonly name: string;
  readonly clubName: string;
  /** How many of this pass's items are about them. */
  readonly items: number;
  readonly reason: "nobody" | "several";
};

export type NewsPlan = {
  readonly creates: NewsRow[];
  readonly updates: { id: string; fields: Partial<NewsRow> }[];
  readonly unchanged: number;
  readonly statusChanges: StatusChange[];
  readonly unmatched: UnmatchedName[];
};

/**
 * How recent an injury item has to be to touch a player's status.
 *
 * Both pages return the latest 25 updates rather than a census, so a cold first
 * pass reads items going back months — on 2026-09-14 the injuries view reached
 * to 8 June. Flagging a player from a June item in September would be asserting
 * something the source never said: that item was true when it was written and
 * says nothing about this week.
 *
 * Three weeks is the window in which "he is hurt" is still a statement about
 * the next game. Older items are still stored, still shown and still dated —
 * they simply do not move the flag.
 */
export const INJURY_WINDOW_DAYS = 21;

/** `2026-08-06` as a day number, or null when the date is unreadable. */
function dayOf(published: string): number | null {
  const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(published);
  if (!parsed) return null;
  const ms = Date.UTC(
    Number(parsed[1]),
    Number(parsed[2]) - 1,
    Number(parsed[3]),
  );
  return Number.isFinite(ms) ? Math.floor(ms / 86_400_000) : null;
}

export function isRecent(published: string, now: Date): boolean {
  const day = dayOf(published);
  if (day === null) return false;
  const today = Math.floor(now.getTime() / 86_400_000);
  return today - day <= INJURY_WINDOW_DAYS && day - today <= 1;
}

/**
 * The item's identity as the publisher expresses it.
 *
 * Slug, date and headline. Re-reading the same page every hour has to update
 * one row rather than stacking copies, and the same player can have two items
 * on one day ("Sustains knee injury", then "Out for the season") that are two
 * separate facts.
 */
export function itemKey(item: ScrapedItem): string {
  return `${item.slug}|${item.published}|${normalizeName(item.headline)}`;
}

/**
 * What an item asserts about availability.
 *
 * Only the page's own `is-injured` marking is read. No keyword classifier over
 * the headline: "Jumps to Partizan" and "Taking part in workouts" both appear
 * on the injuries view — the first is a transfer for a player who is hurt, the
 * second a recovery note for a player who still is — and guessing from the
 * words would get both wrong in opposite directions. The page marked them; that
 * is the fact. `doubtful` is left for a human, who is the only one here with
 * more information than the source.
 */
export function statusOf(item: ScrapedItem): NewsStatus {
  return item.injured ? "injured" : "";
}

/**
 * Which player an item is about.
 *
 * Four doors, in order of how much they are worth trusting:
 *
 * 1. **The publisher's slug, already answered.** Once any stored item under
 *    `isaia-cordinier-1103` carries a player, every later item under that slug
 *    is about the same person. This is what makes answering a mapping question
 *    a one-time act rather than a weekly chore.
 * 2. **The normalized name**, which is 4.2's matcher and not a second one:
 *    diacritic-folded and token-sorted, so "Dzanan Musa" reaches "Musa, Džanan".
 * 3. **Token containment**, which is 4.2's `looksLikeRename` and also not a
 *    second one. This is not an optimization — it is the common case. The clubs
 *    register **passport** names and the publisher writes common ones, so the
 *    pool holds `Lessort, Mathias Michel`, `Bacot Jr., Armando Linwood` and
 *    `Hayes, Kevarrius Keshawn` against published `Mathias Lessort`,
 *    `Armando Bacot` and `Kevarrius Hayes`. Measured on the live pages on
 *    2026-09-14: exact matching alone left 27 of 48 items unattached, most of
 *    them players the pool obviously has. A queue that opens with 27 questions
 *    nobody needed to be asked is the queue people stop reading.
 * 4. **Nothing** — and that is a question for a person, not a row to drop.
 *    `Kostas Sloukas` against a stored `Sloukas, Konstantinos` stays here,
 *    correctly: a nickname is not a string-distance problem, which is the
 *    lesson `rename.ts` was written around.
 *
 * A name matching *two* players is unmatched rather than resolved by club:
 * RotoWire's club vocabulary is its own ("Free Agent" is one of them), so
 * narrowing by it would be guessing with extra steps. Players marked `left`
 * are considered only when nobody active answers — the pool carries previous
 * seasons' departures, and a departed namesake must not outrank a current
 * player.
 */
export type NewsMatch =
  | { readonly matched: true; readonly playerId: string }
  | { readonly matched: false; readonly reason: UnmatchedName["reason"] };

const keyOf = (player: NewsPlayerRow): string =>
  player.name_normalized ?? normalizeName(player.name);

function resolve(
  key: string,
  players: readonly NewsPlayerRow[],
): NewsPlayerRow[] {
  const exact = players.filter((player) => keyOf(player) === key);
  if (exact.length > 0) return exact;
  return players.filter((player) => looksLikeRename(keyOf(player), key).same);
}

export function matchPlayer(
  item: ScrapedItem,
  players: readonly NewsPlayerRow[],
  bySlug: ReadonlyMap<string, string>,
): NewsMatch {
  const known = bySlug.get(item.slug);
  if (known) return { matched: true, playerId: known };

  const key = normalizeName(item.name);
  const here = players.filter((player) => player.status !== "left");
  const hits = resolve(key, here);
  const found = hits.length > 0 ? hits : resolve(key, players);

  if (found.length === 1) return { matched: true, playerId: found[0].id };
  return { matched: false, reason: found.length === 0 ? "nobody" : "several" };
}

/** Fields worth rewriting when the publisher edits an item in place. */
const DIFFED = [
  "name",
  "club_name",
  "position",
  "body_part",
  "headline",
  "url",
  "published",
  "status",
] as const;

export function planNewsImport({
  scraped,
  stored,
  players,
  now,
}: {
  readonly scraped: readonly ScrapedItem[];
  readonly stored: readonly StoredNewsItem[];
  readonly players: readonly NewsPlayerRow[];
  readonly now: Date;
}): NewsPlan {
  const byKey = new Map(stored.map((row) => [row.source_key, row]));
  const byId = new Map(players.map((player) => [player.id, player]));

  // Slug → player, learned from everything already answered. Stored first, so
  // one confirmed answer carries the whole of this pass.
  const bySlug = new Map<string, string>();
  for (const row of stored) {
    if (row.player && !bySlug.has(row.slug)) bySlug.set(row.slug, row.player);
  }

  const creates: NewsRow[] = [];
  const updates: { id: string; fields: Partial<NewsRow> }[] = [];
  const statusChanges: StatusChange[] = [];
  const unmatched = new Map<string, UnmatchedName>();
  let unchanged = 0;

  /** Players this pass has already decided about, so two items do not both flag. */
  const decided = new Set<string>();

  for (const item of scraped) {
    const key = itemKey(item);
    const status = statusOf(item);
    const match = matchPlayer(item, players, bySlug);
    const playerId = match.matched ? match.playerId : "";
    if (playerId) bySlug.set(item.slug, playerId);

    const existing = byKey.get(key);

    // Does this item move a status, and may it? Everything below is a refusal
    // with a reason rather than a silent skip, because each one is a rule.
    const player = playerId ? byId.get(playerId) : undefined;
    const alreadyApplied = existing?.applied === true;
    const flags =
      status !== "" &&
      player !== undefined &&
      !alreadyApplied &&
      !decided.has(player.id) &&
      // A commissioner's correction is untouchable by any ingest — the same
      // rule `diffRosters` follows.
      player.manual_lock !== true &&
      // `left` is a squad fact this source has no view of, and re-flagging
      // somebody already marked injured is not news.
      (player.status === "active" || player.status === "doubtful") &&
      isRecent(item.published, now);

    if (flags && player) {
      decided.add(player.id);
      statusChanges.push({
        playerId: player.id,
        playerName: player.name,
        from: player.status,
        to: status,
        sourceKey: key,
        headline: item.headline,
      });
    }

    const row: NewsRow = {
      source: "rotowire",
      source_key: key,
      slug: item.slug,
      player: playerId,
      name: item.name,
      club_name: item.clubName,
      position: item.position,
      body_part: item.bodyPart,
      headline: item.headline,
      url: item.url,
      published: item.published,
      status,
      // An item that flags a player is stored as having done so, which is what
      // stops the next pass flagging them again after somebody marked them fit.
      applied: alreadyApplied || flags,
    };

    if (!existing) {
      creates.push(row);
    } else {
      const fields: Record<string, unknown> = {};
      for (const field of DIFFED) {
        if (existing[field] !== row[field]) fields[field] = row[field];
      }
      // An item stored unattached and matched since — through the queue, or
      // because the player has arrived in the pool — attaches now.
      if (row.player && existing.player !== row.player) fields.player = row.player;
      if (row.applied && existing.applied !== true) fields.applied = true;

      if (Object.keys(fields).length === 0) unchanged += 1;
      else updates.push({ id: existing.id, fields: fields as Partial<NewsRow> });
    }

    if (!match.matched) {
      const seen = unmatched.get(item.slug);
      unmatched.set(item.slug, {
        slug: item.slug,
        name: item.name,
        clubName: item.clubName,
        items: (seen?.items ?? 0) + 1,
        reason: match.reason,
      });
    }
  }

  return {
    creates,
    updates,
    unchanged,
    statusChanges,
    unmatched: [...unmatched.values()],
  };
}

/** One line for the audit log, and the worker's. */
export function describeNewsPlan(plan: NewsPlan): string {
  const parts = [
    `${plan.creates.length} new`,
    `${plan.updates.length} updated`,
    `${plan.unchanged} unchanged`,
  ];
  if (plan.statusChanges.length) {
    parts.push(`${plan.statusChanges.length} player(s) flagged`);
  }
  if (plan.unmatched.length) {
    parts.push(`${plan.unmatched.length} name(s) unmatched`);
  }
  return parts.join(", ");
}
