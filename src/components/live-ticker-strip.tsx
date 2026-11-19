"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type PocketBase from "pocketbase";

import { useGameHref } from "@/components/league-links";
import { ClubCrest } from "@/components/official-media";
import { clubLabel } from "@/lib/clubs/labels";
import {
  newerSnapshot,
  tickerGame,
  tickerOrder,
  tickerSnapshotOf,
  type TickerFixture,
  type TickerGame,
  type TickerSnapshot,
} from "@/lib/live/ticker";
import { useLiveSubscription } from "@/lib/pb/use-live";
import { formatClock } from "@/lib/time/local";

type StoredRow = Parameters<typeof tickerSnapshotOf>[0];

/**
 * Tonight's games across the top of every signed-in page. Unlike a page that
 * re-renders on each snapshot, the strip sits on every page — a lineup being
 * edited, a draft on the clock — so it takes each game's score straight from
 * the realtime record and never asks the page around it to refresh.
 */
export function LiveTickerStrip({
  authToken,
  season,
  renderedAt,
  fixtures,
  snapshots,
}: {
  authToken: string;
  season: string;
  renderedAt: number;
  fixtures: readonly TickerFixture[];
  snapshots: readonly TickerSnapshot[];
}) {
  const pathname = usePathname();
  const gameHref = useGameHref();
  const [now, setNow] = useState(renderedAt);
  const [heard, setHeard] = useState<Readonly<Record<number, TickerSnapshot>>>({});
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const filter = `season = '${season}' && (${fixtures.map((game) => `game_code = ${game.game_code}`).join(" || ")})`;
  const take = useCallback((rows: readonly StoredRow[]) => {
    setHeard((before) => {
      const next = { ...before };
      for (const row of rows) next[row.game_code] = newerSnapshot(before[row.game_code], tickerSnapshotOf(row))!;
      return next;
    });
    setNow(Date.now());
  }, []);
  const subscribe = useCallback(
    async (pb: PocketBase) => [
      await pb.collection("live_game_snapshots").subscribe<StoredRow>("*", (event) => take([event.record]), {
        filter,
        fields: "game_code,live,local_score,road_score,checked_at,detail",
      }),
    ],
    [filter, take],
  );
  // Realtime does not replay: what was written while the stream was down is read here.
  const onConnect = useCallback((pb: PocketBase) => {
    void pb.collection("live_game_snapshots")
      .getFullList<StoredRow>({ filter, fields: "game_code,live,local_score,road_score,checked_at,detail", requestKey: null })
      .then(take)
      .catch(() => undefined);
  }, [filter, take]);
  const { live } = useLiveSubscription({ authToken, subscribe, onConnect });

  const fromServer = new Map(snapshots.map((row) => [row.game_code, row]));
  const games = tickerOrder(fixtures.map((fixture) =>
    tickerGame(fixture, newerSnapshot(fromServer.get(fixture.game_code), heard[fixture.game_code]), now)));
  const anyLive = games.some((game) => game.state === "live" || game.state === "stale");

  return (
    <nav
      aria-label="Tonight's games"
      data-testid="live-ticker"
      data-live={live ? "true" : "false"}
      className="border-b border-panel-border bg-stock-sunk"
    >
      <div className="flex items-center gap-2 pl-5 sm:pl-8">
        <span className={`slot-label shrink-0 pr-1 ${anyLive ? "text-on-air" : "text-ink-soft"}`}>
          {anyLive ? "Live now" : "Tonight"}
        </span>
        <ScrollRow>
          <ul role="list" className="flex items-center gap-2 py-2 pr-5 sm:pr-8">
            {games.map((game) => {
              const href = gameHref(game.code);
              return (
                <li key={game.code} className="shrink-0 snap-start">
                  <TickerChip game={game} href={href} current={pathname === href} />
                </li>
              );
            })}
          </ul>
        </ScrollRow>
      </div>
    </nav>
  );
}

/**
 * The strip's scroller, with an arrow at each end while there is more that
 * way: a mouse has no sideways swipe, and Shift-and-wheel is not common
 * knowledge. A phone still swipes; the arrows are there too, and harmless.
 */
