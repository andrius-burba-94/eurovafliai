import { describe, expect, it } from "vitest";

import type { Position } from "@/lib/engine";
import type { FantasyPlayer } from "@/lib/fantasy/parse";
import { fakePb, type FakeRecord } from "../../../tests/unit/helpers/fake-pb";

import { answerQuestion, readDuePositions, type PoolReaders } from "./store";

const NOW = new Date("2026-10-10T12:00:00Z");
const HOUR = 60 * 60_000;

/**
 * Thirteen players on one club: five guards, five forwards, two centers and
 * Omoruyi, whom BasketNews calls a center and the Fantasy Challenge and the
 * EuroLeague feed call a forward. So the roster counts 5/5/3 in BasketNews's
 * positions and 5/6/2 in the others.
 */
const ROSTER: { id: string; name: string; euroleague: Position; fantasy: Position; basketnews: Position }[] = [
  ...["g1", "g2", "g3", "g4", "g5"].map((id) => ({ id, name: `Guard, ${id}`, euroleague: "G" as const, fantasy: "G" as const, basketnews: "G" as const })),
  ...["f1", "f2", "f3", "f4", "f5"].map((id) => ({ id, name: `Forward, ${id}`, euroleague: "F" as const, fantasy: "F" as const, basketnews: "F" as const })),
  { id: "omoruyi", name: "Omoruyi, Eugene", euroleague: "F", fantasy: "F", basketnews: "C" },
  ...["c1", "c2"].map((id) => ({ id, name: `Center, ${id}`, euroleague: "C" as const, fantasy: "C" as const, basketnews: "C" as const })),
];

function playerRow(player: (typeof ROSTER)[number], extra: Partial<FakeRecord> = {}): FakeRecord {
  return {
    id: player.id,
    name: player.name,
    name_normalized: player.name.toLowerCase().replace(/,/g, ""),
    club_code: "PAR",
    club_name: "Paris Basketball",
    dorsal: "",
    status: "active",
    position: player.euroleague,
    fantasy_id: `fc-${player.id}`,
    basketnews_id: `bn-${player.id}`,
    ...extra,
  };
}

const entry = (player: (typeof ROSTER)[number], source: "fantasy" | "basketnews"): FantasyPlayer => ({
  id: `${source === "fantasy" ? "fc" : "bn"}-${player.id}`,
  firstName: "",
  lastName: player.name.split(",")[0]!,
  jersey: "",
  position: source === "fantasy" ? player.fantasy : player.basketnews,
  club: { id: "paris", name: "Paris Basketball" },
});

function setup(options: {
  link: "fantasy" | "basketnews";
  readAt?: string;
  players?: FakeRecord[];
  withRoster?: boolean;
  questions?: FakeRecord[];
}) {
  const league = {
    id: "lg",
    commissioner: "u1",
    settings: {},
    positions_read_at: options.readAt ?? "",
    fantasy_league_id: options.link === "fantasy" ? "147" : "",
    basketnews_team_id: options.link === "basketnews" ? "6ab26d119050fb90221c5697" : "",
  };
  const fake = fakePb({
    data: {
      leagues: [league],
      league_members: [{ id: "m1", league: "lg", user: "u1" }],
      players: options.players ?? ROSTER.map((player) => playerRow(player)),
      roster_memberships: options.withRoster
        ? ROSTER.map((player, index) => ({ id: `rm${index}`, league: "lg", member: "m1", player: player.id, to_date: "" }))
        : [],
      position_questions: options.questions ?? [],
    },
  });
  const calls = { fantasy: 0, basketnews: 0 };
  const readers: PoolReaders = {
    fantasy: async () => {
      calls.fantasy += 1;
      return ROSTER.map((player) => entry(player, "fantasy"));
    },
    basketnews: async () => {
      calls.basketnews += 1;
      return ROSTER.map((player) => entry(player, "basketnews"));
    },
  };
  return { fake, calls, readers };
}

const openQuestions = (rows: FakeRecord[]) => rows.filter((row) => row.status === "open");

