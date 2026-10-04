import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Bank, Door, EmptyNotice, Slots } from "@/components/board";
import { PageHeader } from "@/components/broadcast";
import { AppShell } from "@/components/app-shell";
import { DownloadMenu } from "@/components/download-menu";
import {
  resolveSeason,
  SeasonControl,
} from "@/components/season-control";
import { getSession } from "@/lib/auth/session";
import { serverConfig } from "@/lib/config/server";
import { readRoundProgress } from "@/lib/fixtures/queries";
import { getLeagueWithMembers } from "@/lib/leagues/queries";
import { navLeagueFrom } from "@/lib/nav/items";
import { readProvisionalRounds } from "@/lib/lineups/queries";
import { readStandingsSnapshots } from "@/lib/stats/queries";
import { stylesById } from "@/lib/teams/identity";

import { StandingsTable } from "./standings-table";
import { leagueHref, leaguePaths } from "@/lib/nav/urls";
import { InfoTip } from "@/components/info-tip";

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
}: PageProps<"/l/[league]/standings">) {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");

  const { league: leagueRef } = await params;
  const query = await searchParams;
  const currentSeason = serverConfig().EUROLEAGUE_SEASON;
  const season = resolveSeason(query.season, currentSeason);

  const data = await getLeagueWithMembers(leagueRef);
  if (!data) notFound();
  const id = data.league.id;
  const base = leagueHref(data.league);

  const viewerIsMember = data.members.some((member) => member.isYou);
  const you = data.members.find((member) => member.isYou);
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
  const sourceRounds = data.league.basketnews_team_id ? snapshots.map((snap) => snap.round) : null;
  const progress = sourceRounds
    ? { complete: sourceRounds }
    : await readRoundProgress(season, session.token, snapshots.map((snap) => snap.round));
  const latestRound = snapshots.at(-1)?.round;
  const latestOpen = latestRound !== undefined && !progress.complete.includes(latestRound);
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
    <AppShell
      current="standings"
      league={navLeagueFrom(data)}
      measure="wide"
      testId="standings"
    >
      <PageHeader
        eyebrow={
          latestRound === undefined
            ? data.league.name
            : `${data.league.name} · ${latestOpen ? `round ${latestRound} in progress` : `after round ${latestRound}`}`
        }
        title="Standings"
        action={<DownloadMenu leagueBase={base} />}
      />

      <SeasonControl
        action={`${base}/standings`}
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
              href={`${base}`}
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
              href={`${base}`}
              title="The lobby"
              description="The season board is already open. Nights land on their own."
              action="Open"
              testId="standings-empty-lobby"
            />
          </Slots>
        </Bank>
      ) : (
        <>
          <StandingsTable
            snapshots={snapshots}
            complete={progress.complete}
            names={names}
            styles={stylesById(data.members)}
            leagueId={id} paths={leaguePaths(data.league, data.members)}
            season={season}
            viewerMemberId={you?.id ?? null}
            aside={
              provisional.length > 0 ? (
                <span data-testid="standings-provisional" className="flex items-center gap-1.5 text-xs">
                  <span className="rounded-full border border-gold/50 bg-gold/10 px-2 py-0.5 font-semibold text-gold">
                    Provisional
                    <span className="hidden sm:inline">
                      : {provisional.length === 1 ? "round" : "rounds"} {provisional.join(", ")}
                    </span>
                  </span>
                  <InfoTip label="About provisional rounds">
                    {provisional.length === 1
                      ? `Round ${provisional[0]} counted every player at 100%: no lineup has been recorded for it.`
                      : `Rounds ${provisional.join(", ")} counted every player at 100%: no lineup has been recorded for them.`}{" "}
                    Set a lineup and the table is recomputed.
                  </InfoTip>
                  <Link href={`${base}/lineup`} className="font-semibold text-live hover:underline">
                    Set lineup
                  </Link>
                </span>
              ) : undefined
            }
          />
        </>
      )}
    </AppShell>
  );
}
