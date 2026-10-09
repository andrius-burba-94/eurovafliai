import { describe, expect, it } from "vitest";

import { failureKind, writeupView } from "./view";

const refs = {
  "@T1": { kind: "member", id: "m1" },
  "#P1": { kind: "player", id: "p1" },
  "#P2": { kind: "player", id: "p2" },
};
const names = { members: { m1: "Vaflių Fabrikas" }, players: { p1: "Vezenkov, Alexanter", p2: "Musa, Dzanan" } };
const output = {
  headline: "@T1 takes round 3 on #P1's night",
  lines: ["@T1 won with 227.1 fantasy points behind #P1.", "#P2 did not play while his club played.", "@T1 climbed to 2nd in the table."],
  sections: { swing: "@T1 released #P1 for -34.5.", stars: "#P1 led the stars with 38.5.", over: "#P1 beat his average by +14.7." },
};

describe("writeupView", () => {
  it("names a player in full on first reading and by surname after, in the page's reading order", () => {
    const view = writeupView(output, refs, names)!;
    expect(view.headline).toBe("Vaflių Fabrikas takes round 3 on Alexanter Vezenkov's night");
    expect(view.lines[0]).toEqual([
      { type: "member", id: "m1", text: "Vaflių Fabrikas" },
      { type: "text", text: " won with 227.1 fantasy points behind " },
      { type: "player", id: "p1", text: "Vezenkov" },
      { type: "text", text: "." },
    ]);
    // The summary panel's sections come before the notes on other panels.
    expect(view.sections.over![0]).toEqual({ type: "player", id: "p1", text: "Vezenkov" });
    expect(Object.keys(view.sections)).toEqual(["over", "stars", "swing"]);
  });

  it("drops a headline's closing full stop, which display type does not carry", () => {
    expect(writeupView({ ...output, headline: "@T1 won the night in round 3." }, refs, names)!.headline).toBe(
      "Vaflių Fabrikas won the night in round 3",
    );
  });

  it("shows nothing for a row this version cannot render, or refs that are not refs", () => {
    expect(writeupView({ lines: ["@T1 won."] }, refs, names)).toBeNull();
    expect(writeupView(output, null, names)).toBeNull();
  });

  it("never renders an unknown token as a name", () => {
    const view = writeupView({ ...output, lines: ["#P9 starred for the whole night long.", ...output.lines.slice(1)] }, refs, names)!;
    expect(view.lines[0]![0]).toEqual({ type: "text", text: "#P9" });
  });
});

describe("failureKind", () => {
  it("tells a refused answer from Google not answering", () => {
    expect(failureKind("line 1: 9.9 is not in the facts; swing: missing")).toBe("guard");
    expect(failureKind("Gemini gave no usable answer (status incomplete).")).toBe("guard");
    expect(failureKind("Gemini's quota is used up for now (daily).")).toBe("google");
    expect(failureKind("Gemini did not answer (503: overloaded).")).toBe("google");
    expect(failureKind(undefined)).toBe("guard");
  });
});
