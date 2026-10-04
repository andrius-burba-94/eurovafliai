import { notFound, redirect } from "next/navigation";

import { Bank, EmptyNotice } from "@/components/board";
import { RoundStepper } from "@/components/broadcast";
import { AppShell } from "@/components/app-shell";
import { ContextPanel } from "@/components/context-panel";
import { LiveFeed } from "@/components/live-feed";
import { resolveSeason, SeasonControl } from "@/components/season-control";
import { TeamPicker } from "@/components/team-picker";
import { readComparisonPlayers } from "@/lib/stats/comparison-queries";
import { getSession } from "@/lib/auth/session";
import { serverConfig } from "@/lib/config/server";
import { getLeagueWithMembers } from "@/lib/leagues/queries";
import { navLeagueFrom } from "@/lib/nav/items";
import { readLineupBoard } from "@/lib/lineups/queries";
import { readLineupLive } from "@/lib/live/queries";
import { readPanel } from "@/lib/panel/queries";
import { formatTipOff } from "@/lib/time/local";

import { LineupForm } from "./lineup-form";
import { leagueHref } from "@/lib/nav/urls";

/**
 * Who started, who was captain, who sat — slice 9.3.
 *
 * The league is played on the official site; this is where the result is typed
 * in afterwards, which is why the round is a free choice and not "tonight" —
 * and why the page names a round's tip-off without claiming it locks anything.
 * Unasked, it opens the round the schedule says is current, the earliest one
 * with a game still to play, because that is the one most visits are about.
 * The owner sets their own lineup and the commissioner sets anyone's.
 */

function roundFrom(value: string | string[] | undefined): number | null {
  const parsed = Number.parseInt(
    typeof value === "string" ? value : "",
    10,
  );
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export default async function LineupPage({
  params,
  searchParams,
}: PageProps<"/l/[league]/lineup">) {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");

  const { league: leagueRef } = await params;
  const query = await searchParams;
  const currentSeason = serverConfig().EUROLEAGUE_SEASON;
  const season = resolveSeason(query.season, currentSeason);
  const asked = roundFrom(query.round);

  const data = await getLeagueWithMembers(leagueRef);
  if (!data) notFound();
  const id = data.league.id;
  const base = leagueHref(data.league);

  const you = data.members.find((member) => member.isYou);
  if (!you) notFound();

  const canManage = data.isCommissioner || you.canManage;
  const requested =
    typeof query.member === "string" ? query.member : you.id;
  const memberId =
    canManage && data.members.some((member) => member.id === requested)
      ? requested
      : you.id;
  const member = data.members.find((row) => row.id === memberId) ?? you;
  const teamName = member.teamName.trim() ? member.teamName : member.name;

  const drafted = data.league.status === "season";
  const teamNames = Object.fromEntries(
    data.members.map((row) => [row.id, row.teamName.trim() || row.name]),
  );
  const panel = await readPanel({ leagueId: id, season, teamNames, round: asked ?? undefined, basketNews: Boolean(data.league.basketnews_team_id) });
  const round = asked ?? panel.schedule?.round ?? 1;
  const board = drafted
    ? await readLineupBoard({ leagueId: id, memberId, season, round, basketNews: Boolean(data.league.basketnews_team_id) })
    : null;
  const [comparison, live] = board && !data.league.basketnews_team_id
    ? await Promise.all([
        readComparisonPlayers(board.players, season, session.token),
        readLineupLive({ season, round, players: board.players, token: session.token }),
      ])
    : [[], null];
  const firstTip = (panel.schedule?.round === round ? panel.schedule.games : [])
    .map((game) => game.tipOff)
    .filter((stamp): stamp is string => Boolean(stamp))
    .sort()[0];
  const tipOff = firstTip ? formatTipOff(firstTip) : null;

  return (
    <AppShell
      current="lineup"
      league={navLeagueFrom(data)}
      measure="wide"
      testId="lineup"
      panel={<ContextPanel data={panel} />}
    >
      {/* One line, not a header: the page is plainly the lineup, so the room
          goes to the court. The team is named by the picker when there is one. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2" data-testid="lineup-toolbar">
        <h1 className={canManage ? "sr-only" : "display min-w-0 truncate text-2xl"}>
          {canManage ? `Lineup: ${teamName}` : teamName}
        </h1>
        {canManage ? (
          <TeamPicker
            action={`${base}/lineup`}
            keep={{ season, round: String(round) }}
            members={data.members}
            value={memberId}
            testId="lineup"
          />
        ) : null}
        <RoundStepper
          round={round}
          max={Math.max(38, round)}
          hrefFor={(next) => `${base}/lineup?${new URLSearchParams({ season, round: String(next), member: memberId })}`}
          testId="lineup-stepper"
        />
        {live && !live.final && (live.underway || live.hasGameWindow) ? (
          <LiveFeed
            testId="lineup-feed-status"
            authToken={session.token}
            season={season}
            round={round}
            checkedAt={live.checkedAt}
            final={live.final}
            hasGameWindow={live.hasGameWindow}
            gameTimes={live.gameTimes}
            hasPlayedGames={live.hasPlayedGames}
            hasFullTime={live.hasFullTime}
          />
        ) : tipOff ? (
          <p className="text-sm text-ink-soft">Tips off {tipOff}</p>
        ) : null}
      </div>

      <SeasonControl
        action={`${base}/lineup`}
        season={season}
        currentSeason={currentSeason}
      />

      {!drafted ? (
        <Bank framed label="The lineup">
          <EmptyNotice testId="lineup-empty">
            Lineups start once the draft is complete. There is no roster to
            arrange yet.
          </EmptyNotice>
        </Bank>
      ) : !board || board.players.length === 0 ? (
        <Bank framed label="The lineup">
          <EmptyNotice testId="lineup-empty">
            Nobody was on this roster for round {round}. Check the round, or
            record the trades that built it first.
          </EmptyNotice>
        </Bank>
      ) : (
        <LineupForm
          key={`${id}:${memberId}:${season}:${round}`}
          leagueId={id}
          memberId={memberId}
          teamName={teamName}
          season={season}
          round={round}
          players={board.players}
          comparison={comparison}
          live={live?.underway ? live.byPlayer : null}
          source={board.source}
          official={board.official}
          carriedFrom={board.carriedFrom}
          template={data.settings.lineup_template}
          sourceOwned={Boolean(data.league.basketnews_team_id)}
        />
      )}
    </AppShell>
  );
}
