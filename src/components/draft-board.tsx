import type { BoardShape, Position } from "@/lib/engine";

import { CardName } from "./board";
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
 * the server, and `markedOverallNo` is the engine's word on where the marker
 * goes (invariant §1). This component maps a pick number to a place and paints
 * it.
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
 *
 * ## Why every word in a slot is ink
 *
 * Because the alternatives were measured, not eyeballed. The marker's own red
 * on the live blush is **4.15:1** — DESIGN.md forbids that pairing by name, and
 * the first version of this file shipped it on the one cell that matters most,
 * where the pick number is the slot's only text. The 10% position wash costs
 * roughly a tenth of every ratio on top of it, which drops `ink-faint` to 4.22
 * and the G/F/C letter's own hue to 4.21. So: the wash carries the position's
 * hue, the letter carries the position, and all three texts are ink or soft ink
 * and clear 5:1. Colour still never encodes position alone — the letter is
 * unconditional — it simply is not the letter that is coloured any more.
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

/**
 * A slot's material, spelled out.
 *
 * Written as a literal map rather than composed as `slot-${state}`, because
 * Tailwind only emits a utility it can *see* in the source: an interpolated
 * class name compiles to nothing, the rule silently does not exist, and the
 * board looks plausible in a screenshot with its whole state language missing.
 * `board.tsx` writes `SLOT_RULE` out for the same reason.
 */
const SLOT_RULE = {
  waiting: "slot-waiting",
  filled: "slot-filled",
  live: "slot-live",
  standing: "slot-standing",
} as const;

/** The wash that colours a filled slot by its position. Non-text, by design. */
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
  isPaused,
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
  /**
   * Which of the two things the marker means here. Solid marker plus the blush
   * is "pick now"; dashed marker with no fill is "this is where we resume".
   * One material for both was 3.1's own mistake.
   */
  isPaused: boolean;
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
  // about five members they hold their width and overflow.
  //
  // 8rem, not 6: at 6rem a slot had about 69px for a name once the position
  // letter had taken its share of the same line — roughly eight characters,
  // where "Valančiūnas" needs 90px and "Papanikolaou" more. The board could not
  // write the names it exists to write, on the one device it is designed for,
  // and the only recovery was a `title` tooltip, which does not exist on a
  // phone. So the letter moved up to the number line and the column went wide
  // enough for the longest surname this league will actually read. A phone
  // shows three columns instead of four; three readable columns beat four
  // truncated ones.
  const template = `2rem repeat(${shape.columns.length}, minmax(8rem, 1fr))`;

  const lastColumn = shape.columns.length - 1;

  return (
    <BoardScroll markedOverallNo={markedOverallNo} testId="draft-board">
      <div
        role="table"
        aria-label="Picks by round and member"
        className="min-w-full"
      >
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
          {/* Sticky and on stock, like the round numbers below it: without
              that, a member's name scrolls underneath the gutter and its tail
              shows through where the round numbers will be. `self-stretch`
              because the cell has no content of its own, and a background
              painted on a zero-height box hides nothing. */}
          <span
            role="columnheader"
            aria-label="Draft round"
            className="sticky left-0 z-10 self-stretch border-r border-b border-rule-strong bg-stock"
          />
          {columns.map((column, index) => (
            <span
              role="columnheader"
              key={column.memberId}
              title={column.name}
              className={`slot-label truncate border-b border-rule-strong px-1.5 pb-1 ${
                column.isYou ? "text-ink" : ""
              } ${index === lastColumn ? "border-r-2 border-r-rule-strong" : ""}`}
            >
              {column.name}
              {column.isYou ? " · you" : ""}
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
              {row.map((place, column) => {
                const entry = entries.get(place.overallNo);
                const isMarked = place.overallNo === markedOverallNo;
                // Three materials, and the marker means two different things.
                const state = entry
                  ? "filled"
                  : isMarked
                    ? isPaused
                      ? "standing"
                      : "live"
                    : "waiting";
                return (
                  <div
                    key={place.overallNo}
                    // `data-board-slot` is what the scrollport looks for, and
                    // `data-state="live"` is what the second motion event is
                    // keyed on — the same DOM contract `Slot` publishes.
                    data-board-slot=""
                    data-state={state}
                    // The marked slot, whichever of the two things it means, so
                    // the scrollport has one thing to follow.
                    data-live={isMarked ? "true" : undefined}
                    // So the marker rule travels the way this round is being
                    // drafted rather than always left to right.
                    data-reversed={reversed ? "true" : undefined}
                    data-testid={`board-slot-${place.overallNo}`}
                    role="cell"
                    className={`${SLOT_RULE[state]} ${
                      entry ? PATCH_WASH[entry.position] : ""
                    } flex min-h-slot min-w-0 flex-col justify-start gap-0.5 px-1.5 py-1 ${
                      // rule-strong, not rule: a 1px `rule` over a position
                      // wash measures 2.77:1, under this project's own 3:1
                      // floor for a boundary that means something. The board's
                      // outer edge is 2px of the same, so a closed board reads
                      // closed and an interior-weight edge means "more board
                      // this way" — scroll extent made of rule weight, which is
                      // the only material this system has for depth.
                      column === lastColumn
                        ? "border-r-2 border-r-rule-strong"
                        : "border-r border-rule-strong"
                    } ${isLastRound ? "border-b border-b-rule-strong" : ""}`}
                  >
                    <span className="flex items-baseline justify-between gap-1">
                      <span className="text-slot tabular-nums text-ink-soft">
                        {String(place.overallNo).padStart(2, "0")}
                        {/* CONTEXT.md's own word, and the same word the ticker
                            uses. It was "· A", which is a single letter in a
                            cell where single letters mean G, F or C — for the
                            one fact PRODUCT.md calls fairness-relevant. */}
                        {entry?.isAuto ? " · AUTO" : ""}
                      </span>
                      {/* The letter is always present: colour never carries
                          position on its own. Ink, not its own hue — see the
                          note at the top of this file. */}
                      {entry ? (
                        <span className="shrink-0 text-slot font-semibold text-ink-soft">
                          {entry.position}
                        </span>
                      ) : null}
                    </span>
                    {entry ? (
                      <span
                        className="min-w-0 truncate"
                        title={entry.playerName}
                      >
                        <CardName scale="slot">
                          {boardName(entry.playerName)}
                        </CardName>
                      </span>
                    ) : null}
                    {/* The board carried "on the clock" in a border weight, a
                        fill and a colour — none of which a screen reader can
                        see, so the live slot announced itself as the bare word
                        "13". The banner at the top of the room still said it,
                        so the page never lost the fact; the surface this app
                        calls its thesis did. */}
                    {isMarked ? (
                      <span className="sr-only">
                        {isPaused ? "the draft stands here" : "on the clock"}
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
