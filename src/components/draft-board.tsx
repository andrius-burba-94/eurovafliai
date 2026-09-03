import type { BoardShape, Position } from "@/lib/engine";

import { BoardScroll } from "./board-scroll";

/**
 * The draft board — slice 3.1, and the surface this whole app is named after.
 *
 * Rounds down, members across, every slot on the wall whether it is filled or
 * not: DESIGN.md's Board-Shows-Its-Shape rule at full size, and the answer to
 * its open question 2. `BoardPlan` stays where it is — the login page and the
 * lobby have no draft to draw, so an authored depiction of an empty board is
 * still the honest thing to show there. This is its data-carrying sibling, and
 * the two are deliberately the same object seen at two scales: same ruling,
 * same round numbers down the left edge, same heavy frame.
 *
 * ## What it is not allowed to do
 *
 * Decide anything. The shape comes from `buildBoardShape`, the picks come from
 * the server, and `liveOverallNo` is the engine's word on who is on the clock
 * (invariant §1). This component maps a pick number to a place and paints it.
 *
 * ## Semantics
 *
 * Grid layout, table roles. A rounds × members wall genuinely is tabular data —
 * the round is a row header and the member is a column header, and a screen
 * reader that cannot say "round 4, Marius: De Colo" is reading a texture. A
 * real `<table>` would give that for free but not the column widths this needs:
 * a fixed-layout table divides the container it is given, and this board has to
 * overflow it so it can scroll. So the rows are grids with one shared template
 * — every row is the same width, so every row's tracks resolve identically —
 * and the roles are stated rather than inherited.
 */

export type BoardColumn = {
  readonly memberId: string;
  readonly name: string;
  readonly isYou: boolean;
};

/** A pick, as the board needs it: who was written into this slot. */
export type BoardEntry = {
  readonly playerName: string;
  readonly position: Position;
  readonly isAuto: boolean;
};

const PATCH_TEXT: Record<Position, string> = {
  G: "text-pos-g",
  F: "text-pos-f",
  C: "text-pos-c",
};

/** The wash that colours a filled slot by its position. */
const PATCH_WASH: Record<Position, string> = {
  G: "bg-pos-g/10",
  F: "bg-pos-f/10",
  C: "bg-pos-c/10",
};

/**
 * What a board writes in a slot: the surname.
 *
 * Ingestion stores "Surname, First" (`normalize.ts`), which is already the
 * order a board wants — it just does not have room for the rest. A name with no
 * comma is written whole rather than guessed at, because a CSV-imported pool
 * may not follow the API's convention and "Nando De Colo" must not become "De".
 */
export function boardName(playerName: string): string {
  const comma = playerName.indexOf(",");
  return comma === -1 ? playerName : playerName.slice(0, comma).trim();
}

