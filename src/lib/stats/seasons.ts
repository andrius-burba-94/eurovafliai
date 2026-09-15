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
