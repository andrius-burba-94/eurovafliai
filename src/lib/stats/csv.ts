/**
 * The stat CSV — parse and nothing else.
 *
 * Pure, like `src/lib/rosters/csv.ts` and for the same reason: this is the
 * source that gets used when the automated fetcher (4.3) is down, wrong, or
 * not written yet, so it has to be testable without a network and without a
 * database.
 *
 * ## The columns are the feed's own names
 *
 * `points`, `totalRebounds`, `blocksFavour`, `foulsCommited` — one `t`,
 * because that is how the API spells it. Ugly to type; unambiguous to map. The
 * CSV door and the fetcher normalize into the *same* `BoxScore`, so there is
 * one vocabulary for these nineteen numbers and no translation table to drift
 * out of step. Common spreadsheet aliases are accepted too (`pts`, `reb`,
 * `ast`, `fga2`…), because the header is documented on the page but nobody
 * reads a page.
 *
 * A **header row is required** here, unlike the roster CSV. Nineteen stat
 * columns have no defensible default order, and guessing one would let a
 * shifted sheet import silently as a season of wrong numbers.
 *
 * ## There is no `won` column
 *
 * A row carries `teamScore` and `opponentScore`, and the win is derived. This
 * is the same rule the research file arrived at the hard way: the API's own
 * `winner` field is the season's champion on every game of the season, so
 * reading a *stated* winner rather than the scoreline would have given one
 * club a 10% bonus in all 38 rounds and nobody else one, ever. A `won` column
 * would reintroduce exactly that failure by hand — a place for a typo to
 * disagree with the scoreline, with no way to tell which was meant.
 *
 * ## And if the sheet brings PIR, we check ourselves against it
 *
 * `valuation` is optional, and when present it is the Euroleague's own PIR for
 * that line. Every row that carries one is compared against what `scoreGame`
 * computes and a disagreement is **refused, not imported**. So the golden test
 * does not only run in CI against seven games from last season: it runs on
 * every real import, against every row, forever.
 */
import { splitCsvLine } from "@/lib/csv/split";

import { type BoxScore, scoreGame } from "./scoring";

/** A phase code, as the feed spells it. */
export type Phase = "RS" | "PI" | "PO" | "FF";
export const PHASES: readonly Phase[] = ["RS", "PI", "PO", "FF"];

export type ParsedStatRow = {
  readonly personCode: string;
  /**
   * The name the *source* gave this line, when it gave one.
   *
   * The API sends it; a stat CSV has no name column, because the person code is
   * the identity and a name column would be a second place to disagree. It is
   * carried purely so that an **unmatched** code can be reported as a person
   * rather than as a number — 4.2 cannot suggest a match for `099999`, but it
   * can for `Juzang, Jonathan (ULK)`.
   */
  readonly name?: string;
  readonly gameCode: number;
  readonly round: number;
  readonly phase: Phase;
  readonly clubCode: string;
  readonly teamScore: number;
  readonly opponentScore: number;
  /** Derived from the two scores. Never read from the sheet. */
  readonly won: boolean;
  readonly box: BoxScore;
  /** The line number this came from, so a later refusal can name it. */
  readonly line: number;
};

type Field =
  | keyof BoxScore
  | "personCode"
  | "gameCode"
  | "round"
  | "phase"
  | "clubCode"
  | "teamScore"
  | "opponentScore"
  | "valuation";

/**
 * Header aliases, folded to lower case with spaces and underscores stripped —
 * so `Fouls Received`, `fouls_received` and `foulsReceived` are one column.
 */
