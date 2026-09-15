import Link from "next/link";

import {
  Bank,
  CardBlock,
  CardBlocks,
  Door,
  EmptyNotice,
  PositionPatch,
  Slot,
  Slots,
  Sparkline,
} from "@/components/board";
import { formatSignedTenths, formatTenths } from "@/lib/stats/scoring";
import type { TransactionLine } from "@/lib/memberships/queries";
import {
  dashboardRoster,
  dashboardStandings,
  seasonLabel,
  type DashboardRosterPlayer,
} from "@/lib/season/dashboard";
import type { Recap } from "@/lib/stats/recap";
import type { RoundSnapshot } from "@/lib/stats/standings";
import type { Position } from "@/lib/engine";

/**
 * The season dashboard — what a league sees once the draft is over.
 *
 * ## Why it replaced a grid of doors
 *
 * Until now the season lobby was four `Door` blocks: Standings, Your lineup,
 * This round, Record a transaction. Every one of them was a *promise of a
 * surface* rather than a surface, so the page that a league opens most often
 * during the thirty-eight rounds it plays told it nothing at all — you had to
 * pick a door to learn whether you were winning.
 *
 * So the four panels of the brief: the table, the conversation, your roster and
 * the league's news, on one screen, in the density this app is for. The doors
 * survive as the way *in* to each surface, not as the surface itself.
 *
 * ## The three panels the brief asked for that this product cannot tell the truth about
 *
 * Recorded here rather than silently substituted, because a later reader will
 * otherwise try to "finish" them:
 *
 * - **A W-L column.** This league has no head-to-head: standings are cumulative
 *   fantasy points with per-round snapshots (4.5). There is no opponent to have
 *   beaten, so the column would read `0-0` forever. It is `PTS` and the round's
 *   movement instead, which is what the league is actually playing for.
 * - **"Matchup of the week".** The same fact, larger: there is no matchup
 *   format anywhere in the blueprint, PRODUCT.md or CONTEXT.md, and inventing
 *   one would be inventing a game. What a round genuinely has is 5.4's recap —
 *   the night's ranking, the best night, and the deal that moved most — so the
 *   card shows that.
 * - **Player headshots.** `players` has no image field: name, club, position,
 *   status, person code, dorsal. A circular photo would have to be invented per
 *   player, which PRODUCT.md forbids outright. The position patch is this app's
 *   own mark for a player, it is colour-coded G/F/C, and it carries its letter.
 *
 * This is the same discipline as **D19** (purple head coaches) and **D23** (the
 * double round): a brief item that describes data the competition does not
 * produce is dropped on the measurement, with the number written down.
 */