function ScrollRow({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ back: false, ahead: false });

  useEffect(() => {
    const row = ref.current;
    if (!row) return;
    const measure = () => {
      const back = row.scrollLeft > 1;
      const ahead = row.scrollLeft + row.clientWidth < row.scrollWidth - 1;
      setMore((was) => (was.back === back && was.ahead === ahead ? was : { back, ahead }));
    };
    measure();
    row.addEventListener("scroll", measure, { passive: true });
    const resized = new ResizeObserver(measure);
    resized.observe(row);
    if (row.firstElementChild) resized.observe(row.firstElementChild);
    return () => {
      row.removeEventListener("scroll", measure);
      resized.disconnect();
    };
  }, []);

  const step = (direction: 1 | -1) => {
    const row = ref.current;
    if (!row) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.scrollBy({ left: direction * row.clientWidth * 0.8, behavior: reduced ? "auto" : "smooth" });
  };

  return (
    <div className="relative min-w-0 flex-1">
      <div ref={ref} className="flex snap-x overflow-x-auto overscroll-x-contain [scrollbar-width:none]" data-testid="live-ticker-scroll">
        {children}
      </div>
      <ScrollArrow side="back" shown={more.back} onPress={() => step(-1)} />
      <ScrollArrow side="ahead" shown={more.ahead} onPress={() => step(1)} />
    </div>
  );
}

function ScrollArrow({ side, shown, onPress }: { side: "back" | "ahead"; shown: boolean; onPress: () => void }) {
  if (!shown) return null;
  const back = side === "back";
  return (
    <div className={`pointer-events-none absolute inset-y-0 flex items-center bg-stock-sunk ${back ? "left-0 pr-1" : "right-0 pl-1"}`}>
      <button
        type="button"
        onClick={onPress}
        aria-label={back ? "Earlier games" : "More games"}
        data-testid={`live-ticker-${side}`}
        className="pointer-events-auto grid size-11 place-items-center rounded-full border border-panel-border bg-stock text-ink-soft transition-colors hover:bg-stock-high hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-live"
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
          <path d={back ? "M10 3 5 8l5 5" : "M6 3l5 5-5 5"} />
        </svg>
      </button>
    </div>
  );
}

function TickerChip({ game, href, current }: { game: TickerGame; href: string; current: boolean }) {
  const inPlay = game.state === "live" || game.state === "stale";
  const started = game.homeScore !== null && game.awayScore !== null;
  const home = clubLabel(game.home);
  const away = clubLabel(game.away);
  const lead = started && game.homeScore !== game.awayScore ? (game.homeScore! > game.awayScore! ? "home" : "away") : null;
  const status = inPlay
    ? game.clock ?? "Live"
    : game.state === "scheduled"
      ? formatClock(game.tipOff) ?? "Later"
      : game.state === "fulltime"
        ? "Full time"
        : "Final";
  const spoken = started
    ? `${home} ${game.homeScore}, ${away} ${game.awayScore}, ${inPlay ? `live, ${status}` : status}`
    : `${home} against ${away}, tip-off ${status}`;
  return (
    <Link
      href={href}
      aria-label={`${spoken}. Box score`}
      aria-current={current ? "page" : undefined}
      data-testid="live-ticker-game"
      data-state={game.state}
      className={`flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm transition-colors hover:bg-stock-high focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live ${
        current ? "border-live bg-live-sunk" : inPlay ? "border-on-air bg-stock" : "border-panel-border bg-stock"
      }`}
    >
      <span
        className={`flex items-center gap-1 text-[0.6875rem] leading-4 font-extrabold tracking-[0.04em] uppercase ${
          inPlay ? "text-on-air" : "text-ink-soft"
        }`}
      >
        {inPlay ? <span aria-hidden="true" className="on-air-dot" /> : null}
        <span className="stat normal-case">{status}</span>
      </span>
      <span className="flex items-center gap-1.5" aria-hidden="true">
        <ClubCrest clubCode={game.home} />
        <span className={`font-bold ${lead === "away" ? "text-ink-soft" : ""}`}>{home}</span>
        {started ? (
          <span className="stat font-bold">
            <span className={lead === "away" ? "text-ink-soft" : ""}>{game.homeScore}</span>
            <span className="text-ink-faint">–</span>
            <span className={lead === "home" ? "text-ink-soft" : ""}>{game.awayScore}</span>
          </span>
        ) : (
          <span className="text-ink-faint">v</span>
        )}
        <span className={`font-bold ${lead === "home" ? "text-ink-soft" : ""}`}>{away}</span>
        <ClubCrest clubCode={game.away} />
      </span>
    </Link>
  );
}
