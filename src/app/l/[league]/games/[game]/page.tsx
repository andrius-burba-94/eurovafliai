import { GamePage } from "@/app/games/[game]/game-page";

/** A game seen from inside a league: who holds each player, and the league's own fantasy points. */
export default async function LeagueGame({ params }: PageProps<"/l/[league]/games/[game]">) {
  const { league, game } = await params;
  return <GamePage gameRef={game} leagueRef={league} />;
}
