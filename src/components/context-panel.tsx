"use client";

import Link from "next/link";
import { useRef, useState, type KeyboardEvent } from "react";

import { EmptyNotice, Slot, Slots } from "@/components/board";
import { PlayerPoolList } from "@/components/player-pool-list";
import type { PanelData, PanelGame } from "@/lib/panel/types";

/**
 * The side panel's body: Players, Schedule and News as an ARIA tablist —
 * slice 11.2, ADR-0008.
 *
 * Roving tabindex: one tab in the Tab order, arrows move between them, Home
 * and End jump to the ends, and selection follows focus because every panel
 * is already rendered data rather than a fetch. The selected tab carries the
 * 2px ink rule the filters use — ink, because the marker has two jobs and
 * a tab is neither.
 */
const TABS = [
  { id: "players", label: "Players" },
  { id: "schedule", label: "Schedule" },
  { id: "news", label: "News" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function ContextPanel({
  data,
  only,
}: {
  data: PanelData;
  /**
   * A subset of the tabs, in their usual order. The draft room leaves out
   * Players: its pool is the room's main column, and a second pool beside it
   * would be the same list twice with only one of them able to pick.
   */
  only?: readonly TabId[];
}) {
  const tabs = only ? TABS.filter((tab) => only.includes(tab.id)) : TABS;
  const [selected, setSelected] = useState<TabId>(tabs[0]!.id);
  const refs = useRef<Record<TabId, HTMLButtonElement | null>>({
    players: null,
    schedule: null,
    news: null,
  });

  const move = (event: KeyboardEvent<HTMLButtonElement>) => {
    const at = tabs.findIndex((tab) => tab.id === selected);
    const next =
      event.key === "ArrowRight"
        ? (at + 1) % tabs.length
        : event.key === "ArrowLeft"
          ? (at - 1 + tabs.length) % tabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    const id = tabs[next]!.id;
    setSelected(id);
    refs.current[id]?.focus();
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div
        role="tablist"
        aria-label="Side panel"
        className={`grid border-b border-rule ${
          tabs.length === 3 ? "grid-cols-3" : "grid-cols-2"
        }`}
      >
        {tabs.map((tab) => {
          const isSelected = tab.id === selected;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                refs.current[tab.id] = node;
              }}
              type="button"
              role="tab"
              id={`panel-tab-${tab.id}`}
              data-testid={`panel-tab-${tab.id}`}
              aria-selected={isSelected}
              aria-controls={`panel-body-${tab.id}`}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => setSelected(tab.id)}
              onKeyDown={move}
              className={`slot-label -mb-px min-h-11 border-b-2 px-2 transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-live ${
                isSelected
                  ? "border-ink text-ink"
                  : "border-transparent hover:text-ink"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`panel-body-${tab.id}`}
          aria-labelledby={`panel-tab-${tab.id}`}
          hidden={tab.id !== selected}
          tabIndex={0}
          className="min-w-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
        >
          {tab.id === "players" ? (
            <PlayerPoolList players={data.players} fixtures={data.fixtures} />
          ) : tab.id === "schedule" ? (
            <Schedule schedule={data.schedule} />
          ) : (
            <News items={data.news} />
          )}
        </div>
      ))}
    </div>
  );
}

const TIP_OFF = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Vilnius",
});

function Schedule({ schedule }: { schedule: PanelData["schedule"] }) {
  if (!schedule || schedule.games.length === 0) {
    return (
      <EmptyNotice testId="panel-schedule-empty">
        No games are stored for this round yet. The worker reads the schedule
        every night.
      </EmptyNotice>
    );
  }
  return (
    <div className="flex flex-col gap-3" data-testid="panel-schedule">
      <p className="slot-label">Round {schedule.round}</p>
      <Slots label={`Round ${schedule.round} games`}>
        {schedule.games.map((game) => (
          <GameRow key={game.code} game={game} />
        ))}
      </Slots>
    </div>
  );
}

function GameRow({ game }: { game: PanelGame }) {
  return (
    <Slot testId="panel-game" state={game.played ? "filled" : "waiting"}>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm text-ink">
          <abbr title={game.homeName} className="no-underline">
            {game.home}
          </abbr>{" "}
          <span className="text-ink-soft">vs</span>{" "}
          <abbr title={game.awayName} className="no-underline">
            {game.away}
          </abbr>
        </span>
        <span className="text-sm text-ink-soft">
          {game.tipOff ? TIP_OFF.format(new Date(game.tipOff)) : "Time to come"}
        </span>
      </span>
      {game.played ? (
        <span className="stat text-sm">
          {game.homeScore}&ndash;{game.awayScore}
        </span>
      ) : null}
    </Slot>
  );
}

function News({ items }: { items: PanelData["news"] }) {
  if (items.length === 0) {
    return (
      <EmptyNotice testId="panel-news-empty">
        Nothing has been read yet. The worker reads the injury pages every hour.
      </EmptyNotice>
    );
  }
  return (
    <div className="flex flex-col gap-3" data-testid="panel-news">
      <Slots label="Latest news">
        {items.map((item) => (
          <Slot key={item.id} testId="panel-news-item">
            <span className="flex min-w-0 flex-col gap-1">
              <span className="flex flex-wrap items-baseline gap-x-2">
                {item.playerId ? (
                  <Link
                    href={`/players/${item.playerId}`}
                    className="text-sm font-semibold uppercase tracking-[0.06em] underline decoration-ink/50 underline-offset-4 hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
                  >
                    {item.name}
                  </Link>
                ) : (
                  <span className="text-sm font-semibold uppercase tracking-[0.06em]">
                    {item.name}
                  </span>
                )}
                {item.status ? (
                  <span className="slot-label">{item.status}</span>
                ) : null}
              </span>
              <span className="min-w-0 text-sm break-words text-ink-soft">
                {item.headline}
              </span>
            </span>
          </Slot>
        ))}
      </Slots>
      <Link
        href="/players/news"
        className="slot-label inline-flex min-h-11 items-center self-start text-ink transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
      >
        All injury news &rarr;
      </Link>
    </div>
  );
}
