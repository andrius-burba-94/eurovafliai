import { describe, expect, it } from "vitest";

import { buildBoardShape } from "./board";
import { buildPickOrder, memberAt } from "./order";
import type { DraftFormat } from "./types";

/**
 * §5 of the draft-engine invariants applies here as much as to `order.ts`: the
 * board is order-derived, so every format, odd AND even member counts, the
 * minimum (2), the maximum (12) and the full 13 rounds have to be covered — and
 * the round boundaries where direction flips, which is where a board built from
 * its own parity arithmetic goes wrong.
 *
 * The load-bearing test is `agrees with buildPickOrder`. Everything else here
 * is a legibility check on top of it: if the grid ever disagreed with the
 * sequence the room's clock is driven by, the board would show a pick under the
 * wrong member's name while the app happily awarded it to the right one.
 */

const members = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));

const ROUNDS = 13;
const FORMATS: DraftFormat[] = ["linear", "snake", "snake3rr"];
const COUNTS = [2, 3, 4, 7, 11, 12];

/** The pick numbers of one row, left to right. */
const numbers = (row: readonly { overallNo: number }[]): number[] =>
  row.map((slot) => slot.overallNo);

describe("buildBoardShape — shape", () => {
  it.each(FORMATS)("%s is rounds rows deep and members wide", (format) => {
    for (const count of COUNTS) {
      const board = buildBoardShape(format, members(count), ROUNDS);
      expect(board.rows).toHaveLength(ROUNDS);
      expect(board.columns).toEqual(members(count));
      for (const row of board.rows) expect(row).toHaveLength(count);
    }
  });

  it.each(FORMATS)(
    "%s puts every pick number on the board exactly once",
    (format) => {
      for (const count of COUNTS) {
        const board = buildBoardShape(format, members(count), ROUNDS);
        const all = board.rows.flatMap(numbers).sort((a, b) => a - b);
        expect(all).toEqual(
          Array.from({ length: count * ROUNDS }, (_, i) => i + 1),
        );
      }
    },
  );

  it.each(FORMATS)(
    "%s keeps a column to one member, top to bottom",
    (format) => {
      // The whole reason columns are members rather than slots: a column has to
      // be one person's roster or a snake board is unreadable.
      const board = buildBoardShape(format, members(6), ROUNDS);
      for (const [column, memberId] of board.columns.entries()) {
        for (const row of board.rows) {
          expect(row[column]!.memberId).toBe(memberId);
        }
      }
    },
  );
});

describe("buildBoardShape — agrees with buildPickOrder", () => {
  // If this passes for a format, the board is right for that format. It is the
  // reason this module reads the sequence instead of re-deriving direction.
  it.each(FORMATS)(
    "%s: every place on the board is owned by the member the order says",
    (format) => {
      for (const count of COUNTS) {
        const memberIds = members(count);
        const sequence = buildPickOrder(format, memberIds, ROUNDS);
        const board = buildBoardShape(format, memberIds, ROUNDS);

        for (const row of board.rows) {
          for (const place of row) {
            expect(
              memberAt(sequence, place.overallNo),
              `${format}/${count}: pick ${place.overallNo}`,
            ).toBe(place.memberId);
          }
        }
      }
    },
  );

  it.each(FORMATS)(
    "%s: a place's slot is its position within its own round",
    (format) => {
      for (const count of COUNTS) {
        const board = buildBoardShape(format, members(count), ROUNDS);
        for (const row of board.rows) {
          for (const place of row) {
            expect(place.overallNo).toBe(
              (place.round - 1) * count + place.slot,
            );
          }
          // Every slot 1…n used once in the row, which is the same statement as
          // "nobody picks twice in a round" seen from the board's side.
          expect(new Set(row.map((place) => place.slot)).size).toBe(count);
        }
      }
    },
  );
});

describe("buildBoardShape — direction, read off the board", () => {
  it("linear: every row counts up left to right", () => {
    const board = buildBoardShape("linear", members(4), 3);
    expect(numbers(board.rows[0]!)).toEqual([1, 2, 3, 4]);
    expect(numbers(board.rows[1]!)).toEqual([5, 6, 7, 8]);
    expect(numbers(board.rows[2]!)).toEqual([9, 10, 11, 12]);
  });

  it("snake: even rows count down, so the first column waits longest", () => {
    const board = buildBoardShape("snake", members(4), 4);
    expect(numbers(board.rows[0]!)).toEqual([1, 2, 3, 4]);
    expect(numbers(board.rows[1]!)).toEqual([8, 7, 6, 5]);
    expect(numbers(board.rows[2]!)).toEqual([9, 10, 11, 12]);
    expect(numbers(board.rows[3]!)).toEqual([16, 15, 14, 13]);
  });

  it("snake3rr: round 3 repeats round 2's direction, and everything after flips", () => {
    // The naive "reverse even rounds except round 3" is wrong from round 4 on,
    // and this is where a board reasoning about parity itself would show it.
    const board = buildBoardShape("snake3rr", members(4), 6);
    expect(numbers(board.rows[0]!)).toEqual([1, 2, 3, 4]);
    expect(numbers(board.rows[1]!)).toEqual([8, 7, 6, 5]);
    expect(numbers(board.rows[2]!)).toEqual([12, 11, 10, 9]);
    expect(numbers(board.rows[3]!)).toEqual([13, 14, 15, 16]);
    expect(numbers(board.rows[4]!)).toEqual([20, 19, 18, 17]);
    expect(numbers(board.rows[5]!)).toEqual([21, 22, 23, 24]);
  });

  it("snake with an odd member count still turns at the boundary", () => {
    const board = buildBoardShape("snake", members(3), 3);
    expect(numbers(board.rows[0]!)).toEqual([1, 2, 3]);
    expect(numbers(board.rows[1]!)).toEqual([6, 5, 4]);
    expect(numbers(board.rows[2]!)).toEqual([7, 8, 9]);
  });

  it("two members, thirteen rounds: the board ends on a forward row", () => {
    // 13 is odd, so plain snake drafts the last round left to right — which is
    // why a 13-round draft hands the last pick of all to the *last* column and
    // the first pick of the round to the first. Written out because the first
    // draft of this test assumed the final row was reversed.
    const board = buildBoardShape("snake", members(2), ROUNDS);
    expect(numbers(board.rows[11]!)).toEqual([24, 23]);
    expect(numbers(board.rows[12]!)).toEqual([25, 26]);
  });

  it("twelve members: the 13th round is picks 145 to 156, forward", () => {
    const board = buildBoardShape("snake", members(12), ROUNDS);
    expect(numbers(board.rows[12]!)).toEqual([
      145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156,
    ]);
  });
});

describe("buildBoardShape — refusals", () => {
  // Delegated to buildPickOrder on purpose; these assert the delegation holds,
  // so a board can never be laid out for a draft that could not be run.
  it("refuses an empty order", () => {
    expect(() => buildBoardShape("snake", [], ROUNDS)).toThrow(
      /at least one member/,
    );
  });

  it("refuses a duplicated member", () => {
    expect(() => buildBoardShape("snake", ["A", "B", "A"], ROUNDS)).toThrow(
      /duplicate/,
    );
  });

  it("refuses a nonsense round count", () => {
    expect(() => buildBoardShape("snake", members(4), 0)).toThrow(
      /positive integer/,
    );
    expect(() => buildBoardShape("snake", members(4), 1.5)).toThrow(
      /positive integer/,
    );
  });
});
