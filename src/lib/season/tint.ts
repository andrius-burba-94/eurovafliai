/**
 * A round's finish as a colour: gold for first, `loss` for last, mixed into
 * the panel so the number printed on it reads in both grounds. The waffle
 * board, the standings and a team's own row share it, so one finish is one
 * colour everywhere.
 */
export function placeTint(place: number, teams: number): string {
  const towardLast = teams > 1 ? Math.round(((place - 1) / (teams - 1)) * 100) : 0;
  // Gold to loss in OKLCH (the short way round, through orange); into the
  // panel in OKLab, because OKLCH would swing the hue toward the panel's own
  // blue and print a winner in teal on the dark ground.
  return `color-mix(in oklab, color-mix(in oklch, var(--color-loss) ${towardLast}%, var(--color-gold)) 42%, var(--color-stock-panel))`;
}

/** 1 + the teams that outscored this one that night. */
export function nightPlace(points: number, all: readonly number[]): number {
  return 1 + all.filter((other) => other > points).length;
}
