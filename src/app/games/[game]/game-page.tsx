import Link from "next/link";
import type { CSSProperties } from "react";
import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { Bank, EmptyNotice } from "@/components/board";
import { BoxScore, type BoxHolding, type BoxOwner } from "@/components/box-score";
import { GAME_BADGE, ScoreFigure, StatusBadge } from "@/components/broadcast";
import { GameFeed } from "@/components/game-feed";
import { ClubCrestMark } from "@/components/official-media";
import { getSession } from "@/lib/auth/session";
import { clubLabel } from "@/lib/clubs/labels";
import { clubColor } from "@/lib/clubs/colors";
import { serverConfig } from "@/lib/config/server";
import { getLeagueWithMembers } from "@/lib/leagues/queries";
import { clockLabel, periodHeads } from "@/lib/live/game-box";
import { readGameBox, readYourHoldings, type GameBox } from "@/lib/live/game";
import { navLeagueFrom } from "@/lib/nav/items";
import { leagueHref, playerHref } from "@/lib/nav/urls";
import { formatTipOff } from "@/lib/time/local";

/** A game code as a URL carries it: a positive whole number. */
function gameCodeOf(value: string): number | null {
  const code = Number(value);
  return /^\d+$/.test(value) && Number.isInteger(code) && code > 0 ? code : null;
}

/**
 * One game's box score: the scoreboard, then every player's line, sortable,
 * for both clubs or one. Inside a league it also marks who holds each player
 * and counts fantasy points the league's way; outside one it is the plain
 * Euroleague game. Live figures re-render as the worker publishes them.
 */
export async function GamePage({ gameRef, leagueRef }: { gameRef: string; leagueRef: string | null }) {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");
  const gameCode = gameCodeOf(gameRef);
  if (gameCode === null) notFound();

  const leagueData = leagueRef ? await getLeagueWithMembers(leagueRef) : null;
  if (leagueRef && (!leagueData || !leagueData.members.some((member) => member.isYou))) notFound();
  const season = serverConfig().EUROLEAGUE_SEASON;
  const game = await readGameBox({
    season,
    gameCode,
    token: session.token,
    leagueId: leagueData?.league.id ?? null,
    basketNews: Boolean(leagueData?.league.basketnews_team_id),
  });
  if (!game) notFound();

  const { fixture } = game;
  const league = leagueData ? navLeagueFrom(leagueData) : null;
  const members = new Map((leagueData?.members ?? []).map((member) => [member.id, member]));
  const owners: Record<string, BoxOwner> = {};
  for (const [personCode, memberId] of Object.entries(game.owners)) {
    const member = members.get(memberId);
    if (member) owners[personCode] = { name: member.teamName || member.name, color: member.color, crest: member.crest, you: member.isYou };
  }
  const held = await readYourHoldings({
    token: session.token,
    userId: session.user.id,
    round: fixture.round,
    playerIds: Object.values(game.players).map((player) => player.id),
  });
  const mine: Record<string, BoxHolding[]> = {};
  for (const [personCode, player] of Object.entries(game.players)) {
    const holdings = held[player.id];
    if (holdings) mine[personCode] = holdings.map((holding) => ({ league: holding.league, team: holding.team, here: holding.leagueId === leagueData?.league.id }));
  }
  const links = Object.fromEntries(
    Object.entries(game.players).map(([personCode, player]) => [personCode, playerHref(player, leagueData?.league)]),
  );
  const back = leagueData ? `${leagueHref(leagueData.league, "matchday")}?round=${fixture.round}` : null;

  return (
    <AppShell league={league} current={league ? "matchday" : undefined} measure="broad" testId="game">
      <header className="flex flex-col gap-1">
        <p className="slot-label text-live">
          {back ? (
            <Link href={back} className="hover:underline">
              &larr; Round {fixture.round} · Live
            </Link>
          ) : (
            `Euroleague · round ${fixture.round}`
          )}
        </p>
        <h1 className="sr-only">{`${game.homeName} v ${game.awayName}`}</h1>
      </header>

      <Scoreboard game={game} authToken={session.token} season={season} />

      {game.rows.length === 0 ? (
        <Bank framed label="Box score" testId="game-box">
          <EmptyNotice testId="game-box-empty">
            {game.state === "scheduled"
              ? `Tip-off ${formatTipOff(fixture.utc_date) ?? "to be confirmed"} (Vilnius time). Every player's line appears here once the game starts.`
              : "No box score has been published for this game yet."}
          </EmptyNotice>
        </Bank>
      ) : (
        <BoxScore
          bank={{
            label: "Box score",
            testId: "game-box",
            aside: leagueData ? (leagueData.league.basketnews_team_id ? "FP · BasketNews scoring" : "FP · fantasy scoring") : undefined,
            info: (
              <>
                Tap a column head to sort; tap again to flip it, a third time for the box score&apos;s own order.
                Gold marks a club&apos;s high in that column. The shirt marks a player on one of your teams.
                {leagueData ? " A crest beside a player is the league team holding him this round." : ""}
              </>
            ),
          }}
          home={{ code: fixture.local_club, name: game.homeName }}
          away={{ code: fixture.road_club, name: game.awayName }}
          rows={game.rows}
          owners={owners}
          mine={mine}
          links={links}
          live={game.state === "live"}
        />
      )}
    </AppShell>
  );
}