describe("readDuePositions: when a league's game is read", () => {
  it("reads a new league on the next pass and stores every position as an addition", async () => {
    const { fake, calls, readers } = setup({ link: "fantasy" });
    const reports = await readDuePositions({ pb: fake.client, now: NOW, readers });

    expect(calls.fantasy).toBe(1);
    expect(reports).toMatchObject([{ leagueId: "lg", source: "fantasy", additions: 13, questions: 0 }]);
    expect(fake.rows("players").find((row) => row.id === "omoruyi")).toMatchObject({ fantasy_position: "F", fantasy_listed: true });
    expect(fake.rows("leagues")[0]!.positions_read_at).not.toBe("");
  });

  it("does not read again until a day has passed, then reads again", async () => {
    const { fake, calls, readers } = setup({ link: "basketnews" });
    await readDuePositions({ pb: fake.client, now: NOW, readers });
    await readDuePositions({ pb: fake.client, now: new Date(NOW.getTime() + 23 * HOUR), readers });
    expect(calls.basketnews).toBe(1);
    await readDuePositions({ pb: fake.client, now: new Date(NOW.getTime() + 25 * HOUR), readers });
    expect(calls.basketnews).toBe(2);
  });

  it("writes nothing on a re-run over what is already stored", async () => {
    const { fake, readers } = setup({ link: "basketnews" });
    await readDuePositions({ pb: fake.client, now: NOW, readers });
    fake.rows("leagues")[0]!.positions_read_at = "";
    const before = fake.writes.length;
    const [again] = await readDuePositions({ pb: fake.client, now: NOW, readers });
    expect(again).toMatchObject({ links: 0, additions: 0, questions: 0 });
    expect(fake.writes.slice(before)).toEqual(["update leagues:lg"]);
  });

  it("reads no Fantasy Challenge pool without a token, and leaves the league due", async () => {
    const { fake, readers } = setup({ link: "fantasy" });
    const reports = await readDuePositions({ pb: fake.client, now: NOW, readers: { ...readers, fantasy: null } });
    expect(reports).toEqual([]);
    expect(fake.rows("leagues")[0]!.positions_read_at).toBe("");
  });

  it("reports a failed read and leaves the league due for the next pass", async () => {
    const { fake, readers } = setup({ link: "basketnews" });
    const failing = { ...readers, basketnews: async () => Promise.reject(new Error("BasketNews returned HTTP 502.")) };
    const [report] = await readDuePositions({ pb: fake.client, now: NOW, readers: failing });
    expect(report).toMatchObject({ leagueId: "lg", error: "BasketNews returned HTTP 502." });
    expect(fake.rows("leagues")[0]!.positions_read_at).toBe("");
  });
});

describe("readDuePositions: questions", () => {
  const storedForward = ROSTER.map((player) => playerRow(player, player.id === "omoruyi" ? { basketnews_position: "F" } : {}));

  it("asks once about a stored position the game now reports differently, and never changes it", async () => {
    const { fake, readers } = setup({ link: "basketnews", players: storedForward });
    await readDuePositions({ pb: fake.client, now: NOW, readers });
    await readDuePositions({ pb: fake.client, now: new Date(NOW.getTime() + 25 * HOUR), readers });

    expect(openQuestions(fake.rows("position_questions"))).toEqual([
      expect.objectContaining({ league: "lg", source: "basketnews", kind: "player", player: "omoruyi", stored_position: "F", read_position: "C" }),
    ]);
    expect(fake.rows("players").find((row) => row.id === "omoruyi")!.basketnews_position).toBe("F");
  });

  it("asks nothing about a confirmed position", async () => {
    const confirmed = storedForward.map((row) => (row.id === "omoruyi" ? { ...row, basketnews_position_confirmed: true } : row));
    const { fake, readers } = setup({ link: "basketnews", players: confirmed });
    await readDuePositions({ pb: fake.client, now: NOW, readers });
    expect(fake.rows("position_questions")).toEqual([]);
  });

  it("resolves an open question the game no longer disagrees with", async () => {
    const { fake, readers } = setup({
      link: "basketnews",
      questions: [{ id: "q1", league: "lg", source: "basketnews", kind: "player", player: "omoruyi", status: "open", open_key: "player:lg:omoruyi" }],
    });
    await readDuePositions({ pb: fake.client, now: NOW, readers });
    expect(fake.rows("position_questions")[0]).toMatchObject({ status: "resolved", open_key: "" });
  });
});

