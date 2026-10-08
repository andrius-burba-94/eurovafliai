import { describe, expect, it } from "vitest";

import type { ScheduleRow } from "@/lib/fixtures/schedule";
import type { RecordedLineup } from "@/lib/lineups/lineup";
import type { HistoryRow } from "@/lib/memberships/history";
import type { RecapWindow } from "@/lib/stats/recap";
import type { RoundSnapshot } from "@/lib/stats/standings";

import { checkWriteup } from "./guard";
import { numbersIn } from "./facts";
import { buildRoundFacts, type FactsGame, type FactsPlayer, type RoundFactsInput } from "./round-facts";

/**
 * A three-team league through round 4, built so every label has exactly one
 * player that earns it:
 * - pAce (m1's captain) averages 10 and scores 30 in round 4: star, overperformer.
 * - pSlump (m2's captain) averages 20 and scores 4: underperformer, captain flop.
 * - pHurt (m3's starter) averages 15 and does not play while his club does: DNP.
 * - pFree is owned by nobody and scores 25: free-agent surprise.
 * - pBench sits on m1's bench and scores 18: bench surprise.
 * - pNew came off the bench three times and starts in round 4: role change.
 */

const CLUBS = ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF"];

const fixtures: ScheduleRow[] = [1, 2, 3, 4, 5].flatMap((round) => [
  { gameCode: round * 10 + 1, round, played: round <= 4, localClub: "AAA", roadClub: "BBB", localScore: round <= 4 ? 80 : 0, roadScore: round <= 4 ? 70 : 0, utcDate: `2026-10-0${round}T18:00:00Z` },
  { gameCode: round * 10 + 2, round, played: round <= 4, localClub: "CCC", roadClub: "DDD", localScore: round <= 4 ? 75 : 0, roadScore: round <= 4 ? 85 : 0, utcDate: `2026-10-0${round}T19:00:00Z` },
  { gameCode: round * 10 + 3, round, played: round <= 4, localClub: "EEE", roadClub: "FFF", localScore: round <= 4 ? 90 : 0, roadScore: round <= 4 ? 60 : 0, utcDate: `2026-10-0${round}T20:00:00Z` },
]);

const PLAYERS: FactsPlayer[] = [
  { id: "pAce", name: "Ace, Aaron", position: "G", clubCode: "AAA", status: "", prevSeasonFantasyTenths: 120, prevSeasonGames: 30 },
  { id: "pSlump", name: "Slumpwell, Bertrand", position: "F", clubCode: "BBB", status: "", prevSeasonFantasyTenths: 0, prevSeasonGames: 0 },
  { id: "pHurt", name: "Hurtado, Carlos", position: "C", clubCode: "CCC", status: "injured", prevSeasonFantasyTenths: 0, prevSeasonGames: 0 },
  { id: "pFree", name: "Freeman, Dario", position: "G", clubCode: "DDD", status: "", prevSeasonFantasyTenths: 0, prevSeasonGames: 0 },
  { id: "pBench", name: "Benchley, Elias", position: "F", clubCode: "EEE", status: "", prevSeasonFantasyTenths: 0, prevSeasonGames: 0 },
  { id: "pNew", name: "Newcombe, Felix", position: "G", clubCode: "FFF", status: "", prevSeasonFantasyTenths: 0, prevSeasonGames: 0 },
  { id: "pSolid", name: "Solidor, Gustav", position: "C", clubCode: "AAA", status: "", prevSeasonFantasyTenths: 0, prevSeasonGames: 0 },
  { id: "pRock", name: "Rockwell, Hugo", position: "F", clubCode: "BBB", status: "", prevSeasonFantasyTenths: 0, prevSeasonGames: 0 },
];

const clubOf = Object.fromEntries(PLAYERS.map((player) => [player.id, player.clubCode]));

