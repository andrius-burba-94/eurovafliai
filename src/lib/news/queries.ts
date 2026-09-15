import "server-only";

import { getSession } from "@/lib/auth/session";
import { createUserClient } from "@/lib/pb/server";

/**
 * What the news surfaces read — slice 9.4.
 *
 * With the **reader's own token**, like every other read in this app: the items
 * are reference data and `player_news` is readable by anybody signed in, so the
 * PocketBase rules stay meaningful rather than being bypassed by a superuser
 * client that nothing would notice.
 */

export type NewsItem = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly clubName: string;
  readonly position: string;
  readonly bodyPart: string;
  readonly headline: string;
  readonly url: string;
  readonly published: string;
  readonly status: string;
  /** The pool player, when the name resolved to one. */
  readonly player: { id: string; name: string; status: string } | null;
};

type NewsRecord = {
  id: string;
  slug: string;
  name: string;
  club_name?: string;
  position?: string;
  body_part?: string;
  headline: string;
  url: string;
  published?: string;
  status?: string;
  player?: string;
  expand?: { player?: { id: string; name: string; status: string } };
};

const asItem = (row: NewsRecord): NewsItem => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  clubName: row.club_name ?? "",
  position: row.position ?? "",
  bodyPart: row.body_part ?? "",
  headline: row.headline,
  url: row.url,
  published: row.published ?? "",
  status: row.status ?? "",
  player: row.expand?.player
    ? {
        id: row.expand.player.id,
        name: row.expand.player.name,
        status: row.expand.player.status,
      }
    : null,
});

/**
 * The newest items, newest first.
 *
 * Sorted by the publisher's own date rather than by when we stored it: a pass
 * that runs for the first time stores three months of items in one second, and
 * "when we heard" would order them by whichever came back first.
 */
export async function readNews(limit = 40): Promise<NewsItem[] | null> {
  const session = await getSession();
  if (!session) return null;

  const pb = createUserClient(session.token);
  const rows = await pb.collection("player_news").getList<NewsRecord>(1, limit, {
    sort: "-published,-created",
    expand: "player",
    requestKey: null,
  });

  return rows.items.map(asItem);
}

/** Everything published about one player, newest first — for their profile. */
export async function readNewsFor(
  playerId: string,
  limit = 5,
): Promise<NewsItem[]> {
  const session = await getSession();
  if (!session) return [];

  const pb = createUserClient(session.token);
  const rows = await pb.collection("player_news").getList<NewsRecord>(1, limit, {
    filter: `player = '${playerId}'`,
    sort: "-published,-created",
    requestKey: null,
  });

  return rows.items.map(asItem);
}
