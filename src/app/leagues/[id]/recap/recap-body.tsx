import Link from "next/link";

import { Bank, CardName, Slot, Slots } from "@/components/board";
import { announceAdd, announceDrop, announceTrade } from "@/lib/chat/messages";
import type { Recap } from "@/lib/stats/recap";
import { formatSignedTenths, formatTenths } from "@/lib/stats/scoring";

export function RecapBody({
  recap,
  names,
  playerNames,
  leagueId,
  season,
}: {
  recap: Recap;
  names: Readonly<Record<string, string>>;
  playerNames: Readonly<Record<string, string>>;
  leagueId: string;
  season: string;
}) {
  const team = (id: string) => names[id] ?? id;
  const player = (id: string) => playerNames[id] ?? id;
  const night = recap.bestNight;
  const swing = recap.biggestSwing;
  const swingSentence = swing
    ? swing.type === "trade"
      ? announceTrade({
          teamA: team(swing.memberId),
          teamB: team(swing.counterpartId),
          sent: swing.outIds.map(player),
          received: swing.inIds.map(player),
          fromRound: swing.fromRound,
        })
      : swing.type === "drop"
        ? announceDrop({
            teamName: team(swing.memberId),
            players: swing.outIds.map(player),
            fromRound: swing.fromRound,
          })
        : announceAdd({
            teamName: team(swing.memberId),
            players: swing.inIds.map(player),
            fromRound: swing.fromRound,
          })
    : null;

  return (
    <>
      <Bank framed label="The night" aside={`Round ${recap.round}`}>
        {recap.rows.length === 0 ? (
          <p className="min-w-0 text-sm break-words text-ink-soft" data-testid="recap-table-empty">
            No teams scored this round. Rank appears once a counted box score
            lands for a roster.
          </p>
        ) : (
          <Slots testId="recap-table" label="Teams by this round">
            {recap.rows.map((row, index) => (
              <Slot key={row.memberId} testId="recap-row" state="filled">
                <Link
                  href={`/leagues/${leagueId}/teams/${row.memberId}?season=${encodeURIComponent(season)}`}
                  data-testid="recap-team"
                  className="-mx-3 -my-3 flex min-h-11 min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-3 transition-colors hover:bg-ink/5 active:bg-ink/10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-live"
                >
                  <span className="flex min-w-0 flex-wrap items-baseline gap-x-3">
                    <span className="slot-label tabular-nums">#{index + 1}</span>
                    <CardName>{team(row.memberId)}</CardName>
                  </span>
                  <span
                    className="text-sm tabular-nums"
                    data-testid="recap-tenths"
                  >
                    {formatTenths(row.tenths)}
                  </span>
                </Link>
              </Slot>
            ))}
          </Slots>
        )}
      </Bank>

      <Bank framed label="Best night">
        {night ? (
          <Slots testId="recap-best" label="Best night">
            <Slot testId="recap-best-night" state="filled">
              <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="flex min-w-0 flex-col gap-1">
                  <CardName>{player(night.playerId)}</CardName>
                  <span className="text-sm text-ink-soft">
                    {team(night.memberId)}
                  </span>
                </span>
                <span className="text-sm tabular-nums">
                  {formatTenths(night.fantasyTenths)}
                </span>
              </div>
            </Slot>
          </Slots>
        ) : (
          <p className="min-w-0 text-sm break-words text-ink-soft" data-testid="recap-best-empty">
            No player night counted this round. Best night is the highest
            fantasy line among players whose window covers it.
          </p>
        )}
      </Bank>

      <Bank framed label="Biggest swing">
        {swing && swingSentence ? (
          <Slots testId="recap-swing" label="Biggest swing">
            <Slot testId="recap-swing-deal" state="filled">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <CardName>{team(swing.memberId)}</CardName>
                  <span
                    className="text-sm tabular-nums"
                    data-testid="recap-swing-delta"
                  >
                    {formatSignedTenths(swing.deltaTenths)}
                  </span>
                </span>
                <p className="text-sm text-ink-soft">{swingSentence}</p>
              </div>
            </Slot>
          </Slots>
        ) : (
          <p className="min-w-0 text-sm break-words text-ink-soft" data-testid="recap-swing-empty">
            No recorded deal moved the table this round. A swing needs a written
            trade, add or drop that covers the night.
          </p>
        )}
      </Bank>
    </>
  );
}
