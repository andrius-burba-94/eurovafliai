import { notFound, redirect } from "next/navigation";

import { BackLink, Sheet, TopRail } from "@/components/board";
import { getSession } from "@/lib/auth/session";
import { serverConfig } from "@/lib/config/server";
import { getLeagueWithMembers } from "@/lib/leagues/queries";
import { readStandingsSnapshots } from "@/lib/stats/queries";

import { StandingsTable } from "./standings-table";

/**
 * The table — slice 4.5.
 *
 * Ranked from the completed draft's picks × stored box scores. Snapshots are
 * the cache; this page filters them by phase (regular season on until you
 * ask for the play-in, playoffs or Final Four). Until 5.1 there is no
 * membership window, so a trade would not move these numbers.
 */
export default async function StandingsPage({
  params,
  searchParams,
}: PageProps<"/leagues/[id]/standings">) {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");

  const { id } = await params;
  const query = await searchParams;
  const seasonRaw = typeof query.season === "string" ? query.season : "";
  const season = /^E\d{4}$/i.test(seasonRaw)
    ? seasonRaw.toUpperCase()
    : serverConfig().EUROLEAGUE_SEASON;

  const data = await getLeagueWithMembers(id);
  if (!data) notFound();

  const viewerIsMember = data.members.some((member) => member.isYou);
  if (!viewerIsMember) notFound();

  const snapshots =
    data.league.status === "season"
      ? await readStandingsSnapshots(id, season)
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
          <p className="slot-label">
            {data.league.name} · {season}
          </p>
        </div>

        {emptyDraft ? (
          <p className="text-ink-soft" data-testid="standings-empty">
            The draft is not complete, so there is no table yet.
          </p>
        ) : emptyScores ? (
          <p className="text-ink-soft" data-testid="standings-empty">
            No box scores counted for {season} yet.
          </p>
        ) : (
          <StandingsTable snapshots={snapshots} names={names} />
        )}
      </Sheet>
    </>
  );
}
