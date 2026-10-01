"use client";

import { displayName } from "@/lib/players/name";
import Link from "next/link";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { Bank, Door, EmptyNotice, Slot, Slots } from "@/components/board";
import type { TransactionLine } from "@/lib/memberships/queries";
import type { NewsItem } from "@/lib/news/queries";

const TABS = [
  { id: "chat", label: "Chat" },
  { id: "trades", label: "Trades" },
  { id: "injuries", label: "Injuries" },
  { id: "news", label: "EuroLeague news" },
] as const;
type TabId = (typeof TABS)[number]["id"];

/** League conversation and recorded activity in separate, keyboard-accessible views. */
export function LeagueActivity({
  leagueId,
  chat,
  transactions,
  news,
  viewerIsManager,
}: {
  leagueId: string;
  chat: ReactNode;
  transactions: readonly TransactionLine[];
  news: readonly NewsItem[];
  viewerIsManager: boolean;
}) {
  const [selected, setSelected] = useState<TabId>("chat");
  const refs = useRef<Record<TabId, HTMLButtonElement | null>>({
    chat: null,
    trades: null,
    injuries: null,
    news: null,
  });
  const injuries = news.filter((item) => item.status === "injured" || item.status === "doubtful").slice(0, 8);
  const leagueNews = news.filter((item) => !item.status).slice(0, 8);

  const move = (event: KeyboardEvent<HTMLButtonElement>) => {
    const at = TABS.findIndex((tab) => tab.id === selected);
    const next = event.key === "ArrowRight" ? (at + 1) % TABS.length
      : event.key === "ArrowLeft" ? (at - 1 + TABS.length) % TABS.length
      : event.key === "Home" ? 0
      : event.key === "End" ? TABS.length - 1
      : null;
    if (next === null) return;
    event.preventDefault();
    const id = TABS[next]!.id;
    setSelected(id);
    refs.current[id]?.focus();
  };

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="league-activity">
      <div role="tablist" aria-label="League activity" className="grid grid-cols-2 border-b border-rule sm:grid-cols-4">
        {TABS.map((tab) => {
          const active = selected === tab.id;
          return (
            <button
              key={tab.id}
              ref={(node) => { refs.current[tab.id] = node; }}
              type="button"
              role="tab"
              id={`activity-tab-${tab.id}`}
              aria-controls={`activity-panel-${tab.id}`}
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => setSelected(tab.id)}
              onKeyDown={move}
              className={`slot-label -mb-px min-h-11 border-b-2 px-2 transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-live ${active ? "border-ink text-ink" : "border-transparent hover:text-ink"}`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {TABS.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`activity-panel-${tab.id}`}
          aria-labelledby={`activity-tab-${tab.id}`}
          hidden={selected !== tab.id}
          tabIndex={0}
          className="min-w-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
        >
          {tab.id === "chat" ? chat : tab.id === "trades" ? (
            <Bank label="Trades" aside={<span data-testid="dashboard-tx-tally">{transactions.length === 0 ? "none yet" : `${transactions.length} recent`}</span>} framed>
              {transactions.length === 0 ? (
                <EmptyNotice testId="dashboard-tx-empty">No trades, signings or drops have been recorded.</EmptyNotice>
              ) : (
                <Slots testId="dashboard-transactions">
                  {transactions.map((line) => (
                    <Slot key={line.id} testId="dashboard-transaction">
                      <span className="min-w-0 text-sm break-words text-ink">{line.sentence}</span>
                    </Slot>
                  ))}
                </Slots>
              )}
              <Slots>
                <Door href={`/leagues/${leagueId}/transactions`} title="All trades" description="Every recorded roster change and its effective round." action="Open" />
                {viewerIsManager ? (
                  <Door href={`/leagues/${leagueId}/transactions/new`} testId="record-transaction" title="Record a transaction" description="A trade, a signing or a drop, once the room has agreed." action="Write it down" />
                ) : null}
              </Slots>
            </Bank>
          ) : (
            <Bank label={tab.id === "injuries" ? "Injuries" : "EuroLeague news"} framed>
              <NewsList items={tab.id === "injuries" ? injuries : leagueNews} kind={tab.id} />
            </Bank>
          )}
        </div>
      ))}
    </div>
  );
}

function NewsList({ items, kind }: { items: readonly NewsItem[]; kind: "injuries" | "news" }) {
  return (
    <>
      {items.length === 0 ? (
        <EmptyNotice testId={`activity-${kind}-empty`}>
          {kind === "injuries" ? "No recent injury reports." : "No recent EuroLeague news."}
        </EmptyNotice>
      ) : (
        <Slots label={kind === "injuries" ? "Recent injuries" : "Recent EuroLeague news"}>
          {items.map((item) => (
            <Slot key={item.id} testId={`activity-${kind}-item`}>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-sm font-semibold text-ink">{displayName(item.name)}</span>
                <span className="text-sm break-words text-ink-soft">{item.headline}</span>
                {item.url ? <a href={item.url} target="_blank" rel="noopener noreferrer" className="slot-label self-start underline decoration-ink/40 underline-offset-4">Source ↗</a> : null}
              </span>
            </Slot>
          ))}
        </Slots>
      )}
      <Link href="/players/news" className="slot-label inline-flex min-h-11 items-center text-ink underline decoration-ink/40 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live">
        All injuries and moves →
      </Link>
    </>
  );
}
