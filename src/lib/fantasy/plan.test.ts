import { describe, expect, it } from "vitest";

import { groupTransactionHistory } from "@/lib/memberships/history";

import rostersJson from "./fixtures/league-rosters.json";
import seatsJson from "./fixtures/league-seats.json";
import poolJson from "./fixtures/pool.json";
import { resolveFantasy } from "./match";
import { parseLeagueRosters } from "./parse";
import { planFromLog, planSync, rostersAgree, type LoggedMove, type SyncSeat } from "./plan";

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

describe("planFromLog", () => {
  // Bravo traded Theis and Hoard to Alpha for Sorkin and Mantzoukas, and Alpha
  // released Theis for Diarra before the next pass: round 4 of EuroVafliai
  // 26-27, as the official log has it (matchday 1531, 9 October 2026).
  const before = { a: ["sorkin", "mantz", "bloss"], b: ["hoard", "theis", "faried"] };
  const after = { a: ["hoard", "ndiaye", "diarra"], b: ["sorkin", "mantz", "dokossi"] };
  const log: LoggedMove[] = [
    { order: 1271182, member: "b", arrival: "sorkin", departure: "theis", departureTo: "a" },
    { order: 1271183, member: "b", arrival: "mantz", departure: "hoard", departureTo: "a" },
    { order: 1271190, member: "a", arrival: "diarra", departure: "theis", departureTo: null },
    { order: 1271193, member: "a", arrival: "ndiaye", departure: "bloss", departureTo: null },
    { order: 1284225, member: "b", arrival: "dokossi", departure: "faried", departureTo: null },
  ];
  const fromLog = (current: Record<string, string[]>, wanted: Record<string, string[]>, moves: LoggedMove[]) =>
    planFromLog({ round: 4, seats: seatsOf(current), target: new Map(Object.entries(wanted)), teamName, playerName, log: moves });
  const windows = (steps: NonNullable<ReturnType<typeof fromLog>>["steps"]) =>
    steps.map((step) => ({
      type: step.plan.type,
      closes: step.plan.closes.map((close) => close.membershipId).sort(),
      opens: step.plan.opens.map((open) => `${open.player}@${open.member}:${open.acquired_via}`).sort(),
    }));

  it("records a player traded and then released with both teams that held him", () => {
    const result = fromLog(before, after, log)!;
    expect(result.steps.map((step) => step.plan.type)).toEqual(["drop", "drop", "trade", "add", "add"]);
    const trade = result.steps[2]!.plan;
    expect(trade.playersOut).toEqual({ a: ["sorkin", "mantz"], b: ["theis", "hoard"] });
    expect(trade.playersIn).toEqual({ a: ["theis", "hoard"], b: ["sorkin", "mantz"] });
    expect(result.steps[0]!.plan.playersOut).toEqual({ a: ["theis", "bloss"] });
    expect(result.steps[3]!.plan.playersIn).toEqual({ a: ["diarra", "ndiaye"] });
    expect(result.steps[2]!.note).toBe("Fantasy Challenge, round 4: Alpha sent SORKIN, MANTZ to Bravo for THEIS, HOARD.");
    expect(result.moves[0]).toBe(result.steps[2]!.announcement);
  });

  it("gives the passing player no window on the team he passed through", () => {
    expect(windows(fromLog(before, after, log)!.steps)).toEqual([
      { type: "drop", closes: ["seat_bloss"], opens: [] },
      { type: "drop", closes: ["seat_faried"], opens: [] },
      { type: "trade", closes: ["seat_hoard", "seat_mantz", "seat_sorkin", "seat_theis"], opens: ["hoard@a:trade", "mantz@b:trade", "sorkin@b:trade"] },
      { type: "add", closes: [], opens: ["diarra@a:signing", "ndiaye@a:signing"] },
      { type: "add", closes: [], opens: ["dokossi@b:signing"] },
    ]);
  });

  it("reads back as one trade and one exchange per team", () => {
    const date = "2026-10-09 10:00:00.000Z";
    const rows = fromLog(before, after, log)!.steps.map((step, index) => ({
      id: `t${index}`,
      type: step.plan.type,
      from_round: step.plan.fromRound,
      members: step.plan.members,
      players_in: step.plan.playersIn,
      players_out: step.plan.playersOut,
      note: step.note,
      date,
    }));
    const events = groupTransactionHistory(rows);
    expect(events.filter((event) => event.rows[0]!.type === "trade" && !event.exchange && !event.swap)).toHaveLength(1);
    expect(events.map((event) => event.exchange).filter(Boolean)).toEqual([
      { memberId: "a", acquiredIds: ["diarra", "ndiaye"], releasedIds: ["theis", "bloss"] },
      { memberId: "b", acquiredIds: ["dokossi"], releasedIds: ["faried"] },
    ]);
  });

  it("has nothing to do when an earlier pass already applied the log", () => {
    expect(fromLog(after, after, log)).toEqual({ moves: [], steps: [] });
  });

  it("gives up when the log does not explain the rosters", () => {
    expect(fromLog(before, after, log.slice(0, 4))).toBeNull();
    expect(fromLog(before, after, [{ ...log[0]!, departure: "bloss" }, ...log.slice(1)])).toBeNull();
  });

  it("opens a signing traded on inside one window only where he ends up", () => {
    const result = fromLog({ a: ["x1"], b: ["y1"] }, { a: ["y1"], b: ["p"] }, [
      { order: 1, member: "a", arrival: "p", departure: "x1", departureTo: null },
      { order: 2, member: "a", arrival: "y1", departure: "p", departureTo: "b" },
    ])!;
    expect(windows(result.steps)).toEqual([
      { type: "drop", closes: ["seat_x1"], opens: [] },
      { type: "trade", closes: ["seat_y1"], opens: ["p@b:trade", "y1@a:trade"] },
      { type: "add", closes: [], opens: [] },
    ]);
    expect(result.steps[2]!.plan.playersIn).toEqual({ a: ["p"] });
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