export function DraftBoard({
  shape,
  columns,
  entries,
  markedOverallNo,
}: {
  shape: BoardShape;
  /** Ordered exactly as `shape.columns` — column 0 drafts first in round 1. */
  columns: readonly BoardColumn[];
  /** Picks by `overall_no`. A slot with no entry is still drawn. */
  entries: ReadonlyMap<number, BoardEntry>;
  /**
   * The slot the marker is on, decided by the engine in `getDraftView`: whoever
   * is on the clock, or — while paused — where the draft stands. Null on a
   * finished board, which has no next slot.
   */
  markedOverallNo: number | null;
}) {
  // A mismatch here would shift or overflow every cell on the board — the same
  // invisible failure as the gutter-header bug below, and the reason both are
  // guarded rather than described. Loud beats a board that names the wrong
  // person above every column.
  if (columns.length !== shape.columns.length) {
    throw new Error(
      `DraftBoard: ${columns.length} column labels for a ${shape.columns.length}-column board.`,
    );
  }

  // The round gutter, then one track per member. Counted off the *shape*, which
  // is where the cells come from. `minmax` is what makes the board scroll
  // instead of squeezing: with room to spare the columns share it, and past
  // about six members they hold their width and overflow.
  const template = `2rem repeat(${shape.columns.length}, minmax(6rem, 1fr))`;

  return (
    <BoardScroll markedOverallNo={markedOverallNo} testId="draft-board">
      <div role="table" aria-label="The draft board" className="min-w-full">
        {/* The heavy rule under the names is drawn per cell, not on the row.
            A row's border box is only as wide as the scrollport, while its
            tracks overflow it — so a row-level border on a twelve-member board
            stops halfway across and the rest of the header has no underline
            once you scroll right. The last round's bottom rule is per cell for
            the same reason. */}
        <div
          role="row"
          className="grid items-end gap-0"
          style={{ gridTemplateColumns: template }}
        >
          {/* In flow, and only its *text* hidden. `sr-only` is absolutely
              positioned, so making this whole span visually-hidden took it out
              of the grid and slid every member's name one column to the left —
              a board that named the wrong person above every column, which a
              screenshot shows only if you already know the draft order. */}
          {/* Sticky and on stock, like the round numbers below it: without
              that, a member's name scrolls underneath the gutter and its tail
              shows through where the round numbers will be. */}
          <span
            role="columnheader"
            aria-label="Round"
            // `self-stretch` because its only child is `sr-only` and therefore
            // absolutely positioned: without it the cell has no height, and a
            // background painted on nothing hides nothing.
            className="sticky left-0 z-10 self-stretch border-r border-b border-rule-strong bg-stock"
          >
            <span className="sr-only">Round</span>
          </span>
          {columns.map((column) => (
            <span
              role="columnheader"
              key={column.memberId}
              title={column.name}
              className={`slot-label truncate border-b border-rule-strong px-1.5 pb-1 ${
                column.isYou ? "text-ink" : ""
              }`}
            >
              {column.name}
              {column.isYou ? " · you" : ""}
            </span>
          ))}
        </div>

        {shape.rows.map((row, index) => {
          const isLastRound = index === shape.rows.length - 1;
          // Slot 1 drafts first, so a row whose leftmost column does not hold
          // slot 1 is a round being drafted right to left.
          const reversed = row[0]!.slot !== 1;
          return (
            <div
              role="row"
              key={row[0]?.round ?? index}
              className="grid"
              style={{ gridTemplateColumns: template }}
            >
              {/* Round numbers down the left edge, exactly as BoardPlan draws
                  them: without them the board is a texture. Sticky, so the row
                  you are looking at stays labelled while the columns move. */}
              <span
                role="rowheader"
                className="sticky left-0 z-10 border-r border-rule-strong bg-stock pt-1 pr-1.5 text-right text-slot tabular-nums text-ink-faint"
              >
                {row[0]?.round ?? index + 1}
              </span>
              {row.map((place) => {
                const entry = entries.get(place.overallNo);
                const isLive = place.overallNo === markedOverallNo;
                const state = entry
                  ? "slot-filled"
                  : isLive
                    ? "slot-live"
                    : "slot-waiting";
                return (
                  <div
                    key={place.overallNo}
                    // `data-board-slot` is what the scrollport looks for, and
                    // what the second motion event is keyed on. `data-state`
                    // is the same DOM contract `Slot` publishes.
                    data-board-slot=""
                    data-state={entry ? "filled" : isLive ? "live" : "waiting"}
                    data-live={isLive ? "true" : undefined}
                    // So the marker rule travels the way this round is being
                    // drafted rather than always left to right.
                    data-reversed={reversed ? "true" : undefined}
                    data-testid={`board-slot-${place.overallNo}`}
                    role="cell"
                    className={`${state} ${
                      entry ? PATCH_WASH[entry.position] : ""
                    } flex min-h-slot min-w-0 flex-col justify-start gap-0.5 border-r border-rule px-1.5 py-1 ${
                      isLastRound ? "border-b border-b-rule-strong" : ""
                    }`}
                  >
                    <span
                      className={`text-slot tabular-nums ${
                        isLive ? "text-live" : "text-ink-faint"
                      }`}
                    >
                      {String(place.overallNo).padStart(2, "0")}
                      {entry?.isAuto ? " · A" : ""}
                    </span>
                    {entry ? (
                      <span className="flex min-w-0 items-baseline gap-1">
                        <span
                          className="truncate text-xs font-semibold uppercase tracking-[0.04em]"
                          title={entry.playerName}
                        >
                          {boardName(entry.playerName)}
                        </span>
                        {/* The letter is always present: colour never carries
                            position on its own. */}
                        <span
                          className={`${PATCH_TEXT[entry.position]} shrink-0 text-slot font-semibold`}
                        >
                          {entry.position}
                        </span>
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </BoardScroll>
  );
}
