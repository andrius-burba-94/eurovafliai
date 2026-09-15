import { notFound, redirect } from "next/navigation";

import {
  BackLink,
  Bank,
  EmptyNotice,
  Field,
  Sheet,
  selectStyles,
  TopRail,
} from "@/components/board";
import { resolveSeason, SeasonControl } from "@/components/season-control";
import { SubmitButton } from "@/components/submit-button";
import { getSession } from "@/lib/auth/session";
import { serverConfig } from "@/lib/config/server";
import { getLeagueWithMembers } from "@/lib/leagues/queries";
import { readLineupBoard } from "@/lib/lineups/queries";

import { LineupForm } from "./lineup-form";

/**
 * Who started, who was captain, who sat — slice 9.3.
 *
 * The league is played on the official site; this is where the result is typed
 * in afterwards, which is why the round is a free choice and not "tonight".
 * The owner sets their own lineup and the commissioner sets anyone's.
 */

function roundFrom(value: string | string[] | undefined): number {
  const parsed = Number.parseInt(
    typeof value === "string" ? value : "",
    10,
  );
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
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
  const round = roundFrom(query.round);

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
  const board = drafted
    ? await readLineupBoard({ leagueId: id, memberId, season, round })
    : null;

  return (
    <>
      <TopRail action={<BackLink href={`/leagues/${id}`}>The lobby</BackLink>} />
      <Sheet testId="lineup">
        <div className="flex flex-col gap-4">
          <h1 className="text-3xl font-semibold uppercase tracking-[0.04em] sm:text-4xl">
            Lineup
          </h1>
          <p className="text-ink-soft">
            {teamName}, round {round}. The captain scores double, the bench
            scores half, the inactive three score nothing.
          </p>
        </div>

        <SeasonControl
          action={`/leagues/${id}/lineup`}
          season={season}
          currentSeason={currentSeason}
        />

        <Bank framed label="Which round" testId="lineup-picker">
          <form
            method="get"
            action={`/leagues/${id}/lineup`}
            className="flex flex-col gap-3 px-3 py-3 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end sm:gap-4"
          >
            <input type="hidden" name="season" value={season} />
            <Field label="Euroleague round">
              <input
                name="round"
                inputMode="numeric"
                defaultValue={String(round)}
                data-testid="lineup-round"
                className={selectStyles}
              />
            </Field>
            {canManage ? (
              <Field label="Whose team">
                <select
                  name="member"
                  defaultValue={memberId}
                  data-testid="lineup-member"
                  className={selectStyles}
                >
                  {data.members.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.teamName.trim() ? row.teamName : row.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <input type="hidden" name="member" value={memberId} />
            )}
            <SubmitButton
              testId="lineup-show"
              tone="ink"
              pendingLabel="Opening round…"
            >
              Show round
            </SubmitButton>
          </form>
        </Bank>

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
            leagueId={id}
            memberId={memberId}
            teamName={teamName}
            season={season}
            round={round}
            players={board.players}
            source={board.source}
            carriedFrom={board.carriedFrom}
            template={data.settings.lineup_template}
          />
        )}
      </Sheet>
    </>
  );
}
