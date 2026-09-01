/**
 * The commissioner's CSV — the second front door.
 *
 * Pure, like the rest of the pipeline's decision-making: text in, normalized
 * rows out, and every unreadable line reported rather than thrown. This is the
 * source that gets used in the 24 hours before the draft, because it is the one
 * that cannot go down or change shape on the night (blueprint 2.1).
 *
 * The documented shape is `name,club_code,position[,person_code,status]`, and a
 * header row is optional. A hand-made sheet will have a header and will not
 * respect our column order, and supporting both is cheaper than explaining
 * either.
 */
import { mapCsvPosition, normalizeName } from "./normalize";
import type { NormalizedPlayer, PlayerStatus } from "./types";

const STATUSES: PlayerStatus[] = ["active", "injured", "doubtful", "left"];

/** Column aliases a spreadsheet is likely to use, folded to lower case. */
const HEADERS: Record<string, keyof ParsedColumns> = {
  name: "name",
  player: "name",
  "player name": "name",
  club: "club",
  "club code": "club",
  team: "club",
  "team code": "club",
  position: "position",
  pos: "position",
  person_code: "personCode",
  "person code": "personCode",
  code: "personCode",
  id: "personCode",
  status: "status",
};

type ParsedColumns = {
  name: number;
  club: number;
  position: number;
  personCode: number;
  status: number;
};

const DEFAULT_COLUMNS: ParsedColumns = {
  name: 0,
  club: 1,
  position: 2,
  personCode: 3,
  status: 4,
};

/**
 * Split one CSV line, honouring double quotes.
 *
 * Written out rather than pulled in: names arrive as "Surname, Firstname", so
 * quoted commas are the common case rather than an edge one, and a dependency
 * for thirty lines that the rest of the pipeline would have to trust is a poor
 * trade.
 */
function splitLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      // A doubled quote inside a quoted field is an escaped quote.
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

/** Read a header row, if the first line looks like one. */
function readHeader(fields: string[]): ParsedColumns | null {
  const mapped = fields.map((field) => HEADERS[field.trim().toLowerCase()]);
  // A header only counts if it names at least the three required columns.
  const columns: ParsedColumns = { ...DEFAULT_COLUMNS };
  let found = 0;
  mapped.forEach((key, index) => {
    if (!key) return;
    columns[key] = index;
    found += 1;
  });
  const named = new Set(mapped.filter(Boolean));
  if (named.has("name") && named.has("club") && named.has("position")) {
    // Anything the header did not name is unavailable, not defaulted: a sheet
    // with three columns has no fourth to read a person code from.
    if (!named.has("personCode")) columns.personCode = -1;
    if (!named.has("status")) columns.status = -1;
    return found > 0 ? columns : null;
  }
  return null;
}

export function parseCsvRoster(text: string): {
  rows: NormalizedPlayer[];
  problems: string[];
} {
  const lines = text.split(/\r?\n/);
  const rows: NormalizedPlayer[] = [];
  const problems: string[] = [];

  let columns = DEFAULT_COLUMNS;
  let headerLine = -1;

  for (const [index, raw] of lines.entries()) {
    if (!raw.trim()) continue;
    const header = readHeader(splitLine(raw));
    if (header) {
      columns = header;
      headerLine = index;
    }
    break;
  }

  for (const [index, raw] of lines.entries()) {
    if (index === headerLine || !raw.trim()) continue;
    const lineNo = index + 1;
    const fields = splitLine(raw);

    const at = (column: number) =>
      column >= 0 && column < fields.length ? (fields[column] ?? "") : "";

    const name = at(columns.name);
    const club = at(columns.club).toUpperCase();
    const position = at(columns.position);

    if (!name || !club || !position) {
      problems.push(
        `Line ${lineNo}: needs at least a name, a club code and a position — got ${fields.length} column(s).`,
      );
      continue;
    }

    const status = at(columns.status).toLowerCase();
    if (status && !STATUSES.includes(status as PlayerStatus)) {
      problems.push(
        `Line ${lineNo}: "${status}" is not a status. Use ${STATUSES.join(", ")}.`,
      );
      continue;
    }

    let bucket;
    try {
      bucket = mapCsvPosition(position);
    } catch (error) {
      // The likeliest cause is not a bad position at all: names are written
      // "Surname, Firstname", and an unquoted one becomes two columns and
      // shifts everything right. Say that, rather than sending somebody to
      // look at a position that was never wrong.
      const expected =
        Math.max(columns.name, columns.club, columns.position) + 1;
      const shifted = fields.length > expected;
      problems.push(
        `Line ${lineNo}: ${(error as Error).message}` +
          (shifted
            ? ` This line has ${fields.length} columns where ${expected} were expected — if the name contains a comma, wrap it in "quotes".`
            : ""),
      );
      continue;
    }

    const personCode = at(columns.personCode);

    rows.push({
      name,
      name_normalized: normalizeName(name),
      club_code: club,
      // A CSV has no club name, and inventing one would overwrite the real one
      // the API supplies. The apply step keeps whatever is already stored.
      club_name: club,
      position: bucket,
      status: (status || "active") as PlayerStatus,
      person_code: personCode || null,
      source: "csv",
      dorsal: "",
    });
  }

  return { rows, problems };
}
