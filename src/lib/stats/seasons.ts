/**
 * Season-code arithmetic. Pure, and the only copy.
 *
 * `E2026` → `E2025`: a letter and a year, and there is no gap year in this
 * competition. Trivial, and it existed twice — in `scripts/prev-season.mts`
 * and again in the worker when 9.1's one-off import became something the
 * worker does on boot. Two copies of a rule is how the two come to disagree
 * about a season code, which would silently import the wrong year's averages
 * onto every player in the pool.
 *
 * It returns `null` rather than throwing, because its callers want different
 * things from a bad code: the script refuses and tells you to pass `--season=`,
 * the worker shrugs and carries on enforcing pick deadlines. Throwing would
 * have forced the worker to catch, and a boot path that catches an exception it
 * caused is harder to read than one that checks a value.
 */
export function previousSeasonOf(code: string): string | null {
  const match = /^([A-Za-z]+)(\d{4})$/.exec(code.trim());
  if (!match) return null;
  return `${match[1]}${Number(match[2]) - 1}`;
}

/**
 * Whether `season` comes before `current` — 7.2 B.
 *
 * Pool averages and standings are caches of the season being played, and a
 * past season's lines (loaded for the scout) must never rebuild them. A later
 * season is not past: the E2E specs score a sandbox `E2099` beside the real
 * one. An unreadable code is not past either, so a typo rebuilds rather than
 * silently doing nothing.
 */
export function isPastSeason(season: string, current: string): boolean {
  const year = (code: string) => /^[A-Za-z]+(\d{4})$/.exec(code.trim())?.[1];
  const a = year(season);
  const b = year(current);
  return a !== undefined && b !== undefined && Number(a) < Number(b);
}
