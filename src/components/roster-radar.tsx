import type { Position, RadarRow, RadarSlot } from "@/lib/engine";

import type { BoardColumn } from "./draft-board";

/**
 * The roster radar — slice 3.2.
 *
 * One row per member, one mark per roster slot, in three labelled runs: guards,
 * forwards, centers. Each run prints **what that member still needs**, because
 * that is the question the room asks out loud all evening and the board cannot
 * answer — the board is sorted by when a pick happened, this by what a roster
 * is missing.
 *
 * Rows are in draft order, so the radar reads down the same order the board
 * reads across, and both zip against one `columns` array.
 *
 * ## The figure is the answer; the marks are the shape
 *
 * The first version of this printed `filled/total` — "11/13" — and put the
 * needs in a screen-reader sentence only. So the surface whose whole subject is
 * *who still needs a center* showed sighted users how **full** a roster was, a
 * number the board's own heading already gives, and hid what it was missing.
 * Worse, it could not be recovered by counting: measured in a browser, thirteen
 * waiting marks render as three continuous dashed rules, because Chromium's
 * dash gap for a 1px dashed border is 2px and the gap between slots was also
 * 2px — so a slot boundary was pixel-identical to a dash gap. Filled marks were
 * countable; the empty ones, which are the ones you would want to count, were
 * not.
 *
 * So the need is printed per run, and the marks are what they should always
 * have been: the shape of a roster, not a number to be decoded.
 *
 * ## Why the runs are labelled after all
 *
 * The locked decision was that a *mark* does not print G / F / C — right, at
 * 156 marks. That got quietly extended to the table, leaving the one grid in
 * the app whose axis was unnamed. And the fallback did not hold: measured under
 * a severity-1.0 deuteranopia simulation, the guard wash and the center wash
 * are **pixel-identical** (ΔE76 = 0.00; protanopia 0.36). So "colour is the
 * third signal" was really "place is the only signal", and place was
 * unlabelled. `DraftBoard` names its columns; the pool's filters name G, F and
 * C on their own rules. A table naming its axis once is not a per-cell letter.
 *
 * The wash stays, and this docstring no longer oversells it: at 1.14:1 against
 * stock it is decoration. What actually separates filled from waiting is form —
 * a solid `rule-strong` rule over a filled box (4.37:1) against a dashed `rule`
 * hairline (3.15:1) — which survives grayscale and every CVD simulation.
 */

const PATCH_WASH: Record<Position, string> = {
  G: "bg-pos-g/10",
  F: "bg-pos-f/10",
  C: "bg-pos-c/10",
};

const POSITION_WORD: Record<Position, [string, string]> = {
  G: ["guard", "guards"],
  F: ["forward", "forwards"],
  C: ["center", "centers"],
};

