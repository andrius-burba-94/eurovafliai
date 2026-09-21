import { describe, expect, it } from "vitest";

import { splitCsvLine } from "@/lib/csv/split";

import { contentTypeFor, toExportBody } from "./serialize";
import type { ExportTable } from "./tables";

const results: ExportTable = {
  kind: "results",
  label: "Draft results",
  columns: ["Overall", "Player"],
  rows: [[1, "Nunn, Kendrick"]],
};
const order: ExportTable = {
  kind: "order",
  label: "Draft order",
  columns: ["Slot", "Team"],
  rows: [[1, "Andrius"]],
};
const meta = {
  leagueName: "EuroVafliai 26-27",
  exportedAt: new Date("2026-09-21T18:30:00.000Z"),
};

describe("CSV", () => {
  it("writes a single kind as a plain sheet, header first and no preamble", () => {
    const body = toExportBody([results], "csv", meta);
    expect(body.split("\r\n")[0]).toBe("Overall,Player");
    expect(splitCsvLine(body.split("\r\n")[1]!)).toEqual([
      "1",
      "Nunn, Kendrick",
    ]);
  });

  it("sections two kinds, each under its own label, separated by a blank line", () => {
    const lines = toExportBody([results, order], "csv", meta).split("\r\n");
    expect(lines[0]).toBe("Draft results");
    expect(lines[1]).toBe("Overall,Player");
    expect(lines[3]).toBe("");
    expect(lines[4]).toBe("Draft order");
    expect(lines[5]).toBe("Slot,Team");
  });

  it("still quotes a name inside a section", () => {
    expect(toExportBody([results, order], "csv", meta)).toContain(
      '"Nunn, Kendrick"',
    );
  });
});

describe("JSON", () => {
  it("keys each kind by name and carries the league and the timestamp", () => {
    const body = JSON.parse(toExportBody([results, order], "json", meta));
    expect(body.league).toBe("EuroVafliai 26-27");
    expect(body.exportedAt).toBe("2026-09-21T18:30:00.000Z");
    expect(body.results).toEqual([{ Overall: 1, Player: "Nunn, Kendrick" }]);
    expect(body.order).toEqual([{ Slot: 1, Team: "Andrius" }]);
  });

  it("writes an empty table as an empty array, not as null", () => {
    const body = JSON.parse(
      toExportBody([{ ...results, rows: [] }], "json", meta),
    );
    expect(body.results).toEqual([]);
  });

  it("writes a missing cell as null rather than dropping the key", () => {
    const body = JSON.parse(
      toExportBody(
        [{ ...results, rows: [[1]] }],
        "json",
        meta,
      ),
    );
    expect(body.results[0]).toEqual({ Overall: 1, Player: null });
  });
});

describe("contentTypeFor", () => {
  it("names a charset, because a player name is not ASCII", () => {
    expect(contentTypeFor("csv")).toBe("text/csv; charset=utf-8");
    expect(contentTypeFor("json")).toBe("application/json; charset=utf-8");
  });
});
