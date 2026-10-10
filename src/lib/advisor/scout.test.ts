import { describe, expect, it } from "vitest";

import { scoutFor } from "./scout";
import type { StoredOutlook } from "./wire";

const TEMPLATE = { G: 1, F: 0, C: 0 };

const stored = (player: string, five: number): StoredOutlook => ({
  player,
  outlook_5: five,
  outlook_10: five,
  outlook_15: five,
  games_ahead: 10,
  role: "starter",
  games_in_role: 5,
  base_source: "current",
  run_5: "easy",
});

const seat = (member: string, player: string) => ({
  id: `seat-${player}`,
  member,
  player,
  position: "G" as const,
  name: `${player}, P`,
  clubName: "Club",
  clubCode: "AAA",
  status: "active",
});

const agent = (id: string) => ({ id, name: `${id}, A`, clubCode: "BBB", position: "G" as const, status: "active", clubName: "Club", normalized: id });

describe("scoutFor", () => {
  const outlooks = [stored("mine", 500), stored("theirs", 400), stored("fa", 1500)];

  it("advises the member on their own roster only", () => {
    const view = scoutFor({
      seats: [seat("me", "mine"), seat("them", "theirs")],
      freeAgents: [agent("fa")],
      outlooks,
      template: TEMPLATE,
      memberId: "me",
      ruleset: "euroleague",
    });
    expect(view.advice.moves.map((move) => [move.drop.id, move.add.id, move.gain])).toEqual([["mine", "fa", 1000]]);
    expect(view.advice.moves[0]!.drop).toMatchObject({ name: "mine, P", clubCode: "AAA" });
    expect(view.wire.map((row) => row.id)).toEqual(["fa"]);
  });

  it("drops a move once its free agent is on somebody's roster", () => {
    const view = scoutFor({
      seats: [seat("me", "mine"), seat("them", "fa")],
      freeAgents: [],
      outlooks,
      template: TEMPLATE,
      memberId: "me",
      ruleset: "euroleague",
    });
    expect(view.advice.moves).toEqual([]);
    expect(view.wire).toEqual([]);
  });

  it("gives a viewer without a roster the wire and no advice", () => {
    const view = scoutFor({ seats: [seat("them", "theirs")], freeAgents: [agent("fa")], outlooks, template: TEMPLATE, memberId: null, ruleset: "euroleague" });
    expect(view.advice).toEqual({ countsTemplate: true, moves: [] });
    expect(view.wire).toHaveLength(1);
  });
});
