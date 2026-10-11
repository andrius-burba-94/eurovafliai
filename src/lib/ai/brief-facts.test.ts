import { describe, expect, it } from "vitest";

import { scoutFor, type ScoutMove } from "@/lib/advisor/scout";
import type { ScheduleRow } from "@/lib/fixtures/schedule";
import type { RecordedLineup } from "@/lib/lineups/lineup";
import type { HistoryRow } from "@/lib/memberships/history";
import type { RecapWindow } from "@/lib/stats/recap";
import type { RoundSnapshot } from "@/lib/stats/standings";

import { buildBriefFacts, nightVerdict, type BriefFacts, type BriefFactsInput } from "./brief-facts";
import { numbersIn } from "./facts";
import { checkWriteup } from "./guard";
import type { FactsGame, FactsPlayer } from "./round-facts";

/**
 * A four-team league through round 5, built around m1 (@T1). Every player
 * averages a round number over rounds 1–4, so a decider's value is easy to
 * read off the night set for round 5:
 * - pCap (G) 25.0 is m1's captain; pMate (F) 10.0 and pBig (C) 20.0 start;
 *   pBench (G) 10.0 sits on the bench.
 * - pRest (F) 30.0 plays for EEE, which has no game in round 5; he joins m1
 *   only in the tests that need him.
 * - pOld and pIn are a drop and an add from round 2.
 * By default the captain's +25.0 is m1's only big decider.
 */

const fixtures: ScheduleRow[] = [1, 2, 3, 4, 5, 6].flatMap((round) => {
  const played = round <= 5;
  const row = (n: number, home: string, road: string, localScore: number, roadScore: number): ScheduleRow => ({
    gameCode: round * 10 + n,
    round,
    played,
    localClub: home,
    roadClub: road,
    localScore: played ? localScore : 0,
    roadScore: played ? roadScore : 0,
    utcDate: `2026-10-0${round}T18:00:00Z`,
  });
  return [
    row(1, "AAA", "BBB", 80, 70),
    row(2, "CCC", "DDD", 75, 85),
    // EEE and FFF sit round 5 out.
    ...(round === 5 ? [] : [row(3, "EEE", "FFF", 90, 60)]),
  ];
});

const player = (id: string, name: string, position: "G" | "F" | "C", clubCode: string, status = ""): FactsPlayer => ({
  id,
  name,
  position,
  clubCode,
  status,
  prevSeasonFantasyTenths: 0,
  prevSeasonGames: 0,
});

const PLAYERS: FactsPlayer[] = [
  player("pCap", "Capello, Aaron", "G", "AAA"),
  player("pMate", "Matevic, Bruno", "F", "BBB"),
  player("pBig", "Bigsby, Carlos", "C", "CCC"),
  player("pBench", "Benchley, Dario", "G", "DDD"),
  player("pRest", "Restrepo, Elias", "F", "EEE"),
  player("pOld", "Oldfield, Felix", "G", "DDD"),
  player("pIn", "Ingram, Gustav", "G", "CCC"),
  player("pTwo", "Twomey, Hugo", "F", "FFF"),
  player("pThree", "Threlfall, Ivan", "C", "AAA"),
  player("pFour", "Fourie, Jonas", "G", "BBB"),
  player("pFree", "Freeman, Karl", "G", "BBB"),
];

const AVERAGE: Record<string, number> = {
  pCap: 250,
  pMate: 100,
  pBig: 200,
  pBench: 100,
  pRest: 300,
  pOld: 100,
  pIn: 500,
  pTwo: 100,
  pThree: 100,
  pFour: 100,
  pFree: 50,
};

/** Round 5's nights, tenths; a missing player has no line. */
const NIGHT: Record<string, number> = { pCap: 250, pMate: 100, pBig: 200, pBench: 100, pOld: 100, pIn: 500, pThree: 100, pFour: 100, pFree: 50 };

const clubOf = Object.fromEntries(PLAYERS.map((entry) => [entry.id, entry.clubCode]));