describe("readDuePositions: a roster that does not count 5/5/3 in the league's game", () => {
  it("BasketNews counts Omoruyi as a center, so his roster counts", async () => {
    const { fake, readers } = setup({ link: "basketnews", withRoster: true });
    await readDuePositions({ pb: fake.client, now: NOW, readers });
    expect(fake.rows("position_questions")).toEqual([]);
  });

  it("the same roster read by the Fantasy Challenge counts 6 forwards and 2 centers: a question listing it", async () => {
    const { fake, readers } = setup({ link: "fantasy", withRoster: true });
    const [report] = await readDuePositions({ pb: fake.client, now: NOW, readers });

    expect(report).toMatchObject({ rosterQuestions: 1 });
    const [question] = openQuestions(fake.rows("position_questions"));
    expect(question).toMatchObject({ kind: "roster", source: "fantasy", member: "m1", open_key: "roster:lg:m1" });
    expect(question!.roster).toContainEqual({ player: "omoruyi", position: "F" });
    expect(question!.roster).toHaveLength(13);
  });

  it("closes the roster question once the roster counts again", async () => {
    const { fake, readers } = setup({ link: "fantasy", withRoster: true });
    await readDuePositions({ pb: fake.client, now: NOW, readers });
    // The commissioner's answer: a center in this league's game, confirmed.
    Object.assign(fake.rows("players").find((row) => row.id === "omoruyi")!, { fantasy_position: "C", fantasy_position_confirmed: true });
    fake.rows("leagues")[0]!.positions_read_at = "";
    await readDuePositions({ pb: fake.client, now: NOW, readers });
    expect(openQuestions(fake.rows("position_questions"))).toEqual([]);
    expect(fake.rows("position_questions")[0]).toMatchObject({ status: "resolved" });
  });
});

describe("answerQuestion", () => {
  const question = (overrides: Partial<FakeRecord> = {}): FakeRecord => ({
    id: "q1", league: "lg", source: "basketnews", kind: "player", player: "omoruyi",
    stored_position: "F", read_position: "C", status: "open", open_key: "player:lg:omoruyi", ...overrides,
  });

  function answering(questions: FakeRecord[], members: FakeRecord[] = [{ id: "m1", league: "lg", user: "u1" }, { id: "m2", league: "lg", user: "u2" }]) {
    const { fake } = setup({ link: "basketnews", withRoster: true, questions });
    fake.db.league_members = members;
    return fake;
  }

  it("lets the commissioner answer: the game's position is written and confirmed, the question closed", async () => {
    const fake = answering([question(), question({ id: "q2", league: "other", open_key: "player:other:omoruyi" })]);
    const result = await answerQuestion(fake.client, { questionId: "q1", position: "C", userId: "u1", now: NOW });

    expect(result).toEqual({ ok: true, playerId: "omoruyi", source: "basketnews", position: "C" });
    expect(fake.rows("players").find((row) => row.id === "omoruyi")).toMatchObject({ basketnews_position: "C", basketnews_position_confirmed: true });
    expect(fake.rows("position_questions")).toEqual([
      expect.objectContaining({ id: "q1", status: "answered", answer: "C", answered_by: "u1", open_key: "" }),
      expect.objectContaining({ id: "q2", status: "answered", answer: "C", open_key: "" }),
    ]);
  });

  it("lets a deputy answer, and refuses a plain member", async () => {
    const deputy = answering([question()], [{ id: "m2", league: "lg", user: "u2", can_manage: true }]);
    expect(await answerQuestion(deputy.client, { questionId: "q1", position: "C", userId: "u2", now: NOW })).toMatchObject({ ok: true });

    const member = answering([question()], [{ id: "m3", league: "lg", user: "u3", can_manage: false }]);
    expect(await answerQuestion(member.client, { questionId: "q1", position: "C", userId: "u3", now: NOW })).toEqual({
      ok: false, error: "Only the league's commissioner or a deputy can answer this.",
    });
    expect(member.rows("players").find((row) => row.id === "omoruyi")!.basketnews_position_confirmed).toBeUndefined();
  });

  it("answers a roster question for one of that roster's players, and closes it once the roster counts", async () => {
    const roster = ROSTER.map((player) => ({ player: player.id, position: player.fantasy }));
    const fake = answering([question({ kind: "roster", source: "fantasy", player: "", member: "m1", roster, open_key: "roster:lg:m1" })]);
    fake.db.leagues![0] = { ...fake.db.leagues![0]!, fantasy_league_id: "147", basketnews_team_id: "" };

    expect(await answerQuestion(fake.client, { questionId: "q1", playerId: "nobody", position: "C", userId: "u1", now: NOW })).toEqual({
      ok: false, error: "That player is not on this roster.",
    });
    await answerQuestion(fake.client, { questionId: "q1", playerId: "omoruyi", position: "C", userId: "u1", now: NOW });
    expect(fake.rows("players").find((row) => row.id === "omoruyi")).toMatchObject({ fantasy_position: "C", fantasy_position_confirmed: true });
    expect(fake.rows("position_questions")[0]).toMatchObject({ status: "answered", open_key: "" });
  });

  it("refuses a question already answered", async () => {
    const fake = answering([question({ status: "answered", open_key: "" })]);
    expect(await answerQuestion(fake.client, { questionId: "q1", position: "C", userId: "u1", now: NOW })).toEqual({
      ok: false, error: "This question has already been answered.",
    });
  });
});
