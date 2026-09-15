"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Bank, CardName, Correction, Slot, Slots } from "@/components/board";
import { SubmitButton } from "@/components/submit-button";
import { markPlayerFit, refreshNews, type NewsResult } from "@/lib/news/actions";
import type { NewsItem } from "@/lib/news/queries";

/**
 * The board of published items — slice 9.4.
 *
 * A row is the fact and a link, and the link is the point: the headline is the
 * publisher's own words and the paragraph under it stays on their site.
 *
 * The state language is the board's. An item that is currently why somebody is
 * unavailable is `live` — it is the one that is *doing* something right now;
 * everything else is `filled` history. The marker keeps its two jobs.
 */

const START: NewsResult = { error: null };

function dateWord(published: string): string {
  if (!published) return "undated";
  const [year, month, day] = published.split("-");
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const name = months[Number(month) - 1];
  return name ? `${Number(day)} ${name} ${year}` : published;
}

export function NewsBoard({
  items,
  canManage,
}: {
  items: readonly NewsItem[];
  canManage: boolean;
}) {
  const [refreshed, refreshAction] = useActionState(
    async () => refreshNews(),
    START,
  );
  const [fit, fitAction] = useActionState(markPlayerFit, START);

  const errors = [refreshed, fit]
    .map((result) => result.error)
    .filter((message): message is string => Boolean(message));
  const dones = [refreshed, fit]
    .map((result) => (result.error ? null : result.done))
    .filter((message): message is string => Boolean(message));

  const flagged = items.filter(
    (item) => item.player && item.player.status !== "active",
  );
  const unavailable = new Map(
    flagged.map((item) => [item.player!.id, item.player!]),
  );

  return (
    <>
      {errors.length > 0 ? (
        <Correction testId="news-error">{errors[errors.length - 1]}</Correction>
      ) : null}
      {/* Outside every branch a revalidation could unmount, which is the rule
          3.7 earned the hard way. */}
      {dones.length > 0 ? (
        <p
          data-testid="news-done"
          role="status"
          className="slot-filled px-3 py-3 text-sm"
        >
          {dones[dones.length - 1]}
        </p>
      ) : null}

      {canManage ? (
        <Bank
          framed
          label="Marked unavailable"
          aside={`${unavailable.size}`}
          testId="news-flagged"
        >
          <p className="text-sm text-ink-soft">
            The pages carry the latest updates, not a list of who is currently
            hurt — so nobody here is ever marked fit automatically. When a
            player is back, say so and the pool stops warning about them.
          </p>
          {unavailable.size === 0 ? (
            <p className="text-sm" data-testid="news-none-flagged">
              Nobody in the pool is marked unavailable by a news item.
            </p>
          ) : (
            <Slots testId="news-unavailable" label="Players marked unavailable">
              {[...unavailable.values()].map((player) => (
                <Slot key={player.id} state="live" testId={`unfit-${player.id}`}>
                  <span className="flex min-w-0 flex-1 items-baseline gap-3">
                    <Link
                      href={`/players/${player.id}`}
                      className="min-w-0 text-live underline decoration-live/40 underline-offset-4 transition-colors hover:decoration-live focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
                    >
                      <CardName scale="slot">{player.name}</CardName>
                    </Link>
                    <span className="slot-label shrink-0">{player.status}</span>
                  </span>
                  <form action={fitAction}>
                    <input type="hidden" name="player" value={player.id} />
                    <SubmitButton
                      testId={`mark-fit-${player.id}`}
                      compact
                      pendingLabel="Clearing…"
                      ariaLabel={`${player.name} is available again`}
                    >
                      Available again
                    </SubmitButton>
                  </form>
                </Slot>
              ))}
            </Slots>
          )}
        </Bank>
      ) : null}

      <Bank
        framed
        label="Published"
        aside={`${items.length} item${items.length === 1 ? "" : "s"}`}
        testId="news-board"
      >
        {canManage ? (
          <form action={refreshAction}>
            <SubmitButton testId="news-refresh" pendingLabel="Reading…">
              Read the pages now
            </SubmitButton>
          </form>
        ) : null}

        <Slots testId="news-items" label="Published injury and transfer items">
          {items.map((item) => {
            const live = Boolean(item.player && item.player.status !== "active");
            return (
              <Slot
                key={item.id}
                testId="news-item"
                state={live ? "live" : "filled"}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    {item.player ? (
                      <Link
                        href={`/players/${item.player.id}`}
                        className="min-w-0 text-live underline decoration-live/40 underline-offset-4 transition-colors hover:decoration-live focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
                      >
                        <CardName scale="slot">{item.player.name}</CardName>
                      </Link>
                    ) : (
                      <CardName scale="slot">{item.name}</CardName>
                    )}
                    {item.bodyPart ? (
                      <span className="slot-label" data-testid="news-body-part">
                        {item.bodyPart}
                      </span>
                    ) : null}
                    {item.player ? null : (
                      <span
                        className="slot-label text-ink-faint"
                        title="No player in the pool answers to this name yet"
                      >
                        unmatched
                      </span>
                    )}
                  </span>
                  {/* Their headline, quoted as theirs. The paragraph under it
                      on their site is not ours to reprint. */}
                  <span className="text-sm">{item.headline}</span>
                  <span className="text-xs text-ink-soft">
                    {dateWord(item.published)}
                    {item.clubName ? ` · ${item.clubName}` : ""} ·{" "}
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      data-testid="news-link"
                      className="text-live underline decoration-live/40 underline-offset-4 transition-colors hover:decoration-live focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
                    >
                      RotoWire
                    </a>
                  </span>
                </span>
              </Slot>
            );
          })}
        </Slots>
      </Bank>
    </>
  );
}