function game(playerId: string, round: number, fantasyTenths: number, over: Partial<FactsGame> = {}): FactsGame {
  const club = clubOf[playerId]!;
  const fixture = fixtures.find((row) => row.round === round && (row.localClub === club || row.roadClub === club))!;
  const home = fixture.localClub === club;
  return {
    player: playerId,
    round,
    gameCode: fixture.gameCode,
    clubCode: club,
    teamScore: home ? fixture.localScore : fixture.roadScore,
    opponentScore: home ? fixture.roadScore : fixture.localScore,
    seconds: 1500,
    points: 10,
    rebounds: 4,
    assists: 3,
    pir: Math.round(fantasyTenths / 10),
    fantasyTenths,
    basketNewsHundredths: fantasyTenths * 10 + 5,
    started: "yes",
    ...over,
  };
}

function games(night: Record<string, number> = NIGHT, over: Record<string, Partial<FactsGame>> = {}): FactsGame[] {
  return [
    ...Object.entries(AVERAGE).flatMap(([id, tenths]) => [1, 2, 3, 4].map((round) => game(id, round, tenths))),
    ...Object.entries(night).map(([id, tenths]) => game(id, 5, tenths, over[id])),
  ];
}

const WINDOWS: RecapWindow[] = [
  { memberId: "m1", playerId: "pCap", from_round: 1 },
  { memberId: "m1", playerId: "pMate", from_round: 1 },
  { memberId: "m1", playerId: "pBig", from_round: 1 },
  { memberId: "m1", playerId: "pBench", from_round: 1 },
  { memberId: "m2", playerId: "pTwo", from_round: 1 },
  { memberId: "m3", playerId: "pThree", from_round: 1 },
  { memberId: "m4", playerId: "pFour", from_round: 1 },
];

const slots = (over: Partial<RecordedLineup["slots"]> = {}): RecordedLineup["slots"] => ({
  starters: ["pCap", "pMate", "pBig"],
  captain: "pCap",
  sixth: [],
  bench: ["pBench"],
  inactive: [],
  ...over,
});

const LINEUPS: RecordedLineup[] = [{ memberId: "m1", round: 5, slots: slots() }];

const snapshot = (round: number, table: [string, number, number][]): RoundSnapshot => ({
  round,
  phase: "RS",
  table: table.map(([memberId, totalHundredths, roundHundredths]) => ({ memberId, totalHundredths, roundHundredths })),
});

/** Totals and nights, rounds 1–5. Round 5: m1 first, m2 and m3 tied, m4 last. */
const SNAPSHOTS: RoundSnapshot[] = [
  snapshot(1, [["m1", 10000, 10000], ["m2", 12000, 12000], ["m3", 8000, 8000], ["m4", 6000, 6000]]),
  snapshot(2, [["m1", 20000, 10000], ["m2", 26000, 14000], ["m3", 18000, 10000], ["m4", 10000, 4000]]),
  snapshot(3, [["m1", 30000, 10000], ["m2", 38000, 12000], ["m3", 30000, 12000], ["m4", 12000, 2000]]),
  snapshot(4, [["m1", 42000, 12000], ["m2", 48000, 10000], ["m3", 40000, 10000], ["m4", 16000, 4000]]),
  snapshot(5, [["m1", 60000, 18000], ["m2", 58000, 10000], ["m3", 50000, 10000], ["m4", 20000, 4000]]),
];

const MEMBERS = [
  { id: "m1", teamName: "Einikio Kabliai", userName: "Andrius" },
  { id: "m2", teamName: "Vafliu Meistrai", userName: "Jonas Petraitis" },
  { id: "m3", teamName: "Kauno Ereliai", userName: "Ruta" },
  { id: "m4", teamName: "Zalgirio Fanai", userName: "Mantas" },
];

function input(over: Partial<BriefFactsInput> = {}): BriefFactsInput {
  return {
    round: 5,
    ruleset: "euroleague",
    leagueName: "EuroVafliai 26-27",
    members: MEMBERS,
    snapshots: SNAPSHOTS,
    windows: WINDOWS,
    lineups: LINEUPS,
    games: games(),
    official: [],
    fixtures,
    players: PLAYERS,
    transactions: [],
    news: [],
    nextRound: 6,
    moves: [],
    ...over,
  };
}

function facts(over: Partial<BriefFactsInput> = {}): BriefFacts {
  const result = buildBriefFacts(input(over));
  if (!result.ok) throw new Error(result.reason);
  return result.facts;
}

