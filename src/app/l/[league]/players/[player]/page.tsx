import { PlayerProfilePage } from "@/app/players/[id]/player-page";

/** A player seen from inside a league: the same profile, and the league stays in the sidebar. */
export default async function LeaguePlayerPage({ params, searchParams }: PageProps<"/l/[league]/players/[player]">) {
  const { league, player } = await params;
  const query = await searchParams;
  return (
    <PlayerProfilePage
      playerRef={player}
      leagueRef={league}
      memberRef={typeof query.member === "string" ? query.member : null}
      path={`/l/${league}/players/${player}`}
    />
  );
}
