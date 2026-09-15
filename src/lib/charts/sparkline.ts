/**
 * The last-five sparkline, as arithmetic — slice 10.6.
 *
 * Pure, and separate from the component that draws it, for the reason
 * `rowSentence` is separate from `RosterRadar`: the marks are `aria-hidden`, so
 * the **sentence is the entire content** for a screen-reader user, and a string
 * nothing tests is a string that ships reading "3 games that do not fit".
 *
 * There is no chart library here and there will not be one. DESIGN.md's rule for
 * drawn marks is one stroke, `currentColor`, no fill, no package — so what this
 * module produces is a `points` attribute for a `<polyline>` and a sentence.
 */

/**
 * The drawing box, in user units rather than pixels.
 *
 * A viewBox rather than a pixel size so the same path scales to the 40px cell on
 * a pool row and the wider one on a player page without recomputing anything.
 * 5:2 because five marks in a taller box exaggerates a one-point wobble into a
 * cliff — the aspect ratio *is* an editorial claim about how big a swing looks.
 */
export const SPARK_WIDTH = 50;
export const SPARK_HEIGHT = 20;

/**
 * Half a stroke of padding at the top and bottom, so the highest and lowest
 * marks are drawn fully rather than clipped in half by the viewBox edge.
 */
const PAD = 1;

/**
 * A `points` string for a `<polyline>`, or `null` when there is nothing to draw.
 *
 * **Two values is the floor.** One game is a dot, not a line, and a single mark
 * in a box that means "recent form" reads as a flat trend rather than as an
 * absence of one. Below two, callers render nothing at all — the same rule
 * `FixtureNote` follows, for the same reason: an empty affordance is honest, a
 * misleading one is not.
 *
 * The series is normalized to **its own range**, not to a fixed PIR scale. A
 * sparkline is about shape, and a shared scale would flatten every honest player
 * into a straight line somewhere near the bottom of a box sized for Doncic. The
 * cost is that the marks carry no absolute magnitude, which is exactly why the
 * numbers are in the sentence beside them and the average is in the cell before
 * them. A flat series draws down the middle rather than along the floor, because
 * a run of identical games is "steady", not "as bad as possible".
 */
export function sparklinePoints(values: readonly number[]): string | null {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const usable = SPARK_HEIGHT - PAD * 2;
  const step = SPARK_WIDTH / (values.length - 1);

  return values
    .map((value, index) => {
      const x = index * step;
      // SVG's y grows downward, so a bigger number must produce a smaller y.
      const y = span === 0 ? SPARK_HEIGHT / 2 : PAD + (1 - (value - min) / span) * usable;
      return `${round(x)},${round(y)}`;
    })
    .join(" ");
}

/** Two decimals, and no `-0`. Keeps the emitted attribute stable across runs. */
function round(value: number): number {
  const out = Math.round(value * 100) / 100;
  return out === 0 ? 0 : out;
}

/**
 * What the picture says out loud.
 *
 * Says the numbers, oldest first, and then the direction — because "12, 4, 18"
 * is the evidence and "up" is the reading, and a reader who only hears the
 * reading cannot disagree with it. The direction compares the last value with
 * the first, which is what a five-point sparkline actually depicts; a trend line
 * would be a different and more confident claim than five marks support.
 *
 * `format` exists because half this app's figures are stored as **integer
 * tenths**. A standings sparkline drawn from `byRound` would otherwise say
 * "120, 85, 40" to a screen reader while the row beside it showed 12.0, 8.5 and
 * 4.0 — two numbers for one fact, and the spoken one wrong by a factor of ten.
 * The default is deliberately `String`, so the callers holding whole PIR need
 * to pass nothing.
 */
export function sparklineSentence(
  values: readonly number[],
  what: string,
  format: (value: number) => string = String,
): string {
  if (values.length === 0) return `No ${what} yet.`;
  if (values.length === 1) return `One game: ${format(values[0]!)} ${what}.`;

  const first = values[0]!;
  const last = values[values.length - 1]!;
  const direction =
    last > first ? "trending up" : last < first ? "trending down" : "level";
  return `Last ${values.length} games, oldest first: ${values
    .map(format)
    .join(", ")} ${what} — ${direction}.`;
}
