import type { Position } from "@/lib/engine";

/**
 * Position words, and how to say a run of them.
 *
 * Extracted from `roster-radar.tsx`, which had the only copy, when the cheat
 * sheet needed the same sentence and 3.4a's first pass wrote a second one that
 * joined with `" and "` — so three positions came out as "5 G and 5 F and 3 C".
 * One list-join in the app, in one place.
 *
 * American **center**, everywhere it reaches a user: PRODUCT.md, CLAUDE.md, the
 * blueprint, `settings.ts`, `legality.ts` and the Euroleague API all say
 * Center, and 3.2 had to be corrected for drifting to the British spelling.
 * (`normalize.ts` keeps `centre` as an *input* alias, which is a different job.)
 */
export const POSITION_WORD: Record<Position, [string, string]> = {
  G: ["guard", "guards"],
  F: ["forward", "forwards"],
  C: ["center", "centers"],
};

/**
 * Whose positions a league counts in: the game it is linked to, or the
 * EuroLeague feed's for a league that plays only here. BasketNews has Omoruyi
 * at C where the Fantasy Challenge and the feed have him at F.
 */
export type LeagueSource = "euroleague" | "basketnews" | "fantasy";

/** Each linked game's name as a manager reads it. */
export const GAME_NAMES: Record<Exclude<LeagueSource, "euroleague">, string> = {
  basketnews: "BasketNews",
  fantasy: "the Fantasy Challenge",
};

export function leagueSource(league: {
  basketnews_team_id?: string | null;
  fantasy_league_id?: string | null;
}): LeagueSource {
  if (league.basketnews_team_id) return "basketnews";
  if (league.fantasy_league_id) return "fantasy";
  return "euroleague";
}

/** A player's position in a league's game; the feed's until the game's own is stored. */
export function leaguePosition(
  player: { position: Position; basketnews_position?: Position | "" | null; fantasy_position?: Position | "" | null },
  source: LeagueSource,
): Position {
  if (source === "basketnews") return player.basketnews_position || player.position;
  if (source === "fantasy") return player.fantasy_position || player.position;
  return player.position;
}

/**
 * "3 guards, 4 forwards and 3 centers".
 *
 * Zeros are omitted by default, so a roster that needs nothing comes back as
 * `empty` rather than as "0 guards, 0 forwards and 0 centers". That is right
 * for the radar, which is answering *what is still missing*.
 *
 * It is wrong — dangerously so — when the sentence is answering *what you
 * have*. The cheat sheet's shortfall line read "You have ranked 4 guards and 1
 * center, and a full roster needs 5 guards, 5 forwards and 3 centers": the
 * position with **none** of them is the one the sentence dropped, and it is the
 * one that will strand autodraft. Pass `keepZeros` when a nought is the whole
 * point of saying it. Found by 3.4b's critique.
 */
export function positionSentence(
  counts: Readonly<Partial<Record<Position, number>>>,
  empty = "nothing",
  { keepZeros = false }: { keepZeros?: boolean } = {},
): string {
  const parts = (["G", "F", "C"] as const)
    .filter((position) =>
      keepZeros ? counts[position] !== undefined : (counts[position] ?? 0) > 0,
    )
    .map((position) => {
      const count = counts[position] ?? 0;
      const [one, many] = POSITION_WORD[position];
      return `${count} ${count === 1 ? one : many}`;
    });
  if (parts.length === 0) return empty;
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}
