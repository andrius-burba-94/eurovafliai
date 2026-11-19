import type { LivePlayer } from "./boxscore";
import { secondsOf } from "./boxscore";

/**
 * One game's box score as the game page draws it, from either source: the
 * live snapshot while the game is on, the recorded box score once it is
 * final. Pure, so the page, its client table and the tests share one reading.
 */
export type BoxRow = {
  readonly personCode: string;
  /** Stored "Surname, First" when the player is known; the feed's otherwise. */
  readonly name: string;
  readonly dorsal: string;
  readonly clubCode: string;
  /** Null when the source did not say. */
  readonly starter: boolean | null;
  readonly onCourt: boolean;
  readonly dnp: boolean;
  readonly seconds: number;
  readonly pts: number;
  readonly fgm2: number;
  readonly fga2: number;
  readonly fgm3: number;
  readonly fga3: number;
  readonly ftm: number;
  readonly fta: number;
  readonly oreb: number;
  readonly dreb: number;
  readonly reb: number;
  readonly ast: number;
  readonly stl: number;
  readonly tov: number;
  readonly blk: number;
  readonly blka: number;
  readonly pf: number;
  readonly fd: number;
  readonly pm: number;
  readonly pir: number;
  /** Fantasy points in tenths, under the league's own scoring. */
  readonly fantasyTenths: number;
};

/** The recorded box score's row, as `player_game_stats` stores it. */
export type StoredBoxRow = {
  readonly player: string;
  readonly club_code: string;
  readonly time_played?: number;
  readonly points?: number;
  readonly fgm2?: number;
  readonly fga2?: number;
  readonly fgm3?: number;
  readonly fga3?: number;
  readonly ftm?: number;
  readonly fta?: number;
  readonly reb_off?: number;
  readonly reb_def?: number;
  readonly reb_total?: number;
  readonly assists?: number;
  readonly steals?: number;
  readonly turnovers?: number;
  readonly blocks_for?: number;
  readonly blocks_against?: number;
  readonly fouls_committed?: number;
  readonly fouls_drawn?: number;
  readonly plus_minus?: number;
  readonly pir?: number;
  readonly fantasy_pts?: number;
  readonly basketnews_raw_pts?: number;
  readonly started?: string;
};