const section = (sheet: BriefFacts, memberId: string) => sheet.sectionFor(memberId).split("\n");
const linesOf = (sheet: BriefFacts, memberId: string, label: string) =>
  section(sheet, memberId).filter((line) => line.startsWith(`${label} · `));
const tokenOf = (sheet: BriefFacts, id: string) => Object.entries(sheet.refs).find(([, ref]) => ref.id === id)?.[0] ?? "(none)";

describe("buildBriefFacts: the night", () => {
  const verdicts = (count: number, nights: number[]) => {
    const members = Array.from({ length: count }, (_, index) => ({ id: `t${String(index).padStart(2, "0")}`, teamName: `Team ${index}`, userName: "" }));
    const sheet = facts({
      members,
      windows: [],
      lineups: [],
      snapshots: [snapshot(5, members.map((member, index) => [member.id, 50000 - index * 100, nights[index]!]))],
    });
    const fromSheet = members.map((member) => linesOf(sheet, member.id, "NIGHT")[0]!.split(" · ").at(-1));
    // Recap's tag reads the same thirds off its own ladder, so the two always agree.
    expect(members.map((_, index) => nightVerdict(index + 1, count))).toEqual(fromSheet);
    return fromSheet;
  };

  it("splits the night into thirds: one won and one lost at two, three and four teams", () => {
    expect(verdicts(2, [9000, 8000])).toEqual(["won", "lost"]);
    expect(verdicts(3, [9000, 8000, 7000])).toEqual(["won", "held", "lost"]);
    expect(verdicts(4, [9000, 8000, 7000, 6000])).toEqual(["won", "held", "held", "lost"]);
  });

  it("gives three won and three lost at ten teams", () => {
    const nights = Array.from({ length: 10 }, (_, index) => 10000 - index * 500);
    expect(verdicts(10, nights)).toEqual(["won", "won", "won", "held", "held", "held", "held", "lost", "lost", "lost"]);
  });

  it("takes Recap's place on a tie: the lower member id goes first", () => {
    // t00 and t01 tie for the night; Recap ranks t00 first, so only t00 won it.
    expect(verdicts(4, [9000, 9000, 7000, 6000])).toEqual(["won", "held", "held", "lost"]);
    const sheet = facts();
    expect(linesOf(sheet, "m2", "NIGHT")).toEqual(["NIGHT · 2nd of 4 on the night · 100.0 · held"]);
    expect(linesOf(sheet, "m3", "NIGHT")).toEqual(["NIGHT · 3rd of 4 on the night · 100.0 · held"]);
  });

  it("refuses a round with no snapshot and a round nobody scored", () => {
    expect(buildBriefFacts(input({ round: 7 }))).toEqual({ ok: false, reason: "round 7 has no standings snapshot" });
    expect(buildBriefFacts(input({ snapshots: [snapshot(5, [["m1", 0, 0], ["m2", 0, 0]])] }))).toEqual({
      ok: false,
      reason: "nobody scored in round 5",
    });
  });
});