export function SeasonDashboard({
  leagueId,
  season,
  snapshots,
  recap,
  playerNames,
  roster,
  rosterTemplate,
  transactions,
  teamNames,
  youMemberId,
  viewerIsManager,
  chat,
}: {
  leagueId: string;
  season: string;
  snapshots: readonly RoundSnapshot[];
  recap: Recap | null;
  playerNames: Readonly<Record<string, string>>;
  roster: readonly DashboardRosterPlayer[];
  rosterTemplate: Readonly<Record<Position, number>>;
  transactions: readonly TransactionLine[];
  teamNames: Readonly<Record<string, string>>;
  youMemberId: string | null;
  viewerIsManager: boolean;
  /** The league conversation, rendered by the caller so this stays a server component. */
  chat: React.ReactNode;
}) {
  const latest = snapshots.at(-1) ?? null;
  const previous = snapshots.at(-2) ?? null;
  const totals = Object.fromEntries(
    (latest?.table ?? []).map((row) => [row.memberId, row.totalTenths]),
  );
  const standings = dashboardStandings({
    totals,
    previous: previous
      ? Object.fromEntries(
          previous.table.map((row) => [row.memberId, row.totalTenths]),
        )
      : null,
    teamNames,
    youMemberId,
  });
  const groups = dashboardRoster(roster, rosterTemplate);
  const yourRank = standings.findIndex((row) => row.isYou) + 1;

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-[0.04em] uppercase sm:text-4xl">
          {seasonLabel(season)}
        </h1>
        <span className="slot-label text-ink-soft">
          {latest
            ? `Regular season in progress · Round ${latest.round}`
            : "Regular season · no round scored yet"}
          {" · "}
          {standings.length || Object.keys(teamNames).length} teams
        </span>
      </div>

      {/* Two columns from `lg`, one on a phone, in the order the brief reads
          them: the table and the conversation, then your roster and the news.
          Below `lg` nothing is side by side — draft night and match night are
          both phones on a couch. */}
      <div className="grid gap-8 lg:grid-cols-2 lg:gap-x-6 lg:items-start">
        <Bank
          label="League standings"
          aside={
            latest ? (
              <span data-testid="dashboard-round">Round {latest.round}</span>
            ) : undefined
          }
          framed
        >
          {standings.length === 0 ? (
            <EmptyNotice testId="dashboard-standings-empty">
              No round has been scored yet. The table fills in after the first
              Euroleague night this league counts.
            </EmptyNotice>
          ) : (
            <>
              {/* A ledger, so a slot run rather than card blocks: these rows are
                  compared down a column, which is the whole distinction
                  DESIGN.md draws between the two materials. */}
              <div className="slot-label flex items-baseline justify-between gap-3 px-3 pb-1 text-ink-faint">
                <span>Pos &middot; Team</span>
                <span className="flex items-baseline gap-4">
                  <span>Pts</span>
                  <span className="w-14 text-right">Round</span>
                </span>
              </div>
              {/* No `current` on the viewer's row, deliberately: that is
                  `Slot`'s keyboard cursor — a 2px ink outline plus
                  `aria-current` — and "this row is mine" is not a cursor
                  position. The word "you" in the row carries it, which is the
                  rule the lobby's own member list already follows. */}
              <Slots testId="dashboard-standings">
                {standings.map((row) => (
                  <Slot
                    key={row.memberId}
                    testId="dashboard-standing"
                    state="filled"
                  >
                    <span className="flex min-w-0 items-baseline gap-3">
                      <span className="stat text-ink-faint">
                        {String(row.position).padStart(2, "0")}
                      </span>
                      <Link
                        href={`/leagues/${leagueId}/teams/${row.memberId}?season=${season}`}
                        className="min-w-0 truncate text-sm text-ink underline decoration-ink/30 underline-offset-4 transition-colors hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
                      >
                        {row.teamName}
                      </Link>
                      {row.isYou ? (
                        <span className="slot-label text-ink-soft">you</span>
                      ) : null}
                    </span>
                    <span className="flex items-baseline gap-4">
                      <span className="stat text-ink">
                        {formatTenths(row.totalTenths)}
                      </span>
                      {/* Null is not zero: no previous round to compare
                          against prints nothing, where a blank round prints
                          +0.0. The distinction is the panel's one real sum. */}
                      <span className="stat w-14 text-right text-ink-soft">
                        {row.roundTenths === null
                          ? ""
                          : formatSignedTenths(row.roundTenths)}
                      </span>
                    </span>
                  </Slot>
                ))}
              </Slots>
            </>
          )}
          {/* Outside the branch above, deliberately. A door is *navigation*,
              and navigation that vanishes when a panel has no data is how a
              league loses its way to a surface on the day it most wants to
              look: the first day of a season, or any time the configured season
              has nothing ingested yet. The page it opens carries its own season
              selector, which is exactly how you reach the season this panel
              could not show. Caught by `recap.spec.ts`, which seeds a different
              season and lost the door along with the table. */}
          <Slots>
            <Door
              href={`/leagues/${leagueId}/standings?season=${season}`}
              testId="enter-standings"
              title="The full table"
              description="Every round, side by side, with the phase filter."
              action="Open"
            />
          </Slots>
        </Bank>

        {/* The conversation, at the top right, where the brief puts it. It is
            the same thread the draft room shows — `chat_messages` is
            league-scoped, so the hours before a roll and the season since are
            one transcript. */}
        <div className="flex flex-col gap-4">{chat}</div>

        <Bank
          label="My roster"
          aside={
            <span data-testid="dashboard-roster-tally">
              {roster.length} of{" "}
              {rosterTemplate.G + rosterTemplate.F + rosterTemplate.C}
            </span>
          }
          framed
        >
          {roster.length === 0 ? (
            <EmptyNotice testId="dashboard-roster-empty">
              You have no players yet. A roster is written when the draft
              completes.
            </EmptyNotice>
          ) : (
            groups.map((group) => (
              <div key={group.position} className="flex flex-col gap-3">
                <div className="slot-label flex items-baseline justify-between gap-3 px-3">
                  <span>{group.label}</span>
                  <span
                    data-testid="dashboard-group-count"
                    className="stat text-ink-soft"
                  >
                    {group.filled}/{group.of}
                  </span>
                </div>
                {group.players.length === 0 ? (
                  <EmptyNotice>Nobody in this bucket yet.</EmptyNotice>
                ) : (
                  <CardBlocks
                    testId="dashboard-roster-group"
                    label={group.label}
                    columns
                  >
                    {group.players.map((player) => (
                      <CardBlock
                        key={player.id}
                        testId="dashboard-roster-player"
                        position={player.position}
                      >
                        <span className="flex min-w-0 items-baseline justify-between gap-3">
                          <Link
                            href={`/players/${player.id}`}
                            className="min-w-0 truncate text-sm text-ink underline decoration-ink/30 underline-offset-4 transition-colors hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
                          >
                            {player.name}
                          </Link>
                          {/* This app's own mark for a player, and the reason
                              there is no headshot: the patch is colour-coded
                              and always prints its letter. */}
                          <PositionPatch position={player.position} />
                        </span>
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="slot-label text-ink-soft">
                            {player.clubCode}
                          </span>
                          <Sparkline
                            values={player.last5Pirs}
                            what={`${player.name} last five PIRs`}
                          />
                        </span>
                      </CardBlock>
                    ))}
                  </CardBlocks>
                )}
              </div>
            ))
          )}
          <Slots>
            <Door
              href={`/leagues/${leagueId}/lineup`}
              testId="enter-lineup"
              title="Your lineup"
              description="Who starts, who is captain, who sits — per round."
              action="Set it"
            />
          </Slots>
        </Bank>

        <div className="flex flex-col gap-8">
          <Bank label="League news" framed>
            {recap ? (
              <>
                {/* The brief's "matchup of the week", told truthfully: this
                    league plays one Euroleague night at a time against the
                    whole table, so the night's own facts are the result. */}
                <Slots testId="dashboard-night">
                  <Slot state="filled">
                    <span className="slot-label">Round {recap.round}</span>
                    {/* Prose, in the words family. `stat` is for figures read
                        *down a column*, and "You finished 3 of 12" is a
                        sentence with a number in it — which DESIGN.md's own
                        rule keeps in Space Grotesk. */}
                    <span className="text-sm text-ink">
                      {yourRank > 0
                        ? `You finished ${yourRank} of ${standings.length}.`
                        : "You are not in this table."}
                    </span>
                  </Slot>
                  {/* A best night of 0.0 is what an unscored round looks
                      like from here — the recap ranks whoever it has, and
                      before any box score lands that is somebody with nothing.
                      Headlining it would announce a performance that did not
                      happen. */}
                  {recap.bestNight && recap.bestNight.fantasyTenths > 0 ? (
                    <Slot testId="dashboard-best-night" state="filled">
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="slot-label">Best night</span>
                        <span className="truncate text-sm text-ink">
                          {playerNames[recap.bestNight.playerId] ?? "A player"}
                        </span>
                      </span>
                      <span className="stat text-ink">
                        {formatTenths(recap.bestNight.fantasyTenths)}
                      </span>
                    </Slot>
                  ) : null}
                  {recap.biggestSwing ? (
                    <Slot testId="dashboard-swing" state="filled">
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="slot-label">Biggest swing</span>
                        <span className="truncate text-sm text-ink">
                          {teamNames[recap.biggestSwing.memberId] ?? "A team"},
                          from round {recap.biggestSwing.fromRound}
                        </span>
                      </span>
                      <span className="stat text-ink">
                        {formatSignedTenths(recap.biggestSwing.deltaTenths)}
                      </span>
                    </Slot>
                  ) : null}
                </Slots>
              </>
            ) : (
              <EmptyNotice testId="dashboard-news-empty">
                Nothing to report yet. A round&rsquo;s news arrives with the
                first night this league counts.
              </EmptyNotice>
            )}
            {/* Same rule as the standings door above: the way to a surface does
                not depend on this panel having something to say. */}
            <Slots>
              <Door
                href={`/leagues/${leagueId}/recap?season=${season}`}
                testId="enter-recap"
                title="This round, in full"
                description="Every team's night, the best night and the deal that moved most."
                action="Open"
              />
            </Slots>
          </Bank>

          <Bank
            label="Transactions"
            aside={
              <span data-testid="dashboard-tx-tally">
                {transactions.length === 0
                  ? "none yet"
                  : `${transactions.length} recent`}
              </span>
            }
            framed
          >
            {transactions.length === 0 ? (
              <EmptyNotice testId="dashboard-tx-empty">
                No trades, signings or drops have been recorded.
              </EmptyNotice>
            ) : (
              <Slots testId="dashboard-transactions">
                {transactions.map((line) => (
                  <Slot key={line.id} testId="dashboard-transaction">
                    <span className="min-w-0 text-sm break-words text-ink">
                      {line.sentence}
                    </span>
                  </Slot>
                ))}
              </Slots>
            )}
            {viewerIsManager ? (
              <Slots>
                <Door
                  href={`/leagues/${leagueId}/transactions/new`}
                  testId="record-transaction"
                  title="Record a transaction"
                  description="A trade, a signing or a drop, once the room has agreed."
                  action="Write it down"
                />
              </Slots>
            ) : null}
          </Bank>
        </div>
      </div>
    </>
  );
}
