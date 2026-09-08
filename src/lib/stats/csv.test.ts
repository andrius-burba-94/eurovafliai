import { describe, expect, it } from "vitest";

import {
  CSV_TEMPLATE_HEADER,
  parseStatCsv,
  phaseForRound,
} from "./csv";
import golden from "./fixtures/e2025-boxscores.json";
import { scoreGame } from "./scoring";

const HEADER =
  "personCode,gameCode,round,clubCode,teamScore,opponentScore,points," +
  "fieldGoalsMade2,fieldGoalsAttempted2,fieldGoalsMade3,fieldGoalsAttempted3," +
  "freeThrowsMade,freeThrowsAttempted,totalRebounds,assistances,steals," +
  "turnovers,blocksFavour,blocksAgainst,foulsCommited,foulsReceived";

/** A complete line: 7 points, 3 rebounds, on an 85–78 win. */
const LINE = "006590,1,1,IST,85,78,7,3,7,0,4,1,1,3,2,0,0,0,1,2,2";

const parse = (...lines: string[]) => parseStatCsv([HEADER, ...lines].join("\n"));

describe("parseStatCsv — the shape of the sheet", () => {
  it("reads one complete line", () => {
    const { rows, problems } = parse(LINE);
    expect(problems).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      personCode: "006590",
      gameCode: 1,
      round: 1,
      phase: "RS",
      clubCode: "IST",
      teamScore: 85,
      opponentScore: 78,
      won: true,
      line: 2,
    });
    // PIR 3 for that line, and a win, so 3.3 → 33 tenths.
    expect(scoreGame(rows[0]!.box, rows[0]!.won)).toMatchObject({
      base: 3,
      fantasyTenths: 33,
    });
  });

  it("requires a header, and says which columns are missing", () => {
    const { rows, problems } = parseStatCsv(
      ["personCode,gameCode,points", "006590,1,7"].join("\n"),
    );
    expect(rows).toEqual([]);
    expect(problems[0]).toContain("missing");
    expect(problems[0]).toContain("round");
    expect(problems[0]).toContain("turnovers");
    // And it hands back the header to copy rather than only complaining.
    expect(problems[1]).toContain(CSV_TEMPLATE_HEADER);
  });

  it("says so plainly when the box is empty", () => {
    expect(parseStatCsv("   \n\n").problems).toEqual([
      "Nothing to import — the box is empty.",
    ]);
  });

  it("accepts the aliases a spreadsheet actually uses", () => {
    const { rows, problems } = parseStatCsv(
      [
        "Person Code,Game,Round,Team,Score,Score Against,PTS,fgm2,fga2,fgm3,fga3,ftm,fta,REB,AST,STL,TO,BLK,Blk Against,Fouls,Fouls Drawn",
        LINE,
      ].join("\n"),
    );
    expect(problems).toEqual([]);
    expect(rows[0]).toMatchObject({ personCode: "006590", clubCode: "IST" });
    expect(rows[0]!.box.points).toBe(7);
    expect(rows[0]!.box.turnovers).toBe(0);
  });

  it("reports a column it does not know instead of failing on it", () => {
    const { rows, ignoredColumns, problems } = parseStatCsv(
      [`${HEADER},Nickname`, `${LINE},Rudy`].join("\n"),
    );
    expect(problems).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(ignoredColumns).toEqual(["Nickname"]);
  });

  it("uppercases a club code and keeps a person code verbatim", () => {
    // Person codes are zero-padded strings — `006590`, not 6590 — so anything
    // that made them numbers would lose the padding and match nothing.
    const { rows } = parse(LINE.replace(",IST,", ",ist,"));
    expect(rows[0]!.clubCode).toBe("IST");
    expect(rows[0]!.personCode).toBe("006590");
  });

  it("takes minutes, seconds or a clock for time played", () => {
    const withTime = (value: string) =>
      parseStatCsv(
        [`${HEADER},timePlayed`, `${LINE},${value}`].join("\n"),
      ).rows[0]!.box.timePlayed;
    expect(withTime("1850")).toBe(1850);
    expect(withTime("30:50")).toBe(1850);
    expect(withTime("30")).toBe(1800);
    expect(withTime("")).toBe(0);
    expect(
      parseStatCsv([`${HEADER},timePlayed`, `${LINE},half`].join("\n"))
        .problems[0],
    ).toContain("timePlayed");
  });

  it("sums the rebound split when there is no total", () => {
    const header = HEADER.replace(
      "totalRebounds",
      "offensiveRebounds,defensiveRebounds",
    );
    const { rows, problems } = parseStatCsv(
      [header, LINE.replace(",3,2,0,0,0,1,2,2", ",2,1,2,0,0,0,1,2,2")].join(
        "\n",
      ),
    );
    expect(problems).toEqual([]);
    expect(rows[0]!.box.totalRebounds).toBe(3);
  });

  it("refuses a sheet with no rebounds at all", () => {
    const { problems } = parseStatCsv(
      [
        HEADER.replace(",totalRebounds", ""),
        LINE.replace(",3,2,0,0,0,1,2,2", ",2,0,0,0,1,2,2"),
      ].join("\n"),
    );
    expect(problems[0]).toContain("no rebounds");
  });
});

