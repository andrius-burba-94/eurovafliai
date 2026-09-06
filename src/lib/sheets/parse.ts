import { splitCsvLine } from "@/lib/csv/split";

/**
 * Reading a pasted cheat sheet — slice 3.4.
 *
 * Pure: text in, rows out, every unreadable line reported rather than thrown.
 * The same discipline as the roster CSV (2.1b), for the same reason — this is
 * the door somebody uses at eleven at night before a draft, and a parser that
 * throws on line 40 of 60 tells them nothing about the other 59.
 *
 * The documented shape is the blueprint's: `rank[,tier],player name`. In
 * practice a cheat sheet is whatever a person pasted out of a spreadsheet or a
 * notes app, so all four of these read correctly:
 *
 *     1,2,"Valančiūnas, Jonas"     rank, tier, quoted name
 *     1,2,Valančiūnas, Jonas       the same, with the comma left unquoted
 *     1,Nunn                       rank and a name
 *     Nunn                         just a name, ranked by where it sits
 *
 * ## How the columns are found without being told
 *
 * Leading **numeric** fields are consumed as rank and then tier, and everything
 * left over is the name, rejoined with the comma that split it. That one rule
 * covers the list above, and it covers the case that actually breaks parsers
 * here: names in this pool are written "Surname, Firstname", so an unquoted
 * name is two fields and any column-counting scheme reads the forename as a
 * status or a tier. Numbers cannot be surnames, so leading numbers are safe to
 * claim and the remainder is safe to keep whole.
 *
 * A header row overrides the inference, because a hand-made sheet will have one
 * and will not respect our column order.
 *
 * ## Rank, and when it is honoured
 *
 * A rank column is only obeyed when **every** row has one. A sheet where half
 * the lines are numbered is a sheet somebody edited by hand, and re-sorting it
 * by the numbers that survived would move players they never touched — so line
 * order wins, which is what they were looking at while they typed.
 */

/** Column aliases a spreadsheet is likely to use, folded to lower case. */
const HEADERS: Record<string, keyof SheetColumns> = {
  rank: "rank",
  "#": "rank",
  no: "rank",
  order: "rank",
  tier: "tier",
  group: "tier",
  name: "name",
  player: "name",
  "player name": "name",
};

type SheetColumns = { rank: number; tier: number; name: number };

/** One line of a pasted sheet, before anybody has looked for a player. */
export type SheetLine = {
  /** 1-based line in the pasted text, so a problem can point at it. */
  readonly lineNo: number;
  readonly rank: number | null;
  /** The tier column verbatim — a break is a *change* in it, not a number. */
  readonly tier: string;
  readonly name: string;
};

export type ParsedSheet = {
  readonly rows: readonly SheetLine[];
  readonly problems: readonly string[];
};

/** How many lines one paste may carry. A cheat sheet is not a database. */
export const MAX_SHEET_LINES = 500;

function readHeader(fields: string[]): SheetColumns | null {
  const mapped = fields.map((field) => HEADERS[field.trim().toLowerCase()]);
  const named = new Set(mapped.filter(Boolean));
  // A header only counts if it names the one column that cannot be inferred
  // from a number, and only if nothing in it looks like a player.
  if (!named.has("name")) return null;
  const columns: SheetColumns = { rank: -1, tier: -1, name: -1 };
  mapped.forEach((key, index) => {
    if (key) columns[key] = index;
  });
  return columns;
}

/** A field that is only digits. `"12"` yes, `"12th"` no, `"1.5"` no. */
function asRank(field: string): number | null {
  return /^\d+$/.test(field) ? Number(field) : null;
}

export function parseCheatSheet(text: string): ParsedSheet {
  const lines = text.split(/\r?\n/);
  const rows: SheetLine[] = [];
  const problems: string[] = [];

  let columns: SheetColumns | null = null;
  let headerLine = -1;

  for (const [index, raw] of lines.entries()) {
    if (!raw.trim()) continue;
    const header = readHeader(splitCsvLine(raw));
    if (header) {
      columns = header;
      headerLine = index;
    }
    break;
  }

  for (const [index, raw] of lines.entries()) {
    if (index === headerLine || !raw.trim()) continue;
    const lineNo = index + 1;

    if (rows.length >= MAX_SHEET_LINES) {
      problems.push(
        `Stopped at line ${lineNo}: a cheat sheet is capped at ${MAX_SHEET_LINES} players.`,
      );
      break;
    }

    const fields = splitCsvLine(raw);
    let rank: number | null = null;
    let tier = "";
    let name = "";

    if (columns) {
      const at = (column: number) =>
        column >= 0 && column < fields.length ? (fields[column] ?? "") : "";
      rank = asRank(at(columns.rank));
      tier = at(columns.tier);
      // When the name is the right-most column, take everything from it
      // rightwards: an unquoted "Surname, Firstname" split into two fields, and
      // rejoining them is the only reading that is ever right. When something
      // else sits to its right, the name is one field and a stray comma in it
      // is unrecoverable — there is nothing to tell it from the next column.
      const rightmost = columns.name > Math.max(columns.rank, columns.tier);
      name = rightmost
        ? fields.slice(columns.name).join(", ")
        : at(columns.name);
    } else {
      let cursor = 0;
      const first = asRank(fields[cursor] ?? "");
      // A single all-digit field is a name nobody has ("12" is not a player),
      // so claiming it as a rank and reporting the empty name is the right
      // reading either way.
      if (first !== null) {
        rank = first;
        cursor += 1;
        const second = fields[cursor];
        // The second number is a tier only if there is still something after
        // it. "1,2" is a rank and a name of "2" nobody meant; "1,2,Nunn" is
        // rank, tier and a player.
        if (
          second !== undefined &&
          asRank(second) !== null &&
          fields.length > cursor + 1
        ) {
          tier = second;
          cursor += 1;
        }
      }
      name = fields.slice(cursor).join(", ").trim();
    }

    if (!name) {
      problems.push(`Line ${lineNo}: no player name on this line.`);
      continue;
    }

    rows.push({ lineNo, rank, tier: tier.trim(), name: name.trim() });
  }

  // Honoured only when the whole sheet is numbered — see the module note.
  const numbered = rows.length > 0 && rows.every((row) => row.rank !== null);
  const ordered = numbered
    ? [...rows].sort(
        (a, b) => (a.rank ?? 0) - (b.rank ?? 0) || a.lineNo - b.lineNo,
      )
    : rows;

  return { rows: ordered, problems };
}
