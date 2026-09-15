import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  BackLink,
  Bank,
  Correction,
  Door,
  EmptyNotice,
  Sheet,
  Slots,
  TopRail,
} from "@/components/board";
import {
  resolveSeason,
  SeasonControl,
} from "@/components/season-control";
import { getSession } from "@/lib/auth/session";
import { serverConfig } from "@/lib/config/server";
import { getLeagueWithMembers } from "@/lib/leagues/queries";
import { readProvisionalRounds } from "@/lib/lineups/queries";
import { readStandingsSnapshots } from "@/lib/stats/queries";

import { StandingsTable } from "./standings-table";

/**
 * The table — slice 4.5.
 *
 * Ranked from active roster memberships × stored box scores. Snapshots are
 * the cache; this page filters them by phase (regular season on until you
 * ask for the play-in, playoffs or Final Four).
 */
export default async function StandingsPage({
  params,
  searchParams,
}: PageProps<"/leagues/[id]/standings">) {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");

  const { id } = await params;
  const query = await searchParams;
  const currentSeason = serverConfig().EUROLEAGUE_SEASON;
  const season = resolveSeason(query.season, currentSeason);

  const data = await getLeagueWithMembers(id);
  if (!data) notFound();

  const viewerIsMember = data.members.some((member) => member.isYou);
  if (!viewerIsMember) notFound();

  const snapshots =
    data.league.status === "season"
      ? await readStandingsSnapshots(id, season)
      : [];

  // A round nobody has arranged counted every player at 100%, which is not
  // what the official game would have printed. Named rather than left to look
  // final — slice 9.3.
  //
  // Only the teams the table actually ranks are asked: a member with no roster
  // has no total a lineup could change, and counting them would strike every
  // round of every league forever.
  const rankedMembers = [
    ...new Set(
      snapshots.flatMap((snap) => snap.table.map((row) => row.memberId)),
    ),
  ];
  const provisional =
    snapshots.length > 0
      ? await readProvisionalRounds({
          leagueId: id,
          season,
          rounds: snapshots.map((snap) => snap.round),
          memberIds: rankedMembers,
        })
      : [];

  const names = Object.fromEntries(
    data.members.map((member) => [
      member.id,
      member.teamName.trim() ? member.teamName : member.name,
    ]),
  );

  const emptyDraft = data.league.status !== "season";
  const emptyScores = !emptyDraft && snapshots.length === 0;

  return (
    <>
      <TopRail
        action={<BackLink href={`/leagues/${id}`}>The lobby</BackLink>}
      />
      <Sheet testId="standings">
        <div className="flex flex-col gap-4">
          <h1 className="text-3xl font-semibold uppercase tracking-[0.04em] sm:text-4xl">
            Standings
          </h1>
          <p className="slot-label">{data.league.name}</p>
        </div>

        <SeasonControl
          action={`/leagues/${id}/standings`}
          season={season}
          currentSeason={currentSeason}
        />

        {emptyDraft ? (
          <Bank framed label="The table">
            <EmptyNotice testId="standings-empty">
              The draft is not complete, so there is no table yet. Rank lands
              after the last pick, from real Euroleague nights.
            </EmptyNotice>
            <Slots>
              <Door
                href={`/leagues/${id}`}
                title="The lobby"
                description="Finish the draft, then come back for the table."
                action="Open"
                testId="standings-empty-lobby"
              />
            </Slots>
          </Bank>
        ) : emptyScores ? (
          <Bank framed label="The table">
            <EmptyNotice testId="standings-empty">
              No box scores counted for {season} yet. The table fills after a
              counted round.
            </EmptyNotice>
            <Slots>
              <Door
                href={`/leagues/${id}`}
                title="The lobby"
                description="The season board is already open. Nights land on their own."
                action="Open"
                testId="standings-empty-lobby"
              />
            </Slots>
          </Bank>
        ) : (
          <>
            {provisional.length > 0 ? (
              <Correction testId="standings-provisional">
                {provisional.length === 1
                  ? `Round ${provisional[0]} counted every player at 100%: no lineup has been recorded for it.`
                  : `Rounds ${provisional.join(", ")} counted every player at 100%: no lineup has been recorded for them.`}{" "}
                <Link href={`/leagues/${id}/lineup`} className="underline">
                  Set a lineup
                </Link>{" "}
                and the table is recomputed.
              </Correction>
            ) : null}
            <StandingsTable
              snapshots={snapshots}
              names={names}
              leagueId={id}
              season={season}
            />
          </>
        )}
      </Sheet>
    </>
  );
}
