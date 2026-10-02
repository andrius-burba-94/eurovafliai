import { PlayerProfilePage } from "./player-page";

/**
 * A player outside any league. Opened with `?league=` (as links did before
 * S29) it moves under that league, which keeps the league's sidebar.
 */
export default async function PlayerPage({ params, searchParams }: PageProps<"/players/[id]">) {
  const { id } = await params;
  const query = await searchParams;
  return (
    <PlayerProfilePage
      playerRef={id}
      leagueRef={typeof query.league === "string" ? query.league : null}
      memberRef={typeof query.member === "string" ? query.member : null}
      path={`/players/${id}`}
    />
  );
}
