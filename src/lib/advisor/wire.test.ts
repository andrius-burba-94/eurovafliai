import { describe, expect, it } from "vitest";

import { waiverWire, type StoredOutlook } from "./wire";

const agent = (id: string, name: string, position: "G" | "F" | "C" = "G", status = "active") => ({
  id,
  name,
  clubCode: "AAA",
  position,
  status,
});

const outlook = (player: string, five: number, over: Partial<StoredOutlook> = {}): StoredOutlook => ({
  player,
  outlook_5: five,
  outlook_10: five,
  outlook_15: five,
  games_ahead: 15,
  role: "starter",
  games_in_role: 5,
  base_source: "current",
  run_5: "even",
  run_10: "even",
  run_15: "even",
  ...over,
});

describe("waiverWire", () => {
  it("ranks the free agents by their next-5 outlook, best first", () => {
    const rows = waiverWire({
      freeAgents: [agent("a", "Ace, A"), agent("b", "Base, B"), agent("c", "Cole, C")],
      outlooks: [outlook("a", 900), outlook("b", 1400), outlook("c", 1100)],
    });
    expect(rows.map((row) => row.id)).toEqual(["b", "c", "a"]);
    expect(rows[0]!.outlook).toMatchObject({ next: [1400, 1400, 1400], runs: ["even", "even", "even"], confidence: "high" });
  });

  it("lists a free agent with no games yet after everyone rated, by name", () => {
    const rows = waiverWire({
      freeAgents: [agent("z", "Zed, Z"), agent("n", "New, N"), agent("a", "Ace, A")],
      outlooks: [outlook("a", 100)],
    });
    expect(rows.map((row) => [row.id, row.outlook === null])).toEqual([
      ["a", false],
      ["n", true],
      ["z", true],
    ]);
  });

  it("prints nothing for a window when the club has no game left", () => {
    const [row] = waiverWire({ freeAgents: [agent("a", "Ace, A")], outlooks: [outlook("a", 0, { games_ahead: 0, run_5: "" })] });
    expect(row!.outlook).toMatchObject({ next: [null, null, null], runs: [null, null, null] });
  });

  it("carries the confidence the sample earns", () => {
    const rows = waiverWire({
      freeAgents: [agent("a", "Ace, A"), agent("b", "Base, B")],
      outlooks: [outlook("a", 100, { games_in_role: 3 }), outlook("b", 90, { base_source: "last", games_in_role: 0 })],
    });
    expect(rows.map((row) => row.outlook?.confidence)).toEqual(["medium", "low"]);
  });

  it("never lists a player who is not a free agent, whatever his outlook", () => {
    const rows = waiverWire({ freeAgents: [agent("a", "Ace, A")], outlooks: [outlook("a", 100), outlook("owned", 2000)] });
    expect(rows.map((row) => row.id)).toEqual(["a"]);
  });
});
