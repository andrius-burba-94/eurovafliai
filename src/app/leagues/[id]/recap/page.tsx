import { notFound, redirect } from "next/navigation";

import {
  BackLink,
  Bank,
  Correction,
  Sheet,
  TopRail,
} from "@/components/board";
import {
  resolveSeason,
  SeasonControl,
} from "@/components/season-control";
import { getSession } from "@/lib/auth/session";
import { serverConfig } from "@/lib/config/server";
import { getLeagueWithMembers } from "@/lib/leagues/queries";
import { readLeagueRecap } from "@/lib/stats/queries";

import { RecapBody } from "./recap-body";
import { RoundPicker } from "./round-picker";

/**
 * One Euroleague night — slice 5.4.
 *
 * Rank, best night and biggest swing are derived from snapshots, windows,
 * box scores and recorded deals. Nothing here is stored as a recap row.
 */
export default async function RecapPage({
  params,
  searchParams,
}: PageProps<"/leagues/[id]/recap">) {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");

  const { id } = await params;
  const query = await searchParams;
  const currentSeason = serverConfig().EUROLEAGUE_SEASON;
  const season = resolveSeason(query.season, currentSeason);
  const roundRaw = typeof query.round === "string" ? Number(query.round) : NaN;
  const requestedRound =
    Number.isInteger(roundRaw) && roundRaw > 0 ? roundRaw : null;

  const data = await getLeagueWithMembers(id);
  if (!data) notFound();

  const viewerIsMember = data.members.some((member) => member.isYou);
  if (!viewerIsMember) notFound();

  const page =
    data.league.status === "season"
      ? await readLeagueRecap(id, season, requestedRound)
      : null;

  const names = Object.fromEntries(
    data.members.map((member) => [
      member.id,
      member.teamName.trim() ? member.teamName : member.name,
    ]),
  );

  const emptyDraft = data.league.status !== "season";
  const emptyScores = !emptyDraft && page === null;

  return (
    <>
      <TopRail
        action={<BackLink href={`/leagues/${id}`}>The lobby</BackLink>}
      />
      <Sheet testId="recap">
        <div className="flex flex-col gap-4">
          <h1 className="text-3xl font-semibold uppercase tracking-[0.04em] sm:text-4xl">
            This round
          </h1>
          <p className="slot-label">{data.league.name}</p>
        </div>

        <SeasonControl
          action={`/leagues/${id}/recap`}
          season={season}
          currentSeason={currentSeason}
        />

        {requestedRound !== null &&
        page &&
        page.recap.round !== requestedRound ? (
          <Correction testId="recap-round-fallback">
            Round {requestedRound} is not counted. Showing round{" "}
            {page.recap.round}.
          </Correction>
        ) : null}

        {emptyDraft ? (
          <Bank framed label="The night">
            <p className="text-ink-soft" data-testid="recap-empty">
              The draft is not complete, so there is no recap yet.
            </p>
          </Bank>
        ) : emptyScores ? (
          <Bank framed label="The night">
            <p className="text-ink-soft" data-testid="recap-empty">
              No box scores counted for {season} yet.
            </p>
          </Bank>
        ) : page ? (
          <>
            <RoundPicker
              leagueId={id}
              season={season}
              round={page.recap.round}
              rounds={page.countedRounds}
            />
            <RecapBody
              recap={page.recap}
              names={names}
              playerNames={page.playerNames}
              leagueId={id}
              season={season}
            />
          </>
        ) : null}
      </Sheet>
    </>
  );
}