const HEADERS: Record<string, Field> = {
  // Identity and game
  personcode: "personCode",
  person: "personCode",
  code: "personCode",
  playercode: "personCode",
  playerid: "personCode",
  gamecode: "gameCode",
  game: "gameCode",
  round: "round",
  phase: "phase",
  phasetype: "phase",
  club: "clubCode",
  clubcode: "clubCode",
  team: "clubCode",
  teamcode: "clubCode",
  teamscore: "teamScore",
  score: "teamScore",
  scorefor: "teamScore",
  opponentscore: "opponentScore",
  scoreagainst: "opponentScore",
  // The line itself
  timeplayed: "timePlayed",
  minutes: "timePlayed",
  min: "timePlayed",
  points: "points",
  pts: "points",
  fieldgoalsmade2: "fieldGoalsMade2",
  fgm2: "fieldGoalsMade2",
  fieldgoalsattempted2: "fieldGoalsAttempted2",
  fga2: "fieldGoalsAttempted2",
  fieldgoalsmade3: "fieldGoalsMade3",
  fgm3: "fieldGoalsMade3",
  fieldgoalsattempted3: "fieldGoalsAttempted3",
  fga3: "fieldGoalsAttempted3",
  freethrowsmade: "freeThrowsMade",
  ftm: "freeThrowsMade",
  freethrowsattempted: "freeThrowsAttempted",
  fta: "freeThrowsAttempted",
  offensiverebounds: "offensiveRebounds",
  oreb: "offensiveRebounds",
  defensiverebounds: "defensiveRebounds",
  dreb: "defensiveRebounds",
  totalrebounds: "totalRebounds",
  reb: "totalRebounds",
  rebounds: "totalRebounds",
  assistances: "assistances",
  assists: "assistances",
  ast: "assistances",
  steals: "steals",
  stl: "steals",
  turnovers: "turnovers",
  to: "turnovers",
  blocksfavour: "blocksFavour",
  blocksfor: "blocksFavour",
  blk: "blocksFavour",
  blocksagainst: "blocksAgainst",
  blkagainst: "blocksAgainst",
  foulscommited: "foulsCommited",
  foulscommitted: "foulsCommited",
  fouls: "foulsCommited",
  pf: "foulsCommited",
  foulsreceived: "foulsReceived",
  foulsdrawn: "foulsReceived",
  plusminus: "plusMinus",
  valuation: "valuation",
  pir: "valuation",
};

/**
 * Columns without which a row cannot be scored or placed.
 *
 * `totalRebounds` is absent from this list on purpose: a sheet that brings the
 * offensive/defensive split and no total is complete, and summing it is not a
 * guess. Every other PIR component must be named, because a missing stat
 * column would otherwise read as a zero — a whole season silently scored
 * without turnovers is the kind of wrong that looks plausible on a page.
 */
const REQUIRED: readonly Field[] = [
  "personCode",
  "gameCode",
  "round",
  "clubCode",
  "teamScore",
  "opponentScore",
  "points",
  "fieldGoalsMade2",
  "fieldGoalsAttempted2",
  "fieldGoalsMade3",
  "fieldGoalsAttempted3",
  "freeThrowsMade",
  "freeThrowsAttempted",
  "assistances",
  "steals",
  "turnovers",
  "blocksFavour",
  "blocksAgainst",
  "foulsCommited",
  "foulsReceived",
];

/** The header a commissioner can copy off the page and fill in. */
export const CSV_TEMPLATE_HEADER = [
  "personCode",
  "gameCode",
  "round",
  "phase",
  "clubCode",
  "teamScore",
  "opponentScore",
  "timePlayed",
  "points",
  "fieldGoalsMade2",
  "fieldGoalsAttempted2",
  "fieldGoalsMade3",
  "fieldGoalsAttempted3",
  "freeThrowsMade",
  "freeThrowsAttempted",
  "offensiveRebounds",
  "defensiveRebounds",
  "totalRebounds",
  "assistances",
  "steals",
  "turnovers",
  "blocksFavour",
  "blocksAgainst",
  "foulsCommited",
  "foulsReceived",
  "plusMinus",
  "valuation",
].join(",");

const normalizeHeader = (field: string) =>
  field.trim().toLowerCase().replace(/[\s_.-]/g, "");

/**
 * Which phase a round belongs to, when the sheet does not say.
 *
 * E2025's layout, confirmed by request: regular season 1–38 (380 games, ten a
 * round), play-in 39–40, playoffs 41–45, Final Four 46–47. A season that
 * changes format makes this wrong, which is exactly why `phase` is an
 * overriding column rather than only a derivation.
 */
export function phaseForRound(round: number): Phase {
  if (round <= 38) return "RS";
  if (round <= 40) return "PI";
  if (round <= 45) return "PO";
  return "FF";
}

/** `1850`, `30:50` and `30` all mean the same half-hour. */
function readTimePlayed(raw: string): number | null {
  const text = raw.trim();
  if (!text) return 0;
  const clock = /^(\d+):([0-5]?\d)$/.exec(text);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0) return null;
  // A bare number under 60 is minutes; the feed itself sends seconds, and
  // nobody plays 45 seconds' worth of 2,700.
  return Math.round(value < 60 ? value * 60 : value);
}

