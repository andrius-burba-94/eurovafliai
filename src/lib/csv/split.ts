/**
 * Split one CSV line, honouring double quotes.
 *
 * Written out rather than pulled in, and now shared by both front doors that
 * read a pasted sheet: the roster CSV (2.1b) and the cheat sheet (3.4). Player
 * names arrive as "Surname, Firstname", so a quoted comma is the common case
 * here rather than an edge one — and a second implementation of that rule would
 * be a second set of quoting bugs, on two surfaces whose users paste from the
 * same spreadsheet.
 *
 * A dependency for thirty lines that the rest of the pipeline would have to
 * trust is still a poor trade; one module both callers import is not.
 */
export function splitCsvLine(line: string): string[] {
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
