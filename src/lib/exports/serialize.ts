/**
 * Tables to a file body. Pure, so the awkward decision below is testable.
 *
 * ## The awkward decision: more than one table in one CSV
 *
 * CSV has no concept of a second sheet. A request for two kinds therefore has
 * to either become two files or one file with sections, and two files means a
 * zip — a dependency and a second failure mode for a league of ten people.
 *
 * So: **one kind is a plain sheet with no preamble**, which is what a
 * spreadsheet import expects and the case that will be used most. Two or more
 * kinds are written as sections, each headed by its own label row and
 * separated by a blank line. Sheets and Excel open that as one sheet a human
 * can read; a naive parser pointed at it will see the label rows, which is why
 * the single-kind case is deliberately kept clean.
 *
 * JSON has no such problem and always carries every kind under its own key,
 * plus the league and the timestamp — so anything that wants to be parsed
 * rather than read should ask for JSON.
 */
import { toCsv, toCsvLine } from "@/lib/csv/write";

import type { ExportFormat, ExportTable } from "./tables";

export type ExportMeta = {
  leagueName: string;
  exportedAt: Date;
};

function toSectionedCsv(tables: readonly ExportTable[]): string {
  return tables
    .map((table) => `${toCsvLine([table.label])}\r\n${toCsv(table.columns, table.rows)}`)
    .join("\r\n");
}

/** One table's rows as objects, keyed by its own column headings. */
function toObjects(table: ExportTable): Record<string, unknown>[] {
  return table.rows.map((row) =>
    Object.fromEntries(
      table.columns.map((column, index) => [column, row[index] ?? null]),
    ),
  );
}

export function toExportBody(
  tables: readonly ExportTable[],
  format: ExportFormat,
  meta: ExportMeta,
): string {
  if (format === "json") {
    return `${JSON.stringify(
      {
        league: meta.leagueName,
        exportedAt: meta.exportedAt.toISOString(),
        ...Object.fromEntries(
          tables.map((table) => [table.kind, toObjects(table)]),
        ),
      },
      null,
      2,
    )}\n`;
  }
  if (tables.length === 1) {
    const only = tables[0]!;
    return toCsv(only.columns, only.rows);
  }
  return toSectionedCsv(tables);
}

/** The `Content-Type` that makes a browser save it rather than render it. */
export function contentTypeFor(format: ExportFormat): string {
  return format === "json"
    ? "application/json; charset=utf-8"
    : "text/csv; charset=utf-8";
}