describe("buildBriefFacts: deciders", () => {
  const deciders = (sheet: BriefFacts, memberId = "m1") => linesOf(sheet, memberId, "DECIDER");

  it("can be won by the captain's bonus", () => {
    const sheet = facts();
    expect(deciders(sheet)).toEqual([
      `DECIDER · captain bonus · ${tokenOf(sheet, "pCap")} · +25.0`,
      `DECIDER · bench half lost · ${tokenOf(sheet, "pBench")} on the bench · -5.0`,
    ]);
  });

  it("can be won by what a captain flop cost", () => {
    const sheet = facts({ games: games({ ...NIGHT, pCap: 150, pBig: 400 }) });
    expect(deciders(sheet)).toEqual([
      `DECIDER · captain flop · captained ${tokenOf(sheet, "pCap")} while ${tokenOf(sheet, "pBig")} scored more · -25.0`,
      `DECIDER · top counted scorer · ${tokenOf(sheet, "pBig")} counted 40.0, his average 20.0 · +20.0`,
    ]);
  });

  it("can be won by the top counted scorer, valued above his own average", () => {
    const sheet = facts({ games: games({ ...NIGHT, pMate: 600 }) });
    expect(deciders(sheet)[0]).toBe(`DECIDER · top counted scorer · ${tokenOf(sheet, "pMate")} counted 60.0, his average 10.0 · +50.0`);
  });

  it("never spends both slots on one captain's night", () => {
    // 40.0 on a 25.0 average: the bonus is +40.0, and he would also top the counted list by +30.0.
    const sheet = facts({ games: games({ ...NIGHT, pCap: 400, pBig: 300 }) });
    expect(deciders(sheet)).toEqual([
      `DECIDER · captain bonus · ${tokenOf(sheet, "pCap")} · +40.0`,
      `DECIDER · top counted scorer · ${tokenOf(sheet, "pBig")} counted 30.0, his average 20.0 · +10.0`,
    ]);
  });

  it("can be won by the biggest underperformer", () => {
    const sheet = facts({ games: games({ ...NIGHT, pCap: 150, pBig: 20 }) });
    expect(deciders(sheet)).toEqual([
      `DECIDER · underperformer · ${tokenOf(sheet, "pBig")} 2.0 on his average of 20.0 · -18.0`,
      `DECIDER · captain bonus · ${tokenOf(sheet, "pCap")} · +15.0`,
    ]);
  });

  it("can be won by the bench half lost", () => {
    const sheet = facts({ games: games({ ...NIGHT, pBench: 600 }) });
    expect(deciders(sheet)[0]).toBe(`DECIDER · bench half lost · ${tokenOf(sheet, "pBench")} on the bench · -30.0`);
  });

  it("can be won by players with no game and players who did not play, valued at their averages", () => {
    const sheet = facts({
      windows: [...WINDOWS, { memberId: "m1", playerId: "pRest", from_round: 1 }],
      lineups: [{ memberId: "m1", round: 5, slots: slots({ starters: ["pCap", "pMate", "pBig", "pRest"] }) }],
      games: games(NIGHT, { pBig: { seconds: 0, fantasyTenths: 0, basketNewsHundredths: 0, pir: 0 } }),
    });
    expect(deciders(sheet)[0]).toBe(
      `DECIDER · short-handed · no game ${tokenOf(sheet, "pRest")} · did not play ${tokenOf(sheet, "pBig")} · their averages · -50.0`,
    );
  });

  it("can be won by an earlier round's deal, by its swing this round", () => {
    const transactions: HistoryRow[] = [
      { id: "tx1", type: "drop", from_round: 2, members: ["m1"], players_in: {}, players_out: { m1: ["pOld"] }, note: "Synced", date: "2026-10-02 10:00:00.000Z" },
      { id: "tx2", type: "add", from_round: 2, members: ["m1"], players_in: { m1: ["pIn"] }, players_out: {}, note: "Synced", date: "2026-10-02 10:00:30.000Z" },
    ];
    const sheet = facts({
      transactions,
      windows: [...WINDOWS, { memberId: "m1", playerId: "pOld", from_round: 1, to_round: 1 }, { memberId: "m1", playerId: "pIn", from_round: 2 }],
      games: games({ ...NIGHT, pIn: 1000, pOld: 100 }),
    });
    expect(deciders(sheet)[0]).toBe(
      `DECIDER · deal from round 2 · released ${tokenOf(sheet, "pOld")}, signed ${tokenOf(sheet, "pIn")} · this round · +90.0`,
    );
  });

  it("has no captain or bench candidate without a lineup", () => {
    const sheet = facts({ lineups: [], games: games({ ...NIGHT, pBench: 600 }) });
    const lines = deciders(sheet).join("\n");
    expect(lines).not.toContain("captain");
    expect(lines).not.toContain("bench");
    // Counted in full, the big bench night is now the top scorer's.
    expect(deciders(sheet)[0]).toBe(`DECIDER · top counted scorer · ${tokenOf(sheet, "pBench")} counted 60.0, his average 10.0 · +50.0`);
  });

  it("prints no decider for a team with none", () => {
    // pThree scored exactly his average: nothing moved m3's night.
    expect(deciders(facts(), "m3")).toEqual([]);
  });

  it("values a BasketNews league in Modern points, with BasketNews's own roles where it published them", () => {
    const sheet = facts({ ruleset: "basketnews" });
    // The feed's Modern value is the tenth plus 0.05; the captain doubles it.
    expect(deciders(sheet)[0]).toBe(`DECIDER · captain bonus · ${tokenOf(sheet, "pCap")} · +25.05`);
    expect(sheet.header).toContain("BasketNews Modern points");
    const published = facts({
      ruleset: "basketnews",
      official: [{ memberId: "m1", round: 5, players: [{ playerId: "pCap", rawHundredths: 2000, weightedHundredths: 3000 }] }],
    });
    expect(deciders(published)[0]).toBe(`DECIDER · captain bonus · ${tokenOf(published, "pCap")} · +10.0`);
    expect(facts().header).toContain("EuroLeague fantasy points");
  });
});