/** "3 guards, 4 forwards and 3 centers", or "nothing" when a roster is full. */
function needsSentence(needs: Record<Position, number>): string {
  const parts = (["G", "F", "C"] as const)
    .filter((position) => needs[position] > 0)
    .map((position) => {
      const [one, many] = POSITION_WORD[position];
      return `${needs[position]} ${needs[position] === 1 ? one : many}`;
    });
  if (parts.length === 0) return "nothing";
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/**
 * The whole row, spoken.
 *
 * Assembled as separate sentences rather than one clause chain, which the first
 * version got wrong in three ways at once: it read "needs nothing — the roster
 * is full, and 1 pick that do not fit", grafting the surplus onto *needs* (so
 * the member appeared to need the illegal pick), disagreeing a singular noun
 * with a plural verb, and leaving an em-dash aside unclosed. It was also the
 * only branch of this function with no test.
 */
export function rowSentence(
  row: RadarRow,
  column: BoardColumn,
  total: number,
  onClock = false,
): string {
  const who = `${column.name}${column.isYou ? ", you" : ""}${
    onClock ? ", on the clock" : ""
  }`;
  const surplus =
    row.overflow.length === 0
      ? ""
      : ` ${row.overflow.length} ${
          row.overflow.length === 1 ? "pick does" : "picks do"
        } not fit the roster template.`;
  return `${who}: ${row.filled} of ${total} filled, needs ${needsSentence(
    row.needs,
  )}.${surplus}`;
}

/** The slots of one position, in template order, with that run's remaining need. */
type RadarGroup = {
  readonly position: Position;
  readonly slots: RadarSlot[];
  readonly need: number;
};

/**
 * Group a row's flat slots into its runs.
 *
 * Derived from the slots rather than from a second reading of the template —
 * `buildRadar` already ordered them, and reading the template twice is how the
 * two would disagree when the blueprint's eleven-man-roster question lands.
 */
function groupsOf(row: RadarRow): RadarGroup[] {
  const groups: RadarGroup[] = [];
  for (const slot of row.slots) {
    const last = groups.at(-1);
    if (last && last.position === slot.position) {
      last.slots.push(slot);
      continue;
    }
    groups.push({
      position: slot.position,
      slots: [slot],
      need: row.needs[slot.position],
    });
  }
  return groups;
}

export function RosterRadar({
  rows,
  columns,
  total,
  onClockMemberId,
}: {
  rows: readonly RadarRow[];
  /** Ordered exactly as `rows` — the same array the board's columns come from. */
  columns: readonly BoardColumn[];
  /** Slots per roster, for the spoken "3 of 13". */
  total: number;
  /**
   * The member on the clock, or null when nobody is.
   *
   * CONTEXT.md calls this surface "filling live", and it was the one live
   * surface in the room with no marker on the live member at all — so the
   * question "whose turn is it, and what do they need" took two surfaces to
   * answer. Marked in the row's own material: the marker rule, which is what
   * red means everywhere else in this app.
   */
  onClockMemberId: string | null;
}) {
  // The same guard the board carries, for the same reason: a mismatch here
  // would put every member's name against somebody else's roster, and it would
  // look entirely plausible.
  if (rows.length !== columns.length) {
    throw new Error(
      `RosterRadar: ${columns.length} member labels for ${rows.length} rosters.`,
    );
  }

  // Every row has the same runs, so the heads come off the first one.
  const heads = rows[0] ? groupsOf(rows[0]) : [];

  return (
    <div className="flex flex-col">
      {/* The axis, named once. `aria-hidden` because every row's sentence
          already names its positions in words. */}
      {heads.length > 0 ? (
        <div aria-hidden="true" className="flex items-end gap-2 pb-1">
          <span className="w-[5.5rem] shrink-0 sm:w-44" />
          {/* Right-aligned, so each letter sits directly above its own figure
              rather than above the run of marks: the question is "how many
              centers does D Ballers need", and the answer should be a
              one-step lookup down a labelled column. */}
          <span className="flex flex-1 items-end gap-2">
            {heads.map((group) => (
              <span
                key={group.position}
                data-testid="radar-head"
                className="slot-label text-right"
                style={{ flex: `${group.slots.length} 1 0%` }}
              >
                {group.position}
              </span>
            ))}
          </span>
        </div>
      ) : null}

      <ul
        role="list"
        data-testid="roster-radar"
        // Closes the run at the heavier weight, the way every other list in
        // this app does. `Slots` has always done it; the first version of this
        // component just stopped, and DESIGN.md's own words are that a list
        // which just stops is not a board.
        className="flex flex-col border-b border-rule-strong"
      >
        {rows.map((row, index) => {
          const column = columns[index]!;
          const groups = groupsOf(row);
          return (
            <li
              key={row.memberId}
              data-testid="radar-row"
              data-member={row.memberId}
              data-on-clock={
                row.memberId === onClockMemberId ? "true" : undefined
              }
              // The same DOM contract `Slot` publishes, so a row's material is
              // readable without parsing class strings.
              data-state={row.memberId === onClockMemberId ? "live" : "filled"}
              // `slot-filled` — a solid `rule-strong` divider, a full contrast
              // step away from the dashed `rule` data below it. It used to be
              // solid `rule`: the same colour as an empty mark's own rule,
              // differing only in dash phase, so the eye read two parallel
              // lines per row instead of thirteen slots. Solid 1px `rule` is
              // also a material `globals.css` does not have.
              //
              // The member on the clock takes `slot-live` instead: the marker
              // rule and the blush, which is what red means on every other
              // surface here.
              className={`flex items-center gap-2 py-1.5 ${
                row.memberId === onClockMemberId ? "slot-live" : "slot-filled"
              }`}
            >
              {/* Your own row is `text-ink` and `· you`, and nothing else,
                  which is exactly what the board does for your column. The
                  heavier rule this used to carry bought 1.39:1 on a hairline,
                  and DESIGN.md claimed — wrongly — that the board did the same.
                  No `title`: the board argued a hover tooltip does not exist on
                  a phone, and the column is wider here instead. */}
              <span
                className={`slot-label w-[5.5rem] shrink-0 truncate sm:w-44 ${
                  column.isYou ? "text-ink" : ""
                }`}
              >
                {column.name}
                {column.isYou ? " · you" : ""}
              </span>

              {/* The picture. Said properly in the sentence below it. */}
              <span
                aria-hidden="true"
                className="flex flex-1 items-center gap-2"
              >
                {groups.map((group) => (
                  <span
                    key={group.position}
                    className="flex items-center gap-0.5"
                    style={{ flex: `${group.slots.length} 1 0%` }}
                  >
                    {group.slots.map((slot) => (
                      <span
                        key={`${slot.position}${slot.index}`}
                        data-testid="radar-slot"
                        data-state={
                          slot.overallNo === null ? "waiting" : "filled"
                        }
                        data-position={slot.position}
                        className={`h-4 flex-1 ${
                          slot.overallNo === null
                            ? "border-t border-dashed border-rule"
                            : `border-t border-rule-strong ${PATCH_WASH[slot.position]}`
                        }`}
                      />
                    ))}
                    {/* The answer, printed. Blank at zero, in a fixed-width box
                        so a run never shifts under its own head — which is what
                        the old trailing `11/13` did, pulling every mark 7.5px
                        left the moment a count reached two digits. */}
                    <span
                      data-testid="radar-need"
                      className={`ml-0.5 w-2.5 shrink-0 text-right text-slot tabular-nums ${
                        group.need > 0 ? "text-ink" : "text-ink-faint"
                      }`}
                    >
                      {group.need > 0 ? group.need : ""}
                    </span>
                  </span>
                ))}
                {/* A pick that does not fit the template. There should never be
                    one — `isLegalPick` refuses it and every write path
                    re-checks — so it is struck in ink as the correction it
                    would be rather than dropped, which would hide the referee
                    failing. Fixed width, so a surplus does not shrink the
                    thirteen real marks beside it. */}
                {row.overflow.map((slot) => (
                  <span
                    key={`over${slot.index}`}
                    data-testid="radar-overflow"
                    className="slot-correction ml-1 h-4 w-3 shrink-0"
                  />
                ))}
              </span>

              <span className="sr-only">
                {rowSentence(
                  row,
                  column,
                  total,
                  row.memberId === onClockMemberId,
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