/** The feed's uppercase "HOARD, JAYLEN" or "DUBAI BASKETBALL" as a person writes it. */
export function feedName(name: string): string {
  return name.toLowerCase().replace(/(^|[\s,'-])(\p{L})/gu, (_, gap: string, letter: string) => gap + letter.toUpperCase());
}

export function rowsFromLive(
  players: readonly LivePlayer[],
  options: { readonly basketNews?: boolean; readonly names?: ReadonlyMap<string, string> } = {},
): BoxRow[] {
  return players.map((player) => {
    const box = player.box;
    const minutes = player.minutes.trim();
    return {
      personCode: player.personCode,
      name: options.names?.get(player.personCode) ?? feedName(player.name ?? player.personCode),
      dorsal: player.dorsal ?? "",
      clubCode: player.clubCode,
      starter: player.starter ?? null,
      onCourt: player.playing,
      dnp: minutes === "DNP" || (secondsOf(minutes) === 0 && !player.playing),
      seconds: secondsOf(minutes),
      pts: player.points,
      fgm2: box?.fgm2 ?? 0,
      fga2: box?.fga2 ?? 0,
      fgm3: box?.fgm3 ?? 0,
      fga3: box?.fga3 ?? 0,
      ftm: box?.ftm ?? 0,
      fta: box?.fta ?? 0,
      oreb: box?.oreb ?? 0,
      dreb: box?.dreb ?? 0,
      reb: player.rebounds,
      ast: player.assists,
      stl: box?.stl ?? 0,
      tov: box?.tov ?? 0,
      blk: box?.blk ?? 0,
      blka: box?.blka ?? 0,
      pf: box?.pf ?? 0,
      fd: box?.fd ?? 0,
      pm: box?.pm ?? 0,
      pir: player.pir,
      fantasyTenths: options.basketNews ? player.basketNewsTenths ?? 0 : player.fantasyTenths,
    };
  });
}

export function rowsFromStored(
  rows: readonly StoredBoxRow[],
  players: ReadonlyMap<string, { readonly name: string; readonly personCode: string; readonly dorsal?: string }>,
  options: { readonly basketNews?: boolean } = {},
): BoxRow[] {
  return rows.map((row) => {
    const who = players.get(row.player);
    const seconds = row.time_played ?? 0;
    return {
      personCode: who?.personCode ?? row.player,
      name: who?.name ?? "",
      dorsal: who?.dorsal ?? "",
      clubCode: row.club_code,
      starter: row.started === "yes" ? true : row.started === "no" ? false : null,
      onCourt: false,
      dnp: seconds === 0,
      seconds,
      pts: row.points ?? 0,
      fgm2: row.fgm2 ?? 0,
      fga2: row.fga2 ?? 0,
      fgm3: row.fgm3 ?? 0,
      fga3: row.fga3 ?? 0,
      ftm: row.ftm ?? 0,
      fta: row.fta ?? 0,
      oreb: row.reb_off ?? 0,
      dreb: row.reb_def ?? 0,
      reb: row.reb_total ?? 0,
      ast: row.assists ?? 0,
      stl: row.steals ?? 0,
      tov: row.turnovers ?? 0,
      blk: row.blocks_for ?? 0,
      blka: row.blocks_against ?? 0,
      pf: row.fouls_committed ?? 0,
      fd: row.fouls_drawn ?? 0,
      pm: row.plus_minus ?? 0,
      pir: row.pir ?? 0,
      // BasketNews raw points are stored in hundredths; every other line is tenths.
      fantasyTenths: options.basketNews ? Math.round((row.basketnews_raw_pts ?? 0) / 10) : row.fantasy_pts ?? 0,
    };
  });
}

export type BoxColumn = {
  readonly key: SortKey;
  /** The head's abbreviation. */
  readonly label: string;
  /** What the abbreviation stands for, for a tip and for assistive tech. */
  readonly title: string;
  /** The figure a sort compares. */
  readonly value: (row: BoxRow) => number;
  /** The figure as printed. */
  readonly text: (row: BoxRow) => string;
  /** A turnover or a foul is not a leader's figure. */
  readonly worse?: boolean;
};

export type SortKey =
  | "min" | "pts" | "fg" | "fg2" | "fg3" | "ft" | "reb" | "oreb" | "dreb" | "ast"
  | "stl" | "tov" | "blk" | "blka" | "pf" | "fd" | "pm" | "pir" | "fp";

const made = (makes: number, attempts: number) => `${makes}/${attempts}`;
/** Makes first, then the better rate, so 3/3 sorts above 3/9. */
const shooting = (makes: number, attempts: number) => makes + (attempts > 0 ? makes / attempts / 100 : 0);

/** `"24:10"`, as a broadcast prints minutes played. */
export function minutesText(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

export const BOX_COLUMNS: readonly BoxColumn[] = [
  { key: "min", label: "MIN", title: "Minutes played", value: (row) => row.seconds, text: (row) => minutesText(row.seconds) },
  { key: "pts", label: "PTS", title: "Points", value: (row) => row.pts, text: (row) => String(row.pts) },
  { key: "reb", label: "REB", title: "Rebounds", value: (row) => row.reb, text: (row) => String(row.reb) },
  { key: "ast", label: "AST", title: "Assists", value: (row) => row.ast, text: (row) => String(row.ast) },
  { key: "pir", label: "PIR", title: "Performance index rating", value: (row) => row.pir, text: (row) => String(row.pir) },
  { key: "fp", label: "FP", title: "Fantasy points, provisional until the game is final", value: (row) => row.fantasyTenths, text: (row) => (row.fantasyTenths / 10).toFixed(1) },
  { key: "fg", label: "FG", title: "Field goals made / attempted", value: (row) => shooting(row.fgm2 + row.fgm3, row.fga2 + row.fga3), text: (row) => made(row.fgm2 + row.fgm3, row.fga2 + row.fga3) },
  { key: "fg2", label: "2P", title: "Two-pointers made / attempted", value: (row) => shooting(row.fgm2, row.fga2), text: (row) => made(row.fgm2, row.fga2) },
  { key: "fg3", label: "3P", title: "Three-pointers made / attempted", value: (row) => shooting(row.fgm3, row.fga3), text: (row) => made(row.fgm3, row.fga3) },
  { key: "ft", label: "FT", title: "Free throws made / attempted", value: (row) => shooting(row.ftm, row.fta), text: (row) => made(row.ftm, row.fta) },
  { key: "oreb", label: "OR", title: "Offensive rebounds", value: (row) => row.oreb, text: (row) => String(row.oreb) },
  { key: "dreb", label: "DR", title: "Defensive rebounds", value: (row) => row.dreb, text: (row) => String(row.dreb) },
  { key: "stl", label: "STL", title: "Steals", value: (row) => row.stl, text: (row) => String(row.stl) },
  { key: "tov", label: "TO", title: "Turnovers", value: (row) => row.tov, text: (row) => String(row.tov), worse: true },
  { key: "blk", label: "BLK", title: "Blocks", value: (row) => row.blk, text: (row) => String(row.blk) },
  { key: "blka", label: "BA", title: "Shots blocked by an opponent", value: (row) => row.blka, text: (row) => String(row.blka), worse: true },
  { key: "pf", label: "PF", title: "Fouls committed", value: (row) => row.pf, text: (row) => String(row.pf), worse: true },
  { key: "fd", label: "FD", title: "Fouls drawn", value: (row) => row.fd, text: (row) => String(row.fd) },
  { key: "pm", label: "+/−", title: "Plus-minus while on court", value: (row) => row.pm, text: (row) => signed(row.pm) },
];

export function isSortKey(value: string | null | undefined): value is SortKey {
  return BOX_COLUMNS.some((column) => column.key === value);
}

export type Sort = { readonly key: SortKey; readonly direction: "desc" | "asc" } | null;

/** The box score's own order: starters, then minutes played, then the sheet. */
function officialOrder(a: BoxRow, b: BoxRow): number {
  const starter = (row: BoxRow) => (row.starter ? 0 : 1);
  return starter(a) - starter(b) || b.seconds - a.seconds || a.name.localeCompare(b.name);
}

/**
 * Rows in the order asked for. A player who did not play stays at the foot
 * whatever the sort: "0 turnovers" from the bench is not a leader's line.
 */
export function sortRows(rows: readonly BoxRow[], sort: Sort): BoxRow[] {
  const column = sort ? BOX_COLUMNS.find((candidate) => candidate.key === sort.key) : undefined;
  return [...rows].sort((a, b) => {
    if (a.dnp !== b.dnp) return a.dnp ? 1 : -1;
    if (!column || !sort) return officialOrder(a, b);
    const difference = column.value(a) - column.value(b);
    return (sort.direction === "asc" ? difference : -difference) || officialOrder(a, b);
  });
}

/** A head's next state: high to low, then low to high, then back to the box score's order. */
export function nextSort(current: Sort, key: SortKey): Sort {
  if (!current || current.key !== key) return { key, direction: "desc" };
  return current.direction === "desc" ? { key, direction: "asc" } : null;
}

/** The side's sums, drawn as the table's last row. */
export function teamTotals(rows: readonly BoxRow[]): BoxRow {
  const sum = (pick: (row: BoxRow) => number) => rows.reduce((total, row) => total + pick(row), 0);
  return {
    personCode: "",
    name: "Totals",
    dorsal: "",
    clubCode: rows[0]?.clubCode ?? "",
    starter: null,
    onCourt: false,
    dnp: false,
    seconds: sum((row) => row.seconds),
    pts: sum((row) => row.pts),
    fgm2: sum((row) => row.fgm2),
    fga2: sum((row) => row.fga2),
    fgm3: sum((row) => row.fgm3),
    fga3: sum((row) => row.fga3),
    ftm: sum((row) => row.ftm),
    fta: sum((row) => row.fta),
    oreb: sum((row) => row.oreb),
    dreb: sum((row) => row.dreb),
    reb: sum((row) => row.reb),
    ast: sum((row) => row.ast),
    stl: sum((row) => row.stl),
    tov: sum((row) => row.tov),
    blk: sum((row) => row.blk),
    blka: sum((row) => row.blka),
    pf: sum((row) => row.pf),
    fd: sum((row) => row.fd),
    // A side's plus-minus is its margin; the players' sum is five times it.
    pm: 0,
    pir: sum((row) => row.pir),
    fantasyTenths: sum((row) => row.fantasyTenths),
  };
}

/**
 * The best figure in each column among those who played, for the gold mark.
 * A column where nobody has done anything yet has no leader.
 */
export function columnLeaders(rows: readonly BoxRow[]): Partial<Record<SortKey, number>> {
  const played = rows.filter((row) => !row.dnp);
  const leaders: Partial<Record<SortKey, number>> = {};
  for (const column of BOX_COLUMNS) {
    if (column.worse || column.key === "min" || column.key === "pm") continue;
    const best = Math.max(...played.map(column.value));
    if (Number.isFinite(best) && best > 0) leaders[column.key] = best;
  }
  return leaders;
}

/**
 * Where the game clock stands, as the scoreboard bug prints it: `Q3 · 4:12`,
 * `OT1 · 2:05`, `Half time`, `End of Q1`. Null without a period.
 */
export function clockLabel(period: number | null | undefined, clock: string | null | undefined): string | null {
  if (!period || period < 1) return null;
  const name = period <= 4 ? `Q${period}` : `OT${period - 4}`;
  const match = /^(\d{1,2}):(\d{2})$/.exec(clock?.trim() ?? "");
  if (!match) return name;
  const minutes = Number(match[1]);
  const seconds = match[2]!;
  if (minutes === 0 && seconds === "00") return period === 2 ? "Half time" : `End of ${name}`;
  return `${name} · ${minutes}:${seconds}`;
}

/** The periods a line score shows: four quarters, plus each overtime that was played. */
export function periodHeads(local: readonly number[], road: readonly number[], period: number | null | undefined): string[] {
  const played = Math.max(4, period ?? 0, ...[local, road].map((side) => {
    const last = side.findLastIndex((points, index) => index >= 4 && points > 0);
    return last + 1;
  }));
  return Array.from({ length: played }, (_, index) => (index < 4 ? `Q${index + 1}` : `OT${index - 3}`));
}