describe("buildBriefFacts: standing, trend and honour", () => {
  it("gives the gap above and the lead below, the leader's lead and nothing below last place", () => {
    const sheet = facts();
    expect(linesOf(sheet, "m1", "STANDING")).toEqual(["STANDING · leads @T2 by 20.0"]);
    expect(linesOf(sheet, "m2", "STANDING")).toEqual(["STANDING · 20.0 behind @T1 · 80.0 ahead of @T3"]);
    expect(linesOf(sheet, "m4", "STANDING")).toEqual(["STANDING · 300.0 behind @T3"]);
  });

  it("prints the table in the shared header, every team with its gap to the next", () => {
    expect(facts().header.split("\n").filter((line) => line.startsWith("@T"))).toEqual([
      "@T1 · 1st · total 600.0 · 20.0 ahead of @T2",
      "@T2 · 2nd · total 580.0 · 80.0 ahead of @T3",
      "@T3 · 3rd · total 500.0 · 300.0 ahead of @T4",
      "@T4 · 4th · total 200.0",
    ]);
  });

  /** m1's rank in round 2 (three snapshots back) is set by its total there. */
  const withRound2 = (m1Total: number) =>
    SNAPSHOTS.map((snap) =>
      snap.round === 2 ? { ...snap, table: snap.table.map((row) => (row.memberId === "m1" ? { ...row, totalHundredths: m1Total } : row)) } : snap,
    );

  it("calls two places up rising, one steady, and two down falling", () => {
    // At 150.0 after round 2, m1 sat 3rd behind m2 and m3.
    expect(linesOf(facts({ snapshots: withRound2(15000) }), "m1", "TREND")).toEqual(["TREND · rising · 3rd after round 2, 1st now"]);
    expect(linesOf(facts(), "m1", "TREND")).toEqual(["TREND · steady · 2nd after round 2, 1st now"]);
    const falling = SNAPSHOTS.map((snap) =>
      snap.round === 2 ? { ...snap, table: snap.table.map((row) => (row.memberId === "m4" ? { ...row, totalHundredths: 30000 } : row)) } : snap,
    );
    expect(linesOf(facts({ snapshots: falling }), "m4", "TREND")).toEqual(["TREND · falling · 1st after round 2, 4th now"]);
  });

  it("calls one place down steady and two down falling", () => {
    // After round 2 m3 sat 3rd; one place higher there, two higher.
    const m3After2 = (total: number) =>
      SNAPSHOTS.map((snap) =>
        snap.round === 2 ? { ...snap, table: snap.table.map((row) => (row.memberId === "m3" ? { ...row, totalHundredths: total } : row)) } : snap,
      );
    expect(linesOf(facts({ snapshots: m3After2(21000) }), "m3", "TREND")).toEqual(["TREND · steady · 2nd after round 2, 3rd now"]);
    expect(linesOf(facts({ snapshots: m3After2(27000) }), "m3", "TREND")).toEqual(["TREND · falling · 1st after round 2, 3rd now"]);
  });

  it("has no trend before three earlier snapshots", () => {
    expect(linesOf(facts({ snapshots: SNAPSHOTS.slice(1) }), "m1", "TREND")).toHaveLength(1);
    expect(linesOf(facts({ snapshots: SNAPSHOTS.slice(2) }), "m1", "TREND")).toEqual([]);
  });

  it("names an honour only when it changed this round", () => {
    const sheet = facts();
    expect(linesOf(sheet, "m1", "HONOUR")).toEqual(["HONOUR · nights won now 2 · top-three streak now 5"]);
    expect(linesOf(sheet, "m4", "HONOUR")).toEqual(["HONOUR · last-place nights now 5"]);
    // m3 drops out of the top three in round 3: a streak of two is no honour.
    const broken = SNAPSHOTS.map((snap) =>
      snap.round === 3 ? { ...snap, table: snap.table.map((row) => (row.memberId === "m3" ? { ...row, roundHundredths: 1000 } : row)) } : snap,
    );
    expect(linesOf(facts({ snapshots: broken }), "m3", "HONOUR")).toEqual([]);
  });

  it("says nothing of a top-three streak when the league has three teams or fewer", () => {
    const three = SNAPSHOTS.map((snap) => ({ ...snap, table: snap.table.filter((row) => row.memberId !== "m4") }));
    const sheet = facts({ snapshots: three, members: MEMBERS.filter((member) => member.id !== "m4") });
    expect(linesOf(sheet, "m1", "HONOUR")).toEqual(["HONOUR · nights won now 2"]);
    expect(linesOf(sheet, "m2", "HONOUR")).toEqual(["HONOUR · last-place nights now 2"]);
  });

  it("says when a long streak ended", () => {
    const ended = SNAPSHOTS.map((snap) =>
      snap.round === 5 ? { ...snap, table: snap.table.map((row) => (row.memberId === "m4" ? { ...row, roundHundredths: 30000 } : row.memberId === "m2" ? { ...row, roundHundredths: 1000 } : row)) } : snap,
    );
    expect(linesOf(facts({ snapshots: ended }), "m2", "HONOUR")).toEqual(["HONOUR · last-place nights now 1 · top-three streak of 4 ended"]);
  });
});

