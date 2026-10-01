import { describe, expect, it } from "vitest";

import rostersJson from "./fixtures/league-rosters.json";
import poolJson from "./fixtures/pool.json";
import { matchPlayer, resolveClubs, resolveFantasy, type PoolPlayer, type SyncMember } from "./match";
import { parseLeagueRosters, type FantasyPlayer } from "./parse";

const teams = parseLeagueRosters(rostersJson);
const pool: PoolPlayer[] = poolJson.map((row) => ({
  id: row.id,
  name: row.name,
  nameNormalized: row.name_normalized,
  clubCode: row.club_code,
  clubName: row.club_name,
  dorsal: row.dorsal,
  fantasyId: "",
  status: row.status,
}));
const members: SyncMember[] = teams.map((team, index) => ({
  id: `member_${index}`,
  teamName: index === 2 ? team.name.toUpperCase() : team.name,
  fantasyTeamId: "",
}));

function official(overrides: Partial<FantasyPlayer>): FantasyPlayer {
  return {
    id: "9001",
    firstName: "Walter",
    lastName: "Tavares",
    jersey: "22",
    position: "C",
    club: { id: "153", name: "Real Madrid" },
    ...overrides,
  };
}

describe("resolveFantasy against the real league on 30 September 2026", () => {
  const resolution = resolveFantasy(teams, members, pool);

  it("places every rostered player without a question", () => {
    expect(resolution.questions).toEqual([]);
    expect(resolution.players.size).toBe(104);
    expect(new Set(resolution.players.values()).size).toBe(104);
  });

  it("links every team by name, whatever the letter case", () => {
    expect(resolution.teams.size).toBe(8);
    expect(resolution.teamLinks).toHaveLength(8);
  });

  it("maps all twenty clubs by name", () => {
    expect(new Set(resolveClubs(teams, pool).values()).size).toBe(20);
  });

  it("finds the players whose official names are nicknames", () => {
    const byName = new Map(pool.map((row) => [row.id, row.name]));
    const named = (last: string) => {
      const player = teams.flatMap((team) => team.players).find((row) => row.lastName === last);
      return player ? byName.get(resolution.players.get(player.id) ?? "") : undefined;
    };
    expect(named("Tavares")).toMatch(/^Tavares/);
    expect(named("Miller-Mcintyre")).toBe("Miller-Mc Intyre, Codi Tyree");
  });
});

describe("resolveFantasy", () => {
  it("trusts a stored link over any heuristic", () => {
    const stored = pool.map((row) => (row.name.startsWith("Campazzo") ? { ...row, fantasyId: "9001" } : row));
    const team = { id: "t1", name: "Solo", manager: "", players: [official({})] };
    const result = resolveFantasy([team], [{ id: "m1", teamName: "Solo", fantasyTeamId: "" }], stored);
    expect(pool.find((row) => row.id === result.players.get("9001"))?.name).toMatch(/^Campazzo/);
    expect(result.playerLinks).toEqual([]);
  });

  it("asks when two official players claim one of ours", () => {
    const team = {
      id: "t1",
      name: "Solo",
      manager: "",
      players: [official({ id: "1" }), official({ id: "2" })],
    };
    const result = resolveFantasy([team], [{ id: "m1", teamName: "Solo", fantasyTeamId: "" }], pool);
    expect(result.players.size).toBe(0);
    expect(result.questions.filter((question) => question.kind === "player")).toHaveLength(2);
  });

  it("asks which member an unrecognised team is, offering only unlinked members", () => {
    const result = resolveFantasy(
      [
        { id: "t1", name: "Known", manager: "A", players: [] },
        { id: "t2", name: "Renamed", manager: "B", players: [] },
      ],
      [
        { id: "m1", teamName: "Known", fantasyTeamId: "" },
        { id: "m2", teamName: "Old name", fantasyTeamId: "" },
      ],
      pool,
    );
    expect(result.teams.get("t1")).toBe("m1");
    expect(result.questions).toEqual([
      {
        kind: "team",
        fantasyTeamId: "t2",
        fantasyTeamName: "Renamed",
        manager: "B",
        choices: [{ id: "m2", label: "Old name" }],
      },
    ]);
  });

  it("names a member who has no team in the official league", () => {
    const result = resolveFantasy(
      [{ id: "t1", name: "Known", manager: "", players: [] }],
      [
        { id: "m1", teamName: "Known", fantasyTeamId: "" },
        { id: "m2", teamName: "Extra", fantasyTeamId: "" },
      ],
      pool,
    );
    expect(result.questions).toEqual([{ kind: "member", memberId: "m2", teamName: "Extra", choices: [] }]);
  });

  it("ignores a stored team link the official league no longer has", () => {
    const result = resolveFantasy(
      [{ id: "t9", name: "Known", manager: "", players: [] }],
      [{ id: "m1", teamName: "Known", fantasyTeamId: "t1" }],
      pool,
    );
    expect(result.teams.get("t9")).toBe("m1");
  });
});

describe("matchPlayer", () => {
  const madrid = "MAD";

  it("matches a surname inside the club", () => {
    expect(matchPlayer(official({}), madrid, pool)?.name).toMatch(/^Tavares/);
  });

  it("drops a generational suffix before matching", () => {
    const player = official({ lastName: "Tavares Jr." });
    expect(matchPlayer(player, madrid, pool)?.name).toMatch(/^Tavares/);
  });

  it("refuses to guess across clubs without a jersey to confirm it", () => {
    expect(matchPlayer(official({ jersey: "" }), undefined, pool)).toBeNull();
  });

  it("refuses a player nobody in the club resembles", () => {
    expect(matchPlayer(official({ lastName: "Nobody", firstName: "Some", jersey: "99" }), madrid, pool)).toBeNull();
  });
});
