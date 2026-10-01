import { describe, expect, it } from "vitest";

import { groupTransactionHistory } from "@/lib/memberships/history";

import rostersJson from "./fixtures/league-rosters.json";
import seatsJson from "./fixtures/league-seats.json";
import poolJson from "./fixtures/pool.json";
import { resolveFantasy } from "./match";
import { parseLeagueRosters } from "./parse";
import { planSync, rostersAgree, type SyncSeat } from "./plan";

const names: Record<string, string> = { a: "Alpha", b: "Bravo", c: "Charlie" };
const teamName = (id: string) => names[id] ?? id;
const playerName = (id: string) => id.toUpperCase();

function seatsOf(rosters: Record<string, string[]>): SyncSeat[] {
  return Object.entries(rosters).flatMap(([member, players]) =>
    players.map((player) => ({ id: `seat_${player}`, member, player })),
  );
}

function plan(current: Record<string, string[]>, wanted: Record<string, string[]>) {
  return planSync({
    round: 3,
    seats: seatsOf(current),
    target: new Map(Object.entries(wanted)),
    teamName,
    playerName,
  });
}

describe("planSync against the real league on 30 September 2026", () => {
  it("finds nothing to do: the rosters recorded by hand match the official game", () => {
    const teams = parseLeagueRosters(rostersJson);
    const pool = poolJson.map((row) => ({
      id: row.id,
      name: row.name,
      nameNormalized: row.name_normalized,
      clubCode: row.club_code,
      clubName: row.club_name,
      dorsal: row.dorsal,
      fantasyId: "",
      status: row.status,
    }));
    const resolution = resolveFantasy(
      teams,
      seatsJson.members.map((member) => ({ id: member.id, teamName: member.team_name, fantasyTeamId: "" })),
      pool,
    );
    const target = new Map(
      teams.map((team) => [resolution.teams.get(team.id)!, team.players.map((player) => resolution.players.get(player.id)!)]),
    );
    const result = planSync({ round: 3, seats: seatsJson.seats, target, teamName, playerName });
    expect(result.moves).toEqual([]);
    expect(result.steps).toEqual([]);
    expect(rostersAgree(seatsJson.seats, target)).toBe(true);
  });
});

describe("planSync", () => {
  it("records a one-for-one free-agent swap as a drop and an add the history reads as one exchange", () => {
    const result = plan({ a: ["p1", "p2"] }, { a: ["p1", "p9"] });
    expect(result.moves).toEqual(["Alpha exchanged P2 for P9, counting from round 3."]);
    expect(result.steps.map((step) => step.plan.type)).toEqual(["drop", "add"]);
    expect(result.steps[0]!.announcement).toBe(result.moves[0]);
    expect(result.steps[1]!.announcement).toBeNull();
    expect(result.steps[0]!.note).toBe("Fantasy Challenge, round 3: Alpha released P2 and acquired P9.");
    expect(result.steps[1]!.note).toBe(result.steps[0]!.note);

    const date = "2026-10-01 16:05:00.000Z";
    const rows = result.steps.map((step, index) => ({
      id: `t${index}`,
      type: step.plan.type,
      from_round: step.plan.fromRound,
      members: step.plan.members,
      players_in: step.plan.playersIn,
      players_out: step.plan.playersOut,
      note: step.note,
      date,
    }));
    expect(groupTransactionHistory(rows)[0]?.exchange).toEqual({ memberId: "a", acquiredIds: ["p9"], releasedIds: ["p2"] });
  });

  it("closes the released window at the round and opens the signing from it", () => {
    const [drop, add] = plan({ a: ["p1", "p2"] }, { a: ["p1", "p9"] }).steps;
    expect(drop!.plan.closes).toEqual([{ membershipId: "seat_p2", toRound: 3 }]);
    expect(add!.plan.opens).toEqual([{ member: "a", player: "p9", fromRound: 3, acquired_via: "signing" }]);
  });

  it("keeps several releases and signings as one drop and one add, announced separately", () => {
    const result = plan({ a: ["p1", "p2", "p3"] }, { a: ["p1", "p8", "p9"] });
    expect(result.moves).toEqual([
      "Alpha dropped P2 and P3, counting from round 3.",
      "Alpha signed P8 and P9, counting from round 3.",
    ]);
    expect(result.steps.map((step) => step.announcement)).toEqual(result.moves);
  });

  it("records a two-way move between members as a trade", () => {
    const result = plan({ a: ["p1", "p2"], b: ["p3", "p4"] }, { a: ["p1", "p3"], b: ["p2", "p4"] });
    expect(result.moves).toEqual(["Alpha traded P2 to Bravo for P3, counting from round 3."]);
    const [trade] = result.steps;
    expect(trade!.plan.type).toBe("trade");
    expect(trade!.plan.opens).toEqual([
      { member: "b", player: "p2", fromRound: 3, acquired_via: "trade" },
      { member: "a", player: "p3", fromRound: 3, acquired_via: "trade" },
    ]);
  });

  it("treats a one-way move as a release and a signing, releasing first", () => {
    const result = plan({ a: ["p1", "p2"], b: ["p3"] }, { a: ["p1"], b: ["p3", "p2"] });
    expect(result.steps.map((step) => `${step.plan.type}:${step.plan.members.join("")}`)).toEqual(["drop:a", "add:b"]);
  });

  it("orders every drop before any trade or add", () => {
    const result = plan(
      { a: ["p1", "p2"], b: ["p3", "p4"], c: ["p5"] },
      { a: ["p3", "p9"], b: ["p1", "p5"], c: ["p4"] },
    );
    const types = result.steps.map((step) => step.plan.type);
    const lastDrop = types.lastIndexOf("drop");
    expect(types.indexOf("trade")).toBeGreaterThan(lastDrop);
    expect(types.indexOf("add")).toBeGreaterThan(lastDrop);
  });

  it("refuses to plan when a member has no official roster", () => {
    expect(() => plan({ a: ["p1"], b: ["p2"] }, { a: ["p1"] })).toThrow(/partial sync/);
  });

  it("refuses a player on two official rosters", () => {
    expect(() => plan({ a: ["p1"], b: ["p2"] }, { a: ["p1"], b: ["p1"] })).toThrow(/two official rosters/);
  });

  it("does nothing when the rosters already agree", () => {
    expect(plan({ a: ["p1"], b: ["p2"] }, { a: ["p1"], b: ["p2"] }).steps).toEqual([]);
  });
});

describe("rostersAgree", () => {
  it("is false while a member holds a player the official roster does not", () => {
    expect(rostersAgree(seatsOf({ a: ["p1", "p2"] }), new Map([["a", ["p1"]]]))).toBe(false);
  });

  it("is false for a member the official league does not know", () => {
    expect(rostersAgree(seatsOf({ a: ["p1"], b: ["p2"] }), new Map([["a", ["p1"]]]))).toBe(false);
  });
});