describe("buildBriefFacts: next", () => {
  const scoutRow = (id: string, name: string, position: "G" | "F" | "C") => ({ id, name, clubCode: clubOf[id]!, position, status: "" });
  const moveFor = (template: Record<"G" | "F" | "C", number>): { memberId: string; moves: ScoutMove[] } => {
    const seats = [
      { member: "m1", player: "pCap", position: "G" as const, name: "Capello, Aaron", clubCode: "AAA", status: "" },
      { member: "m1", player: "pMate", position: "F" as const, name: "Matevic, Bruno", clubCode: "BBB", status: "" },
      { member: "m1", player: "pBig", position: "C" as const, name: "Bigsby, Carlos", clubCode: "CCC", status: "" },
      { member: "m1", player: "pBench", position: "G" as const, name: "Benchley, Dario", clubCode: "DDD", status: "" },
    ];
    const outlooks = [
      { player: "pCap", outlook_5: 2500, games_ahead: 5 },
      { player: "pMate", outlook_5: 1000, games_ahead: 5 },
      { player: "pBig", outlook_5: 2000, games_ahead: 5 },
      { player: "pBench", outlook_5: 800, games_ahead: 5 },
      { player: "pFree", outlook_5: 1350, games_ahead: 5 },
    ];
    const view = scoutFor({ seats, freeAgents: [scoutRow("pFree", "Freeman, Karl", "G")], outlooks, template, memberId: "m1", ruleset: "euroleague" });
    return { memberId: "m1", moves: view.advice.moves };
  };

  it("gives the roster's run in the next round", () => {
    const sheet = facts({ windows: [...WINDOWS, { memberId: "m1", playerId: "pRest", from_round: 1 }] });
    expect(linesOf(sheet, "m1", "NEXT ROUND 6")[0]).toMatch(/^NEXT ROUND 6 · \d+ easy, \d+ even, \d+ hard/);
    const empty = facts({ windows: WINDOWS.filter((window) => window.memberId !== "m1") });
    expect(linesOf(empty, "m1", "NEXT ROUND 6")).toEqual(["NEXT ROUND 6 · 0 easy, 0 even, 0 hard"]);
    expect(facts({ nextRound: null }).sectionFor("m1")).not.toContain("NEXT ROUND");
  });

  it("names no injured or doubtful player and no count of players without a game", () => {
    const players = PLAYERS.map((entry) =>
      entry.id === "pBig" ? { ...entry, status: "doubtful" } : entry.id === "pMate" ? { ...entry, status: "injured" } : entry,
    );
    const sheet = facts({ players, news: [{ player: "pBig", status: "doubtful", bodyPart: "Ankle", published: "2026-10-04" }] });
    const section = sheet.sectionFor("m1");
    expect(section).not.toMatch(/unavailable|doubtful|injured|without a game/);
    expect(linesOf(sheet, "m1", "NEXT ROUND 6")[0]).not.toContain(tokenOf(sheet, "pMate"));
  });

  it("points to the best move worth making, and to none when the roster does not count its template", () => {
    const sheet = facts({ moves: [moveFor({ G: 2, F: 1, C: 1 })] });
    expect(linesOf(sheet, "m1", "NEXT ROUND 6")[0]).toContain(
      `best move: drop ${tokenOf(sheet, "pBench")}, add ${tokenOf(sheet, "pFree")} · +5.5 fantasy points a game over the next 5`,
    );
    const misfiled = moveFor({ G: 5, F: 5, C: 3 });
    expect(misfiled.moves).toEqual([]);
    expect(facts({ moves: [misfiled] }).sectionFor("m1")).not.toContain("best move");
    expect(facts().sectionFor("m1")).not.toContain("best move");
  });
});