export type ParsedStatCsv = {
  readonly rows: ParsedStatRow[];
  /** One sentence per refused line, naming the line number. */
  readonly problems: string[];
  /** Columns the header named that we do not know. Reported, not fatal. */
  readonly ignoredColumns: string[];
  /** How many rows carried a PIR we could check ourselves against. */
  readonly checkedAgainstPir: number;
};

export function parseStatCsv(text: string): ParsedStatCsv {
  const lines = text.split(/\r?\n/);
  const problems: string[] = [];
  const rows: ParsedStatRow[] = [];
  const ignoredColumns: string[] = [];
  let checkedAgainstPir = 0;

  const headerIndex = lines.findIndex((line) => line.trim());
  if (headerIndex === -1) {
    return {
      rows,
      problems: ["Nothing to import — the box is empty."],
      ignoredColumns,
      checkedAgainstPir,
    };
  }

  const columns = new Map<Field, number>();
  splitCsvLine(lines[headerIndex] ?? "").forEach((raw, index) => {
    if (!raw.trim()) return;
    const field = HEADERS[normalizeHeader(raw)];
    if (!field) {
      ignoredColumns.push(raw.trim());
      return;
    }
    // First occurrence wins, so a sheet with both `reb` and `totalRebounds`
    // does not depend on column order.
    if (!columns.has(field)) columns.set(field, index);
  });

  const missing = REQUIRED.filter((field) => !columns.has(field));
  if (missing.length > 0) {
    return {
      rows,
      problems: [
        `The header row is missing ${missing.length} required column${
          missing.length === 1 ? "" : "s"
        }: ${missing.join(", ")}.`,
        `Expected header: ${CSV_TEMPLATE_HEADER}`,
      ],
      ignoredColumns,
      checkedAgainstPir,
    };
  }
  if (!columns.has("totalRebounds") && !columns.has("offensiveRebounds")) {
    return {
      rows,
      problems: [
        "The header row names no rebounds. Give either totalRebounds, or offensiveRebounds and defensiveRebounds.",
      ],
      ignoredColumns,
      checkedAgainstPir,
    };
  }

  for (const [index, raw] of lines.entries()) {
    if (index <= headerIndex || !raw.trim()) continue;
    const lineNo = index + 1;
    const fields = splitCsvLine(raw);
    const at = (field: Field): string => {
      const column = columns.get(field);
      return column === undefined ? "" : (fields[column] ?? "").trim();
    };

    const refuse = (why: string) => problems.push(`Line ${lineNo}: ${why}`);

    const personCode = at("personCode");
    if (!personCode) {
      refuse("no person code, so there is no player to attach this to.");
      continue;
    }

    const integers = new Map<Field, number>();
    let broken = false;
    const numericFields: Field[] = [
      "gameCode",
      "round",
      "teamScore",
      "opponentScore",
      "points",
      "fieldGoalsMade2",
      "fieldGoalsAttempted2",
      "fieldGoalsMade3",
      "fieldGoalsAttempted3",
      "freeThrowsMade",
      "freeThrowsAttempted",
      "offensiveRebounds",
      "defensiveRebounds",
      "totalRebounds",
      "assistances",
      "steals",
      "turnovers",
      "blocksFavour",
      "blocksAgainst",
      "foulsCommited",
      "foulsReceived",
      "plusMinus",
      "valuation",
    ];
    for (const field of numericFields) {
      if (!columns.has(field)) continue;
      const text = at(field);
      if (!text) {
        // An empty optional cell is a zero; an empty required one is not.
        if (REQUIRED.includes(field)) {
          refuse(`${field} is empty, and it is required.`);
          broken = true;
          break;
        }
        integers.set(field, 0);
        continue;
      }
      const value = Number(text);
      if (!Number.isInteger(value)) {
        refuse(`${field} is "${text}", which is not a whole number.`);
        broken = true;
        break;
      }
      integers.set(field, value);
    }
    if (broken) continue;

    const number = (field: Field) => integers.get(field) ?? 0;

    const timePlayed = readTimePlayed(at("timePlayed"));
    if (timePlayed === null) {
      refuse(
        `timePlayed is "${at("timePlayed")}" — give seconds (1850), minutes (30) or a clock (30:50).`,
      );
      continue;
    }

    const gameCode = number("gameCode");
    const round = number("round");
    if (gameCode <= 0) {
      refuse(`gameCode is ${gameCode}, and a game code counts from 1.`);
      continue;
    }
    if (round <= 0) {
      refuse(`round is ${round}, and a round counts from 1.`);
      continue;
    }

    const phaseText = at("phase").toUpperCase();
    if (phaseText && !PHASES.includes(phaseText as Phase)) {
      refuse(`"${phaseText}" is not a phase. Use ${PHASES.join(", ")}.`);
      continue;
    }
    const phase = (phaseText as Phase) || phaseForRound(round);

    const clubCode = at("clubCode").toUpperCase();
    if (!clubCode) {
      refuse("no club code, so there is no way to tell which side this is.");
      continue;
    }

    const teamScore = number("teamScore");
    const opponentScore = number("opponentScore");
    if (teamScore === opponentScore) {
      // Not pedantry: a level score is how an *unplayed* game arrives, since
      // the feed answers 200 with 0–0 and empty box scores rather than 404ing.
      // Importing it would score a game nobody has played.
      refuse(
        `${teamScore}–${opponentScore} is level. No Euroleague game ends level, so this is either a typo or a game that has not been played.`,
      );
      continue;
    }

    const box: BoxScore = {
      timePlayed,
      points: number("points"),
      fieldGoalsMade2: number("fieldGoalsMade2"),
      fieldGoalsAttempted2: number("fieldGoalsAttempted2"),
      fieldGoalsMade3: number("fieldGoalsMade3"),
      fieldGoalsAttempted3: number("fieldGoalsAttempted3"),
      freeThrowsMade: number("freeThrowsMade"),
      freeThrowsAttempted: number("freeThrowsAttempted"),
      offensiveRebounds: number("offensiveRebounds"),
      defensiveRebounds: number("defensiveRebounds"),
      totalRebounds: columns.has("totalRebounds")
        ? number("totalRebounds")
        : number("offensiveRebounds") + number("defensiveRebounds"),
      assistances: number("assistances"),
      steals: number("steals"),
      turnovers: number("turnovers"),
      blocksFavour: number("blocksFavour"),
      blocksAgainst: number("blocksAgainst"),
      foulsCommited: number("foulsCommited"),
      foulsReceived: number("foulsReceived"),
      plusMinus: number("plusMinus"),
    };

    const madeOver =
      box.fieldGoalsMade2 > box.fieldGoalsAttempted2
        ? "two-pointers"
        : box.fieldGoalsMade3 > box.fieldGoalsAttempted3
          ? "three-pointers"
          : box.freeThrowsMade > box.freeThrowsAttempted
            ? "free throws"
            : null;
    if (madeOver) {
      refuse(`more ${madeOver} made than attempted.`);
      continue;
    }

    if (
      columns.has("offensiveRebounds") &&
      columns.has("defensiveRebounds") &&
      columns.has("totalRebounds") &&
      box.offensiveRebounds + box.defensiveRebounds !== box.totalRebounds
    ) {
      refuse(
        `${box.offensiveRebounds} offensive + ${box.defensiveRebounds} defensive is not ${box.totalRebounds} total.`,
      );
      continue;
    }

    if (columns.has("valuation") && at("valuation")) {
      const stated = number("valuation");
      const { base } = scoreGame(box, teamScore > opponentScore);
      if (base !== stated) {
        // The sheet brought the Euroleague's own PIR and it disagrees with the
        // components beside it. One of the two is wrong and we cannot tell
        // which, so this row does not get imported and pretend otherwise.
        refuse(
          `PIR ${stated} does not match the ${base} its own numbers add up to. One of them is wrong; fix the line rather than dropping the PIR column.`,
        );
        continue;
      }
      checkedAgainstPir += 1;
    }

    rows.push({
      personCode,
      gameCode,
      round,
      phase,
      clubCode,
      teamScore,
      opponentScore,
      won: teamScore > opponentScore,
      box,
      line: lineNo,
    });
  }

  // A game code that appears twice for one player is a sheet that disagrees
  // with itself, and the unique index would refuse the second write anyway.
  // Saying so here names the line; the index only names a constraint.
  const seen = new Map<string, number>();
  const deduped: ParsedStatRow[] = [];
  for (const row of rows) {
    const key = `${row.personCode}:${row.gameCode}`;
    const first = seen.get(key);
    if (first !== undefined) {
      problems.push(
        `Line ${row.line}: ${row.personCode} already has game ${row.gameCode} on line ${first}.`,
      );
      continue;
    }
    seen.set(key, row.line);
    deduped.push(row);
  }

  return {
    rows: deduped,
    problems,
    ignoredColumns,
    checkedAgainstPir,
  };
}