function game(player: string, round: number, fantasyTenths: number, over: Partial<FactsGame> = {}): FactsGame {
  const club = clubOf[player]!;
  const fixture = fixtures.find((row) => row.round === round && (row.localClub === club || row.roadClub === club))!;
  const home = fixture.localClub === club;
  return {
    player,
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

const GAMES: FactsGame[] = [
  ...[1, 2, 3].map((round) => game("pAce", round, 100)),
  game("pAce", 4, 300),
  ...[1, 2, 3].map((round) => game("pSlump", round, 200)),
  game("pSlump", 4, 40),
  ...[1, 2, 3].map((round) => game("pHurt", round, 150)),
  ...[1, 2, 3].map((round) => game("pFree", round, 80)),
  game("pFree", 4, 250),
  ...[1, 2, 3].map((round) => game("pBench", round, 60)),
  game("pBench", 4, 180),
  ...[1, 2, 3].map((round) => game("pNew", round, 50, { started: "no" })),
  game("pNew", 4, 120, { started: "yes" }),
  ...[1, 2, 3, 4].map((round) => game("pSolid", round, 90)),
  ...[1, 2, 3, 4].map((round) => game("pRock", round, 160)),
  // Round 5 is the future: nothing in it may reach round 4's sheet.
  game("pAce", 5, 990),
  game("pSlump", 5, 990),
];

const WINDOWS: RecapWindow[] = [
  { memberId: "m1", playerId: "pAce", from_round: 1 },
  { memberId: "m1", playerId: "pBench", from_round: 1 },
  { memberId: "m1", playerId: "pSolid", from_round: 1 },
  { memberId: "m2", playerId: "pSlump", from_round: 1 },
  { memberId: "m2", playerId: "pRock", from_round: 1 },
  { memberId: "m3", playerId: "pHurt", from_round: 1 },
  { memberId: "m3", playerId: "pNew", from_round: 1 },
];

const LINEUPS: RecordedLineup[] = [
  { memberId: "m1", round: 4, slots: { starters: ["pAce", "pSolid"], captain: "pAce", sixth: [], bench: ["pBench"], inactive: [] } },
  { memberId: "m2", round: 4, slots: { starters: ["pSlump", "pRock"], captain: "pSlump", sixth: [], bench: [], inactive: [] } },
  { memberId: "m3", round: 4, slots: { starters: ["pHurt", "pNew"], captain: "pNew", sixth: [], bench: [], inactive: [] } },
];

const snapshot = (round: number, table: [string, number, number][]): RoundSnapshot => ({
  round,
  phase: "RS",
  table: table.map(([memberId, totalHundredths, roundHundredths]) => ({ memberId, totalHundredths, roundHundredths })),
});

const SNAPSHOTS: RoundSnapshot[] = [
  snapshot(3, [["m1", 60000, 20000], ["m2", 66000, 22000], ["m3", 58000, 19000]]),
  snapshot(4, [["m1", 132000, 72000], ["m2", 92000, 26000], ["m3", 70000, 12000]]),
];

const MEMBERS = [
  { id: "m1", teamName: "Einikio Kabliai", userName: "Andrius" },
  { id: "m2", teamName: "Vafliu Meistrai", userName: "Jonas Petraitis" },
  { id: "m3", teamName: "Kauno Ereliai", userName: "Ruta" },
];

function input(over: Partial<RoundFactsInput> = {}): RoundFactsInput {
  return {
    round: 4,
    ruleset: "euroleague",
    leagueName: "EuroVafliai 26-27",
    members: MEMBERS,
    snapshots: SNAPSHOTS,
    windows: WINDOWS,
    lineups: LINEUPS,
    games: GAMES,
    official: [],
    fixtures,
    players: PLAYERS,
    transactions: [],
    news: [{ player: "pHurt", status: "injured", bodyPart: "Knee", published: "2026-10-02" }],
    nextRound: 5,
    ...over,
  };
}

function facts(over: Partial<RoundFactsInput> = {}) {
  const result = buildRoundFacts(input(over));
  if (!result.ok) throw new Error(result.reason);
  return result.facts;
}

const tokenOf = (sheet: ReturnType<typeof facts>, id: string) =>
  Object.entries(sheet.refs).find(([, ref]) => ref.id === id)?.[0] ?? "(none)";

const lineWith = (sheet: ReturnType<typeof facts>, prefix: string) =>
  sheet.text.split("\n").filter((line) => line.startsWith(prefix));

describe("buildRoundFacts", () => {
  it("refuses a round with no snapshot, and a round nobody scored", () => {
    expect(buildRoundFacts(input({ round: 6 }))).toEqual({ ok: false, reason: "round 6 has no standings snapshot" });
    expect(buildRoundFacts(input({ snapshots: [snapshot(4, [["m1", 0, 0], ["m2", 0, 0]])] }))).toEqual({
      ok: false,
      reason: "nobody scored in round 4",
    });
  });

  it("names the captain's doubled night the top star", () => {
    const sheet = facts();
    const ace = tokenOf(sheet, "pAce");
    // 30.0 raw, doubled as captain: 60.0 counted.
    expect(lineWith(sheet, "STARS")[0]).toMatch(new RegExp(`^STARS \\(by counted\\) · ${ace} 60\\.0`));
    expect(sheet.text).toContain(`${ace} · G · AAA · @T1 captain · raw 30.0 · counted 60.0`);
  });

  it("halves a bench night and calls it a surprise when it beat a starter", () => {
    const sheet = facts();
    const bench = tokenOf(sheet, "pBench");
    expect(lineWith(sheet, "SURPRISE").join("\n")).toContain(
      `${bench} on @T1's bench · raw 18.0, more than a starter · the bench half cost 9.0`,
    );
  });

  it("measures over- and underperformers against their own earlier average", () => {
    const sheet = facts();
    // The bench player counts too: an overperformer is about his night, not his role.
    expect(lineWith(sheet, "OVERPERFORMER")).toEqual([
      `OVERPERFORMER · ${tokenOf(sheet, "pAce")} · +20.0 on his average of 10.0`,
      `OVERPERFORMER · ${tokenOf(sheet, "pBench")} · +12.0 on his average of 6.0`,
    ]);
    expect(lineWith(sheet, "UNDERPERFORMER")).toEqual([
      `UNDERPERFORMER · ${tokenOf(sheet, "pSlump")} · -16.0 on his average of 20.0 · captain`,
    ]);
  });

  it("lets nothing from a later round in", () => {
    const sheet = facts();
    expect(sheet.text).not.toContain("99");
    const without = facts({ games: GAMES.filter((line) => line.round !== 5) });
    expect(without.text).toBe(sheet.text);
  });

  it("calls a starter who did not play a DNP with the reported reason, never an underperformer", () => {
    const sheet = facts();
    const hurt = tokenOf(sheet, "pHurt");
    expect(lineWith(sheet, "DID NOT PLAY")).toEqual([
      `DID NOT PLAY · ${hurt} · @T3 starter · his club played · reported injured, knee`,
    ]);
    expect(lineWith(sheet, "UNDERPERFORMER").join()).not.toContain(hurt);
  });

  it("finds a free agent among the round's best nights", () => {
    const sheet = facts();
    expect(lineWith(sheet, "SURPRISE · free agent")).toEqual([
      `SURPRISE · free agent ${tokenOf(sheet, "pFree")} · 2nd best raw night of the round · owned by nobody`,
    ]);
  });

  it("names a captain flop with what the armband cost", () => {
    const sheet = facts();
    expect(lineWith(sheet, "CAPTAIN FLOP")).toEqual([
      `CAPTAIN FLOP · @T2 captained ${tokenOf(sheet, "pSlump")} (raw 4.0) while ${tokenOf(sheet, "pRock")} scored raw 16.0 · the armband cost 12.0`,
    ]);
  });

  it("notices a player moving into the starting five", () => {
    const sheet = facts();
    expect(lineWith(sheet, "ROLE CHANGE")).toEqual([
      `ROLE CHANGE · ${tokenOf(sheet, "pNew")} started after coming off the bench in 3 of his previous 3 games`,
    ]);
  });

  it("tells the table's moves and who passed whom", () => {
    const sheet = facts();
    expect(lineWith(sheet, "@T1 · 1st · total")[0]).toContain("up 1 from 2nd · passed @T2");
    expect(lineWith(sheet, "TABLE SUMMARY")).toEqual(["TABLE SUMMARY · new leader @T1 (was @T2) · lead 400.0 · last place @T3"]);
  });

  it("says tied rather than winning by nothing", () => {
    const tied = [snapshot(3, SNAPSHOTS[0]!.table.map((row) => [row.memberId, row.totalHundredths, row.roundHundredths])), snapshot(4, [["m1", 80000, 20000], ["m2", 86000, 20000], ["m3", 70000, 12000]])];
    expect(lineWith(facts({ snapshots: tied }), "NIGHT SUMMARY")[0]).toContain("tied for 1st: @T1, @T2");
  });

  it("falls back to last season's average in the first rounds, for EuroLeague scoring only", () => {
    const early = GAMES.filter((line) => line.round >= 3);
    const sheet = facts({ games: early });
    expect(sheet.text).toContain("average before 12.0 over 30 games (last season)");
    const basketNews = facts({ games: early, ruleset: "basketnews" });
    expect(basketNews.text).not.toContain("last season");
  });

  it("prints BasketNews hundredths without a malformed tenth", () => {
    const sheet = facts({ ruleset: "basketnews" });
    expect(sheet.text).not.toMatch(/\d+\.\d+\.\d+/);
    // The feed's BasketNews value is the tenth plus 0.05: 30.05 raw.
    expect(sheet.text).toContain("raw 30.05");
  });

  it("uses BasketNews's published value where a lineup recorded one", () => {
    const sheet = facts({
      ruleset: "basketnews",
      official: [{ memberId: "m1", round: 4, players: [{ playerId: "pAce", rawHundredths: 3333, weightedHundredths: 6666 }] }],
    });
    expect(sheet.text).toContain("raw 33.33 · counted 66.66");
  });

  it("marks teams with no lineup as counted in full", () => {
    const sheet = facts({ lineups: LINEUPS.filter((lineup) => lineup.memberId !== "m3") });
    expect(lineWith(sheet, "META · no lineup recorded")).toEqual(["META · no lineup recorded, everyone counted in full: @T3"]);
  });

  it("reads one team's drop and add in one sync as one exchange", () => {
    const transactions: HistoryRow[] = [
      { id: "tx1", type: "drop", from_round: 4, members: ["m3"], players_in: {}, players_out: { m3: ["pHurt"] }, note: "Synced", date: "2026-10-03 10:00:00.000Z" },
      { id: "tx2", type: "add", from_round: 4, members: ["m3"], players_in: { m3: ["pFree"] }, players_out: {}, note: "Synced", date: "2026-10-03 10:00:30.000Z" },
    ];
    const sheet = facts({ transactions });
    const deals = lineWith(sheet, "NEW DEAL");
    expect(deals).toHaveLength(1);
    expect(deals[0]).toContain(`free-agent exchange from round 4 · @T3 released ${tokenOf(sheet, "pHurt")}, signed ${tokenOf(sheet, "pFree")} · this round +25.0`);
    expect(deals[0]).toContain("biggest swing of the round");
  });

  it("previews the next round with today's availability", () => {
    const sheet = facts();
    // A flag only a person clears can outlive the injury, so its report date travels with it.
    expect(lineWith(sheet, "@T3 · ").at(-1)).toContain(`unavailable now ${tokenOf(sheet, "pHurt")} (injured, reported 2026-10-02)`);
    expect(facts({ nextRound: null }).text).not.toContain("NEXT ROUND");
  });

  it("labels a mover only for a change of two places or more", () => {
    // @T1 went from 2nd to 1st: a passing on its table line, not a mover.
    expect(lineWith(facts(), "MOVER")).toEqual([]);
    const climb = [
      snapshot(3, [["m1", 60000, 20000], ["m2", 66000, 22000], ["m3", 64000, 19000]]),
      snapshot(4, [["m1", 132000, 72000], ["m2", 92000, 26000], ["m3", 70000, 6000]]),
    ];
    expect(lineWith(facts({ snapshots: climb }), "MOVER")).toEqual(["MOVER · @T1 · up 2 to 1st"]);
  });

  it("writes no name and no id: only tokens, club codes and numbers", () => {
    const sheet = facts();
    for (const name of [...MEMBERS.flatMap((member) => [member.teamName, member.userName]), "EuroVafliai", ...PLAYERS.map((player) => player.name.split(",")[0]!)]) {
      expect(sheet.text).not.toContain(name);
    }
    for (const id of [...MEMBERS.map((member) => member.id), ...PLAYERS.map((player) => player.id)]) {
      expect(sheet.text).not.toMatch(new RegExp(`\\b${id}\\b`));
    }
    expect(sheet.privateNames).toEqual(expect.arrayContaining(["Einikio Kabliai", "Andrius", "EuroVafliai 26-27", "Aaron Ace", "Ace"]));
  });

  it("produces the same sheet however the reads came back", () => {
    const shuffled = facts({
      games: [...GAMES].reverse(),
      windows: [...WINDOWS].reverse(),
      players: [...PLAYERS].reverse(),
      members: [...MEMBERS].reverse(),
      snapshots: [...SNAPSHOTS].reverse(),
      fixtures: [...fixtures].reverse(),
    });
    expect(shuffled.text).toBe(facts().text);
    expect(shuffled.refs).toEqual(facts().refs);
  });

  it("passes its own guard: every number in the sheet is allowed", () => {
    const sheet = facts();
    const allowed = new Set(numbersIn(sheet.text));
    const tokens = new Set(Object.keys(sheet.refs));
    const lines = sheet.text.split("\n").filter((line) => line.startsWith("@T") || line.startsWith("STARS"));
    const result = checkWriteup(lines, { allowed, tokens, privateNames: sheet.privateNames });
    expect(result.violations.filter((violation) => !/no "a" or "an"/.test(violation))).toEqual([]);
  });

  it("stays within its size budget for a full twelve-team league", () => {
    const members = Array.from({ length: 12 }, (_, index) => ({ id: `t${String(index).padStart(2, "0")}`, teamName: `Team ${index}`, userName: `User ${index}` }));
    const players: FactsPlayer[] = members.flatMap((member, team) =>
      Array.from({ length: 13 }, (_, slot) => ({
        id: `${member.id}p${String(slot).padStart(2, "0")}`,
        name: `Player${team}x${slot}, Test`,
        position: (["G", "F", "C"] as const)[slot % 3]!,
        clubCode: CLUBS[(team + slot) % CLUBS.length]!,
        status: slot === 0 ? "injured" : "",
        prevSeasonFantasyTenths: 100,
        prevSeasonGames: 20,
      })),
    );
    const clubs = Object.fromEntries(players.map((player) => [player.id, player.clubCode]));
    const games: FactsGame[] = players.flatMap((player, index) =>
      [1, 2, 3, 4].map((round) => {
        const fixture = fixtures.find((row) => row.round === round && (row.localClub === clubs[player.id] || row.roadClub === clubs[player.id]))!;
        return { ...game("pAce", round, 50 + ((index * 37 + round * 11) % 300)), player: player.id, clubCode: clubs[player.id]!, gameCode: fixture.gameCode };
      }),
    );
    const sheet = facts({
      members,
      players,
      games,
      windows: players.map((player) => ({ memberId: player.id.slice(0, 3), playerId: player.id, from_round: 1 })),
      lineups: members.map((member) => {
        const own = players.filter((player) => player.id.startsWith(member.id)).map((player) => player.id);
        return { memberId: member.id, round: 4, slots: { starters: own.slice(0, 5), captain: own[0]!, sixth: own.slice(5, 6), bench: own.slice(6, 10), inactive: own.slice(10) } };
      }),
      snapshots: [3, 4].map((round) => snapshot(round, members.map((member, index) => [member.id, 50000 + index * 1000 * round, 15000 + index * 500]))),
      news: [],
    });
    expect(sheet.text.length).toBeLessThan(20_000);
  });
});
