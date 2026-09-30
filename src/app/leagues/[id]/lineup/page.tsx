import { notFound, redirect } from "next/navigation";

import { Bank, EmptyNotice, selectStyles } from "@/components/board";
import { RoundStepper } from "@/components/broadcast";
import { AppShell } from "@/components/app-shell";
import { ContextPanel } from "@/components/context-panel";
import { resolveSeason, SeasonControl } from "@/components/season-control";
import { SubmitButton } from "@/components/submit-button";
import { readComparisonPlayers } from "@/lib/stats/comparison-queries";
import { getSession } from "@/lib/auth/session";
import { serverConfig } from "@/lib/config/server";
import { getLeagueWithMembers } from "@/lib/leagues/queries";
import { navLeagueFrom } from "@/lib/nav/items";
import { readLineupBoard } from "@/lib/lineups/queries";
import { readPanel } from "@/lib/panel/queries";
import { formatTipOff } from "@/lib/time/local";

import { LineupForm } from "./lineup-form";

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
}: PageProps<"/leagues/[id]/lineup">) {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");

  const { id } = await params;
  const query = await searchParams;
  const currentSeason = serverConfig().EUROLEAGUE_SEASON;
  const season = resolveSeason(query.season, currentSeason);
  const asked = roundFrom(query.round);

  const data = await getLeagueWithMembers(id);
  if (!data) notFound();

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
  const panel = await readPanel({ leagueId: id, season, teamNames, round: asked ?? undefined });
  const round = asked ?? panel.schedule?.round ?? 1;
  const board = drafted
    ? await readLineupBoard({ leagueId: id, memberId, season, round })
    : null;
  const comparison = board ? await readComparisonPlayers(board.players, season, session.token) : [];
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
          <form method="get" action={`/leagues/${id}/lineup`} className="flex min-w-0 items-center gap-2" data-testid="lineup-picker">
            <input type="hidden" name="season" value={season} />
            <input type="hidden" name="round" value={String(round)} />
            <select name="member" aria-label="Whose team" defaultValue={memberId} data-testid="lineup-member" className={`${selectStyles} max-w-56 min-w-0 font-semibold`}>
              {data.members.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.teamName.trim() ? row.teamName : row.name}
                </option>
              ))}
            </select>
            <SubmitButton testId="lineup-show" tone="ink" pendingLabel="Opening…" compact>
              Show
            </SubmitButton>
          </form>
        ) : null}
        <RoundStepper
          round={round}
          max={Math.max(38, round)}
          hrefFor={(next) => `/leagues/${id}/lineup?${new URLSearchParams({ season, round: String(next), member: memberId })}`}
          testId="lineup-stepper"
        />
        {tipOff ? <p className="text-sm text-ink-soft">Tips off {tipOff}</p> : null}
      </div>

      <SeasonControl
        action={`/leagues/${id}/lineup`}
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
          source={board.source}
          carriedFrom={board.carriedFrom}
          template={data.settings.lineup_template}
        />
      )}
    </AppShell>
  );
}