function Scoreboard({ game, authToken, season }: { game: GameBox; authToken: string; season: string }) {
  const { fixture } = game;
  const badge = GAME_BADGE[game.state];
  const clock = game.state === "live" || game.state === "stale" ? clockLabel(game.period, game.clock) : null;
  const leading = game.homeScore !== null && game.awayScore !== null && game.homeScore !== game.awayScore
    ? (game.homeScore > game.awayScore ? "home" : "away")
    : null;
  const heads = game.quarters ? periodHeads(game.quarters.local, game.quarters.road, game.period) : [];
  const style = { "--home": clubColor(fixture.local_club), "--away": clubColor(fixture.road_club) } as CSSProperties;
  const sides = [
    { code: fixture.local_club, name: game.homeName, score: game.homeScore, which: "home" as const, word: "Home" },
    { code: fixture.road_club, name: game.awayName, score: game.awayScore, which: "away" as const, word: "Away" },
  ];

  return (
    <section
      aria-label="Scoreboard"
      data-testid="game-scoreboard"
      data-state={game.state}
      className="club-split relative overflow-hidden rounded-card border border-panel-border px-4 py-4 sm:px-6 lg:py-3"
      style={style}
    >
      {/* Half of each club's crest, bled off its own edge: the club, not a word, says whose side it is. */}
      <ClubCrestMark
        clubCode={fixture.local_club}
        className="absolute top-1/2 left-0 size-32 -translate-x-1/2 -translate-y-1/2 opacity-30 sm:size-40 sm:opacity-60 lg:opacity-90"
      />
      <ClubCrestMark
        clubCode={fixture.road_club}
        className="absolute top-1/2 right-0 size-32 translate-x-1/2 -translate-y-1/2 opacity-30 sm:size-40 sm:opacity-60 lg:opacity-90"
      />
      <div className="relative flex flex-col gap-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2 gap-y-3 sm:gap-x-6 lg:grid-cols-[minmax(0,1fr)_auto_auto_minmax(0,1fr)]">
          {sides.map((side, index) => (
            <div
              key={side.which}
              className={`flex min-w-0 flex-col items-center gap-1 text-center ${index === 1 ? "col-start-3 row-start-1 sm:pr-16 lg:col-start-4" : "sm:pl-16"}`}
            >
              <span className="display line-clamp-2 w-full text-base break-words sm:text-2xl lg:text-xl xl:text-2xl" title={side.name}>
                <span className="sm:hidden">{clubLabel(side.code)}</span>
                <span className="hidden sm:inline">{side.name}</span>
              </span>
              <span className="slot-label">{side.word}</span>
            </div>
          ))}
          <div className="col-start-2 row-start-1 flex flex-col items-center gap-1.5">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <StatusBadge kind={badge.kind} testId="game-state">{badge.word}</StatusBadge>
              {clock ? (
                <span className="stat text-sm font-semibold" data-testid="game-clock">
                  {clock}
                </span>
              ) : game.state === "scheduled" ? (
                <span className="text-sm text-ink-soft">{formatTipOff(fixture.utc_date) ?? "Time to be confirmed"}</span>
              ) : null}
            </div>
            <div className="flex items-center gap-2 sm:gap-4" data-testid="game-score">
              <ScoreFigure size="lg" className={leading === "away" ? "text-ink-soft" : ""}>
                {game.homeScore ?? "–"}
              </ScoreFigure>
              <span aria-hidden="true" className="display text-3xl text-ink-faint">:</span>
              <ScoreFigure size="lg" className={leading === "home" ? "text-ink-soft" : ""}>
                {game.awayScore ?? "–"}
              </ScoreFigure>
              <span className="sr-only">
                {`${game.homeName} ${game.homeScore ?? 0}, ${game.awayName} ${game.awayScore ?? 0}`}
              </span>
            </div>
          </div>
          {game.quarters && heads.length > 0 ? (
            <div className="col-span-3 row-start-2 mx-auto w-full max-w-sm overflow-x-auto lg:col-span-1 lg:col-start-3 lg:row-start-1 lg:w-72">
              <table className="w-full text-sm" data-testid="game-line-score">
                <caption className="sr-only">Points by period</caption>
                <thead>
                  <tr>
                    <th scope="col" className="w-12 text-left"><span className="sr-only">Club</span></th>
                    {heads.map((head) => (
                      <th key={head} scope="col" className="slot-label px-1 py-0.5 text-right">{head}</th>
                    ))}
                    <th scope="col" className="slot-label px-1 py-0.5 text-right">T</th>
                  </tr>
                </thead>
                <tbody>
                  {sides.map((side) => {
                    const points = side.which === "home" ? game.quarters!.local : game.quarters!.road;
                    return (
                      <tr key={side.which} className="border-t border-panel-border">
                        <th scope="row" className="py-0.5 text-left font-semibold">{clubLabel(side.code)}</th>
                        {heads.map((head, index) => {
                          const reached = game.state === "final" || game.state === "fulltime" || game.period === null || index < game.period;
                          const current = (game.state === "live" || game.state === "stale") && game.period === index + 1;
                          return (
                            <td key={head} className={`stat px-1 py-0.5 text-right ${current ? "font-semibold text-live" : reached ? "" : "text-ink-faint"}`}>
                              {reached ? points[index] ?? 0 : "–"}
                            </td>
                          );
                        })}
                        <td className="stat px-1 py-0.5 text-right font-semibold">{side.score ?? "–"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        <div className="flex justify-center">
          <GameFeed authToken={authToken} season={season} gameCode={fixture.game_code} checkedAt={game.checkedAt} state={game.state} />
        </div>
      </div>
    </section>
  );
}