describe("parseStatCsv — what it refuses", () => {
  it("refuses a row with no person code", () => {
    expect(parse(LINE.replace("006590", "")).problems[0]).toContain(
      "no person code",
    );
  });

  it("refuses a decimal where a count belongs", () => {
    const { rows, problems } = parse(LINE.replace(",7,3,7,", ",7.5,3,7,"));
    expect(rows).toEqual([]);
    expect(problems[0]).toContain("not a whole number");
  });

  it("refuses an empty required cell rather than reading it as nought", () => {
    // The whole reason the header is mandatory: a blank turnover column would
    // otherwise score a season without turnovers and look plausible.
    const { rows, problems } = parse(LINE.replace(",0,0,0,1,2,2", ",0,,0,1,2,2"));
    expect(rows).toEqual([]);
    expect(problems[0]).toContain("required");
  });

  it("refuses more made than attempted", () => {
    expect(parse(LINE.replace(",7,3,7,0,4,", ",7,9,7,0,4,")).problems[0]).toContain(
      "more two-pointers made than attempted",
    );
    expect(
      parse(LINE.replace(",0,4,1,1,", ",0,4,3,1,")).problems[0],
    ).toContain("more free throws made than attempted");
  });

  it("refuses a rebound split that does not add up to its own total", () => {
    const header = HEADER.replace(
      "totalRebounds",
      "offensiveRebounds,defensiveRebounds,totalRebounds",
    );
    const { problems } = parseStatCsv(
      [header, LINE.replace(",3,2,0,", ",2,1,9,2,0,")].join("\n"),
    );
    expect(problems[0]).toContain("is not 9 total");
  });

  it("refuses a level score, because that is how an unplayed game arrives", () => {
    // E2026 game 1 answers 200 with `players: []` and 0–0 rather than 404ing,
    // so "not played yet" and "everybody scored nothing" look identical.
    const { rows, problems } = parse(LINE.replace(",85,78,", ",0,0,"));
    expect(rows).toEqual([]);
    expect(problems[0]).toContain("level");
  });

  it("refuses a game code or round that counts from nought", () => {
    expect(parse(LINE.replace("006590,1,1,", "006590,0,1,")).problems[0]).toContain(
      "game code counts from 1",
    );
    expect(parse(LINE.replace("006590,1,1,", "006590,1,0,")).problems[0]).toContain(
      "round counts from 1",
    );
  });

  it("refuses a phase it has never heard of", () => {
    const { problems } = parseStatCsv(
      [`${HEADER},phase`, `${LINE},SEMIS`].join("\n"),
    );
    expect(problems[0]).toContain("not a phase");
  });

  it("names both lines when one player has a game twice", () => {
    const { rows, problems } = parse(LINE, LINE);
    expect(rows).toHaveLength(1);
    expect(problems[0]).toContain("already has game 1 on line 2");
  });

  it("keeps the good lines when one is bad", () => {
    const { rows, problems } = parse(
      LINE,
      LINE.replace("006590,1,", "006591,1,").replace(",7,3,7,", ",x,3,7,"),
      LINE.replace("006590,1,", "006592,1,"),
    );
    expect(rows.map((row) => row.personCode)).toEqual(["006590", "006592"]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("Line 3");
  });
});

describe("parseStatCsv — the PIR self-check", () => {
  it("accepts a row whose stated PIR matches its own numbers", () => {
    const { rows, problems, checkedAgainstPir } = parseStatCsv(
      [`${HEADER},valuation`, `${LINE},3`].join("\n"),
    );
    expect(problems).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(checkedAgainstPir).toBe(1);
  });

  it("refuses a row whose stated PIR disagrees, rather than picking a side", () => {
    const { rows, problems } = parseStatCsv(
      [`${HEADER},valuation`, `${LINE},11`].join("\n"),
    );
    expect(rows).toEqual([]);
    expect(problems[0]).toContain("PIR 11 does not match the 3");
  });

  it("counts nothing as checked when the sheet brings no PIR", () => {
    expect(parse(LINE).checkedAgainstPir).toBe(0);
  });
});

describe("phaseForRound", () => {
  it.each([
    [1, "RS"],
    [38, "RS"],
    [39, "PI"],
    [40, "PI"],
    [41, "PO"],
    [45, "PO"],
    [46, "FF"],
    [47, "FF"],
  ])("puts round %i in %s", (round, phase) => {
    expect(phaseForRound(round)).toBe(phase);
  });
});

describe("the whole of E2025, through the CSV door", () => {
  /**
   * The strongest test in this file: render the golden fixture *as a CSV*,
   * parse it back, and check every row against the Euroleague's own PIR. It
   * covers the parser and the scorer together over 168 real lines — including
   * the eight that are negative PIR on a win, and the did-not-play lines that
   * are all zeros.
   */
  const games = golden.games as {
    gameCode: number;
    round: number;
    phase: string;
    localClub: string;
    localScore: number;
    roadClub: string;
    roadScore: number;
    rows: {
      personCode: string;
      club: string;
      won: boolean;
      valuation: number;
      stats: Record<string, number>;
    }[];
  }[];

  const columns = CSV_TEMPLATE_HEADER.split(",");
  const text = [
    CSV_TEMPLATE_HEADER,
    ...games.flatMap((game) =>
      game.rows.map((row) => {
        const own = row.club === game.localClub ? game.localScore : game.roadScore;
        const other =
          row.club === game.localClub ? game.roadScore : game.localScore;
        const values: Record<string, number | string> = {
          personCode: row.personCode,
          gameCode: game.gameCode,
          round: game.round,
          phase: game.phase,
          clubCode: row.club,
          teamScore: own,
          opponentScore: other,
          valuation: row.valuation,
          ...row.stats,
        };
        return columns.map((column) => values[column] ?? 0).join(",");
      }),
    ),
  ].join("\n");

  it("imports every line of seven real games, with nothing refused", () => {
    const { rows, problems, ignoredColumns, checkedAgainstPir } =
      parseStatCsv(text);
    expect(problems).toEqual([]);
    expect(ignoredColumns).toEqual([]);
    expect(rows).toHaveLength(168);
    // Every single one carried a PIR, and every single one agreed.
    expect(checkedAgainstPir).toBe(168);
  });

  it("derives the same winner the scoreline does, for all 168", () => {
    const { rows } = parseStatCsv(text);
    const expected = new Map(
      games.flatMap((game) =>
        game.rows.map((row) => [`${row.personCode}:${game.gameCode}`, row.won]),
      ),
    );
    for (const row of rows) {
      expect(row.won).toBe(expected.get(`${row.personCode}:${row.gameCode}`));
    }
  });
});
