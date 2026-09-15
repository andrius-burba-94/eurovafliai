import { redirect } from "next/navigation";

import { BackLink, Bank, EmptyNotice, Sheet, TopRail } from "@/components/board";
import { readNews } from "@/lib/news/queries";
import { canManageRosters } from "@/lib/rosters/actions";

import { NewsBoard } from "./news-board";

/**
 * The injury and transfer board — slice 9.4.
 *
 * Facts and links, never somebody else's paragraph: who, which body part, what
 * the item asserted, when, and a link to the publisher who wrote it. The
 * headline is theirs and is quoted as theirs; the prose stays on their site.
 *
 * Two things make this a surface rather than a log:
 *
 * - **It says what it did to the pool.** An item that flagged a player shows
 *   that player's current status beside it, so "why is Musa greyed out in the
 *   draft pool" has an answer one tap away.
 * - **It is where a flag is cleared.** Both source pages carry the latest 25
 *   updates rather than a census of who is hurt, so nothing here can conclude
 *   that somebody recovered. A person can, and this is where they say so.
 */
export default async function NewsPage() {
  const items = await readNews();
  if (items === null) redirect("/login?error=unauthorized");

  const canManage = await canManageRosters();

  return (
    <>
      <TopRail action={<BackLink href="/players">The pool</BackLink>} />
      <Sheet testId="player-news">
        <div className="flex max-w-xl flex-col gap-3">
          <h1 className="text-3xl font-semibold uppercase tracking-[0.04em] sm:text-4xl">
            Injuries and moves
          </h1>
          <p className="text-ink-soft">
            What RotoWire has published about Euroleague players, newest first.
            An injury item marks that player unavailable in the pool; every item
            links back to the people who wrote it.
          </p>
        </div>

        {items.length === 0 ? (
          <Bank framed label="The board">
            <EmptyNotice testId="news-empty">
              Nothing has been read yet. The worker reads the pages every hour —
              or run <code className="text-ink">npm run news:sync</code> to do
              it now.
            </EmptyNotice>
          </Bank>
        ) : (
          <NewsBoard items={items} canManage={canManage} />
        )}
      </Sheet>
    </>
  );
}
