import { describe, expect, it } from "vitest";

import { assignTokens, renderPlain, renderSegments } from "./tokens";

const names = {
  members: { m1: "Einikio Kabliai", m2: "Vafliai", m10: "  " },
  players: {
    p1: "Valanciunas, Jonas",
    p2: "James, Michael Perry",
    p3: "Smith, Jordan",
    p4: "Smith, Nick",
  },
};

describe("assignTokens", () => {
  it("numbers members and players in sorted id order, whatever order they arrive in", () => {
    const a = assignTokens(["m2", "m1"], ["p2", "p1"]);
    const b = assignTokens(["m1", "m2", "m1"], ["p1", "p2"]);
    expect(a.refs).toEqual(b.refs);
    expect(a.member.get("m1")).toBe("@T1");
    expect(a.player.get("p2")).toBe("#P2");
    expect(a.refs["#P1"]).toEqual({ kind: "player", id: "p1" });
  });
});

describe("renderPlain", () => {
  const { refs } = assignTokens(["m1", "m2"], ["p1", "p2", "p3", "p4"]);

  it("names a player in full first and by surname after, across lines", () => {
    expect(renderPlain(["#P1 carried @T1.", "#P1's 31 PIR was the night."], refs, names)).toEqual([
      "Jonas Valanciunas carried Einikio Kabliai.",
      "Valanciunas's 31 PIR was the night.",
    ]);
  });

  it("uses a familiar name where the feed's passport name is not what people say", () => {
    expect(renderPlain(["#P2 again, and #P2."], refs, names)).toEqual(["Mike James again, and James."]);
  });

  it("keeps the full name when two players share a surname", () => {
    expect(renderPlain(["#P3 and #P4, then #P3."], refs, names)).toEqual([
      "Jordan Smith and Nick Smith, then Jordan Smith.",
    ]);
  });

  it("reads @T12 as one token, not @T1 and a 2", () => {
    const many = assignTokens(Array.from({ length: 12 }, (_, i) => `m${String(i + 1).padStart(2, "0")}`), []);
    const members = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`m${String(i + 1).padStart(2, "0")}`, `Team ${i + 1}`]));
    expect(renderPlain(["@T12 beat @T1."], many.refs, { members, players: {} })).toEqual(["Team 12 beat Team 1."]);
  });

  it("leaves an unknown token as written rather than inventing a name", () => {
    expect(renderPlain(["@T9 and #P9."], refs, names)).toEqual(["@T9 and #P9."]);
  });
});

describe("renderSegments", () => {
  it("marks names so a page can link them", () => {
    const { refs } = assignTokens(["m1"], ["p1"]);
    expect(renderSegments(["@T1: #P1!"], refs, names)).toEqual([
      [
        { type: "member", id: "m1", text: "Einikio Kabliai" },
        { type: "text", text: ": " },
        { type: "player", id: "p1", text: "Jonas Valanciunas" },
        { type: "text", text: "!" },
      ],
    ]);
  });

  it("falls back to the token for a team with a blank name", () => {
    const { refs } = assignTokens(["m10"], []);
    expect(renderSegments(["@T1 won."], refs, names)[0]![0]).toEqual({ type: "text", text: "@T1" });
  });
});
