import { GamePage } from "./game-page";

/** A game outside any league: the plain Euroleague box score. */
export default async function Game({ params }: PageProps<"/games/[game]">) {
  const { game } = await params;
  return <GamePage gameRef={game} leagueRef={null} />;
}
