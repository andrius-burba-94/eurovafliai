import type { Position, RadarRow, RadarSlot } from "@/lib/engine";

import type { BoardColumn } from "./draft-board";

/**
 * The roster radar — slice 3.2.
 *
 * One row per member, one mark per roster slot, grouped the way the template
 * is written: five guards, five forwards, three centres. It answers the
 * question the room asks out loud all evening and the board cannot — *who
 * still needs a centre* — because the board is sorted by when a pick happened
 * and this is sorted by what a roster is missing.
 *
 * Rows are in draft order, so the radar reads down the same order the board
 * reads across, and both zip against one `columns` array.
 *
 * ## The marks are a picture; the sentence is the content
 *
 * Thirteen 18px divs are a visualization, and to a screen reader they are
 * thirteen announcements of nothing. So the grid is `aria-hidden` and every row
 * carries an `sr-only` sentence instead — "B Ballers, 3 of 13 — needs 3 guards,
 * 4 forwards, 3 centres" — which is the same fact said properly rather than the
 * same fact said 156 times. The board does the opposite, and correctly: its
 * cells carry names, so they are content and are announced.
 *
 * ## Why it fits a phone when the board does not
 *
 * Because a mark is not a name. The board needs 8rem a column to write
 * "Valančiūnas" and therefore has to scroll; a radar slot needs to say only
 * *filled* or *waiting*, so thirteen of them and a member's name sit inside
 * 350px with room to spare. Same material as the board — dashed rule waiting,
 * solid rule and a position wash filled — at the one scale where the whole
 * league is visible at once.
 */

const PATCH_WASH: Record<Position, string> = {
  G: "bg-pos-g/10",
  F: "bg-pos-f/10",
  C: "bg-pos-c/10",
};

const POSITION_WORD: Record<Position, [string, string]> = {
  G: ["guard", "guards"],
  F: ["forward", "forwards"],
  C: ["centre", "centres"],
};

/** "3 guards, 4 forwards and 3 centres", or "nothing — the roster is full". */
function needsSentence(needs: Record<Position, number>): string {
  const parts = (["G", "F", "C"] as const)
    .filter((position) => needs[position] > 0)
    .map((position) => {
      const [one, many] = POSITION_WORD[position];
      return `${needs[position]} ${needs[position] === 1 ? one : many}`;
    });
  if (parts.length === 0) return "nothing — the roster is full";
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/**
 * Where a position's run begins, so the groups read as 5 | 5 | 3 rather than as
 * thirteen undifferentiated marks. Derived from the slots themselves — the
 * template is already baked into them, and reading it twice is how the two
 * would disagree.
 */
const startsGroup = (slots: readonly RadarSlot[], index: number): boolean =>
  index > 0 && slots[index]!.position !== slots[index - 1]!.position;

export function RosterRadar({
  rows,
  columns,
  total,
}: {
  rows: readonly RadarRow[];
  /** Ordered exactly as `rows` — the same array the board's columns come from. */
  columns: readonly BoardColumn[];
  /** Slots per roster, for the "3 of 13". */
  total: number;
}) {
  // The same guard the board carries, for the same reason: a mismatch here
  // would put every member's name against somebody else's roster, and it would
  // look entirely plausible.
  if (rows.length !== columns.length) {
    throw new Error(
      `RosterRadar: ${columns.length} member labels for ${rows.length} rosters.`,
    );
  }

  return (
    <ul role="list" data-testid="roster-radar" className="flex flex-col">
      {rows.map((row, index) => {
        const column = columns[index]!;
        return (
          <li
            key={row.memberId}
            data-testid="radar-row"
            data-member={row.memberId}
            className={`flex items-center gap-2 border-t border-rule py-1.5 ${
              column.isYou ? "border-t-rule-strong" : ""
            }`}
          >
            <span
              title={column.name}
              className={`slot-label w-[5.5rem] shrink-0 truncate ${
                column.isYou ? "text-ink" : ""
              }`}
            >
              {column.name}
              {column.isYou ? " · you" : ""}
            </span>

            {/* The picture. Said properly in the sentence below it. */}
            {/* `gap-0.5`, not `gap-px`: at a hairline's separation the twelve
                dashed empties merged into one dashed line, so the row read as a
                progress bar and you could not count thirteen slots. The
                Board-Shows-Its-Shape rule applies at this scale too. */}
            <span
              aria-hidden="true"
              className="flex flex-1 items-center gap-0.5"
            >
              {row.slots.map((slot, slotIndex) => (
                <span
                  key={`${slot.position}${slot.index}`}
                  data-testid="radar-slot"
                  data-state={slot.overallNo === null ? "waiting" : "filled"}
                  data-position={slot.position}
                  className={`h-4 flex-1 ${
                    slot.overallNo === null
                      ? "border-t border-dashed border-rule"
                      : `border-t border-rule-strong ${PATCH_WASH[slot.position]}`
                  } ${startsGroup(row.slots, slotIndex) ? "ml-1.5" : ""}`}
                />
              ))}
              {/* A pick that does not fit the template. There should never be
                  one — `isLegalPick` refuses it and every write path re-checks
                  — so it is struck in ink as the correction it would be rather
                  than dropped, which would hide the referee failing. */}
              {row.overflow.map((slot) => (
                <span
                  key={`over${slot.index}`}
                  data-testid="radar-overflow"
                  className="slot-correction ml-1.5 h-4 flex-1"
                />
              ))}
            </span>

            <span className="slot-label shrink-0 tabular-nums">
              {row.filled}/{total}
            </span>

            <span className="sr-only">
              {column.name}
              {column.isYou ? ", you" : ""}: {row.filled} of {total} filled,
              needs {needsSentence(row.needs)}
              {row.overflow.length > 0
                ? `, and ${row.overflow.length} pick${
                    row.overflow.length === 1 ? "" : "s"
                  } that do not fit the roster template`
                : ""}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
