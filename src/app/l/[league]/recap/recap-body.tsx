import type { ReactNode } from "react";

import { Bank } from "@/components/board";
import { ScoreFigure, StatusBadge, TeamCrest, teamFieldStyle } from "@/components/broadcast";
import { Glyph } from "@/components/glyphs";
import { Moment } from "@/components/moment";
import { PlayerPortrait } from "@/components/official-media";
import { RoundLadder } from "@/components/round-ladder";
import { announceAdd, announceDrop, announceTrade } from "@/lib/chat/messages";
import { roundStory } from "@/lib/season/story";
import type { Recap } from "@/lib/stats/recap";
import { formatHundredths, formatSignedTenths, formatTenths } from "@/lib/stats/scoring";
import type { TeamStyle } from "@/lib/teams/identity";
import type { LeaguePaths } from "@/lib/nav/urls";

/**
 * The morning after, as a front page (ADR-0011): a headline written from the
 * night's own facts, the winner's banner with its crown, the whole night as a
 * ladder, and beside it the best night, the wooden spoon and the deal that
 * moved most. Every sentence is derived; nothing here is stored.
 */
export function RecapBody({
  recap,
  names,
  styles,
  playerNames,
  playerCodes,
  leagueId,
  paths,
  season,
  open,
  summary,
  notes,
}: {
  recap: Recap;
  names: Readonly<Record<string, string>>;
  styles: Readonly<Record<string, TeamStyle>>;
  playerNames: Readonly<Record<string, string>>;
  playerCodes: Readonly<Record<string, string>>;
  leagueId: string;
  paths: LeaguePaths;
  season: string;
  /** Set while the round has a game left; its counts when it is the current round. */
  open: { played: number | null; total: number | null } | null;
  /** 7.1: the round's write-up, above The night; null when there is none to show. */
  summary?: ReactNode;
  /** 7.1: the analyst's line on the panel it explains. */
  notes?: { readonly table?: ReactNode; readonly stars?: ReactNode; readonly swing?: ReactNode };
}) {
  const team = (id: string) => names[id] ?? id;
  const player = (id: string) => playerNames[id] ?? id;
  const crest = (id: string, size: number) =>
    styles[id] ? <TeamCrest name={team(id)} color={styles[id]!.color} shape={styles[id]!.crest} size={size} /> : null;
  const story = roundStory(recap);
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
        ? announceDrop({ teamName: team(swing.memberId), players: swing.outIds.map(player), fromRound: swing.fromRound })
        : announceAdd({ teamName: team(swing.memberId), players: swing.inIds.map(player), fromRound: swing.fromRound })
    : null;

  return (
    <>
      {open ? (
        <p
          data-testid="recap-in-progress"
          className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-gold/40 bg-gold/10 px-3.5 py-3 text-sm text-ink"
        >
          <StatusBadge kind="provisional">In progress</StatusBadge>
          {open.played !== null && open.total !== null
            ? `${open.played} of ${open.total} ${open.total === 1 ? "game" : "games"} played · provisional. Nobody wins or takes the spoon until the last game.`
            : "A game of this round is still to be played, so these figures are provisional."}
        </p>
      ) : null}

      {story ? (
        <header className="flex flex-col gap-2" data-testid="recap-headline">
          <p className="display text-3xl leading-none sm:text-5xl">
            {team(story.winner.memberId)} {open ? "lead" : "win"} round {story.round}
            {story.margin !== null && story.margin > 0 ? ` by ${formatHundredths(story.margin)}` : ""}
          </p>
          {story.spoon ? (
            <p className="text-sm text-ink-soft sm:text-base">
              {open
                ? `${team(story.spoon.memberId)} are sitting last with ${formatHundredths(story.spoon.hundredths)}.`
                : `${team(story.spoon.memberId)} take the wooden spoon with ${formatHundredths(story.spoon.hundredths)}.`}
            </p>
          ) : null}
        </header>
      ) : null}

      {story && open ? (
        <div
          data-testid="recap-leader"
          className="team-field relative overflow-hidden rounded-card border border-panel-border p-4 sm:p-6"
          style={styles[story.winner.memberId] ? teamFieldStyle(styles[story.winner.memberId]!.color) : undefined}
        >
          <div className="relative flex items-center justify-between gap-4">
            <span className="flex min-w-0 items-center gap-4">
              {crest(story.winner.memberId, 64)}
              <span className="min-w-0">
                <span className="slot-label block">Leading so far</span>
                <span className="display line-clamp-2 block text-2xl sm:text-3xl">{team(story.winner.memberId)}</span>
              </span>
            </span>
            <ScoreFigure size="md" className="sm:text-6xl">{formatHundredths(story.winner.hundredths)}</ScoreFigure>
          </div>
        </div>
      ) : story ? (
        <Moment
          kind="sweep"
          id={`crown:${leagueId}:${story.round}`}
          testId="recap-winner"
          className="team-field relative overflow-hidden rounded-card border border-gold/40 p-4 sm:p-6"
          style={styles[story.winner.memberId] ? teamFieldStyle(styles[story.winner.memberId]!.color) : undefined}
        >
          <div aria-hidden="true" className="lattice pointer-events-none absolute inset-0" />
          <div className="relative flex items-center justify-between gap-4">
            <span className="flex min-w-0 items-center gap-4">
              <span className="relative">
                {crest(story.winner.memberId, 64)}
                <Moment kind="crown" id={`crown-drop:${leagueId}:${story.round}`} as="span" className="absolute -top-5 left-4 text-gold">
                  <Glyph name="crown" size={30} />
                </Moment>
              </span>
              <span className="min-w-0">
                <span className="slot-label flex items-center gap-1.5 text-gold">
                  <Glyph name="crown" size={13} /> Round winner
                </span>
                <span className="display line-clamp-2 block text-2xl sm:text-3xl">{team(story.winner.memberId)}</span>
              </span>
            </span>
            <ScoreFigure size="md" className="sm:text-6xl">{formatHundredths(story.winner.hundredths)}</ScoreFigure>
          </div>
        </Moment>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          {summary}
          <Bank framed label="The night" aside={`Round ${recap.round}`}>
            {recap.rows.length === 0 ? (
              <p className="min-w-0 text-sm break-words text-ink-soft" data-testid="recap-table-empty">
                No teams scored this round. The ladder appears once a counted box score lands for a roster.
              </p>
            ) : (
              <RoundLadder
                rows={recap.rows}
                names={names}
                styles={styles}
                hrefOf={(memberId) => `${paths.teams[memberId] ?? paths.base}?season=${encodeURIComponent(season)}`}
                marks={!open}
                testId="recap"
                label="Teams by this round"
              />
            )}
            {notes?.table}
          </Bank>
        </div>

        <div className="flex flex-col gap-6">
          <Bank framed label="Best night">
            {night && night.fantasyTenths > 0 ? (
              <div data-testid="recap-best-night" className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-3">
                  <PlayerPortrait personCode={playerCodes[night.playerId]} name={player(night.playerId)} className="!h-16 !w-14" />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-semibold">{player(night.playerId)}</span>
                    <span className="flex items-center gap-1.5 text-sm text-ink-soft">
                      {crest(night.memberId, 18)}
                      {team(night.memberId)}
                    </span>
                  </span>
                </span>
                <ScoreFigure size="md">{formatTenths(night.fantasyTenths)}</ScoreFigure>
              </div>
            ) : (
              <p className="min-w-0 text-sm break-words text-ink-soft" data-testid="recap-best-empty">
                No player night counted this round.
              </p>
            )}
            {notes?.stars}
          </Bank>

          {story?.spoon && open ? (
            <Bank framed label="Sitting last">
              <div data-testid="recap-last" className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 font-semibold">
                  {crest(story.spoon.memberId, 22)}
                  <span className="truncate">{team(story.spoon.memberId)}</span>
                </span>
                <span className="stat text-ink-soft">{formatHundredths(story.spoon.hundredths)}</span>
              </div>
            </Bank>
          ) : story?.spoon ? (
            <Bank framed label="Wooden spoon">
              <div data-testid="recap-spoon" className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-3">
                  <Moment kind="spoon" id={`spoon:${leagueId}:${story.round}`} as="span" className="grid size-12 place-items-center text-wood">
                    <Glyph name="spoon" size={36} />
                  </Moment>
                  <span className="flex min-w-0 items-center gap-2 font-semibold">
                    {crest(story.spoon.memberId, 22)}
                    <span className="truncate">{team(story.spoon.memberId)}</span>
                  </span>
                </span>
                <span className="stat text-ink-soft">{formatHundredths(story.spoon.hundredths)}</span>
              </div>
            </Bank>
          ) : null}

          <Bank framed label="Biggest swing">
            {swing && swingSentence ? (
              <div data-testid="recap-swing-deal" className="flex flex-col gap-2">
                <span className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 font-semibold">
                    {crest(swing.memberId, 22)}
                    <span className="truncate">{team(swing.memberId)}</span>
                  </span>
                  <span
                    className={`stat font-bold ${swing.deltaTenths >= 0 ? "text-gain" : "text-loss"}`}
                    data-testid="recap-swing-delta"
                  >
                    {formatSignedTenths(swing.deltaTenths)}
                  </span>
                </span>
                <p className="text-sm text-ink-soft">{swingSentence}</p>
              </div>
            ) : (
              <p className="min-w-0 text-sm break-words text-ink-soft" data-testid="recap-swing-empty">
                No recorded deal moved the table this round.
              </p>
            )}
            {notes?.swing}
          </Bank>
        </div>
      </div>
    </>
  );
}
