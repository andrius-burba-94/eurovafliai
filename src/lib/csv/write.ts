/**
 * Writing CSV — the mirror of `split.ts`, and for the same reason.
 *
 * Player names in this app are "Surname, Firstname", so a field that has to be
 * quoted is the *common* case on the way out rather than an edge one. The
 * splitter's own note argues that one shared module beats two sets of quoting
 * bugs; an export that hand-rolled `join(",")` would be the second set, and
 * every league export would corrupt on the first name it wrote.
 *
 * `write.test.ts` round-trips this through `splitCsvLine`, so the two halves
 * are checked against each other rather than each against its author's idea of
 * the format.
 */

/** What a cell may hold. `null`/`undefined` are written as an empty field. */
export type CsvValue = string | number | null | undefined;

/**
 * A field needs quoting if it contains the delimiter, a quote, or a newline.
 * Nothing else does — quoting everything would be valid CSV and unreadable
 * when somebody opens the file in a text editor to check a name.
 */
const NEEDS_QUOTING = /[",\r\n]/;

function toField(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (!NEEDS_QUOTING.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsvLine(values: readonly CsvValue[]): string {
  return values.map(toField).join(",");
}

/**
 * A whole sheet: header row, then the body.
 *
 * CRLF between rows because RFC 4180 says so and Excel on Windows is the one
 * reader that still notices; every spreadsheet that matters accepts it, and
 * `splitCsvLine` works a line at a time so it never sees the terminator. The
 * trailing newline is there so `cat`-ing two exports together does not glue two
 * rows into one.
 */
export function toCsv(
  columns: readonly string[],
  rows: readonly (readonly CsvValue[])[],
): string {
  return `${[toCsvLine(columns), ...rows.map(toCsvLine)].join("\r\n")}\r\n`;
}