describe("buildBriefFacts: privacy", () => {
  const moves: { memberId: string; moves: ScoutMove[] }[] = [
    {
      memberId: "m1",
      moves: [
        {
          drop: { id: "pBench", name: "Benchley, Dario", clubCode: "DDD", position: "G", status: "", outlook: null },
          add: { id: "pFree", name: "Freeman, Karl", clubCode: "BBB", position: "G", status: "", outlook: null },
          gain: 550,
          confidence: "high",
        },
      ],
    },
  ];

  it("writes no team, member or player name", () => {
    const sheet = facts({ moves });
    for (const name of [...MEMBERS.flatMap((member) => [member.teamName, member.userName]), "EuroVafliai", ...PLAYERS.map((entry) => entry.name.split(",")[0]!)]) {
      expect(sheet.text).not.toContain(name);
    }
    for (const id of [...MEMBERS.map((member) => member.id), ...PLAYERS.map((entry) => entry.id)]) {
      expect(sheet.text).not.toMatch(new RegExp(`\\b${id}\\b`));
    }
    expect(sheet.privateNames).toEqual(expect.arrayContaining(["Einikio Kabliai", "Andrius", "EuroVafliai 26-27", "Karl Freeman", "Freeman"]));
  });

  it("keeps a member's move out of every other member's section and tokens", () => {
    const sheet = facts({ moves });
    const free = tokenOf(sheet, "pFree");
    expect(sheet.sectionFor("m1")).toContain(free);
    for (const memberId of ["m2", "m3", "m4"]) {
      expect(sheet.sectionFor(memberId)).not.toContain(free);
      expect(sheet.sectionFor(memberId)).not.toContain("best move");
      expect(sheet.tokensFor(memberId).has(free)).toBe(false);
    }
    expect(sheet.header).not.toContain(free);
    // Every team may be named by every brief: the table is public.
    expect([...sheet.tokensFor("m2")].filter((token) => token.startsWith("@T")).sort()).toEqual(["@T1", "@T2", "@T3", "@T4"]);
  });

  it("produces the same sheet however the reads came back", () => {
    const shuffled = facts({
      games: [...games()].reverse(),
      windows: [...WINDOWS].reverse(),
      players: [...PLAYERS].reverse(),
      members: [...MEMBERS].reverse(),
      snapshots: [...SNAPSHOTS].reverse(),
      fixtures: [...fixtures].reverse(),
    });
    expect(shuffled.text).toBe(facts().text);
    expect(shuffled.refs).toEqual(facts().refs);
  });

  it("passes its own guard: each section's numbers are allowed against the header and that section", () => {
    const sheet = facts({ moves });
    for (const memberId of MEMBERS.map((member) => member.id)) {
      const own = `${sheet.header}\n${sheet.sectionFor(memberId)}`;
      const lines = sheet.sectionFor(memberId).split("\n").slice(1);
      const result = checkWriteup(lines, { allowed: new Set(numbersIn(own)), tokens: sheet.tokensFor(memberId), privateNames: sheet.privateNames });
      expect(result.violations.filter((violation) => !/no "a" or "an"|"points"/.test(violation))).toEqual([]);
    }
  });
});
