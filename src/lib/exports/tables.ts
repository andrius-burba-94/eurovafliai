/**
 * Shaping a draft into tables somebody can open in a spreadsheet.
 *
 * Pure: no PocketBase, no session, no clock beyond the `now` a caller passes
 * in. `queries.ts` next door does the reading and `route.ts` does the
 * responding, so everything about *what an export contains* is testable
 * without a server — which is the same split the pick pipeline uses.
 *
 * Four kinds, because a draft is four different questions and a league will
 * want them separately: the picks in order, the squads they produced, who
 * picked where, and the pool they picked from.
 */
import type { BoardPick } from "@/lib/drafts/types";
import type { Position } from "@/lib/engine";

import type { CsvValue } from "@/lib/csv/write";

export type ExportKind = "results" | "rosters" | "order" | "pool";

/**
 * The order the kinds are offered in, and the order a multi-kind export writes
 * them. Results first because it is the draft itself; pool last because it is
 * the largest and the least about *this* league.
 */
export const EXPORT_KINDS: readonly ExportKind[] = [
  "results",
  "rosters",
  "order",
  "pool",
];

export const EXPORT_LABEL: Record<ExportKind, string> = {
  results: "Draft results",
  rosters: "Rosters as drafted",
  order: "Draft order",
  pool: "Player pool",
};

export const EXPORT_DESCRIPTION: Record<ExportKind, string> = {
  results: "Every pick in order — round, team, player, and whether autodraft took it.",
  rosters: "One row per player, grouped by team and then by G/F/C.",
  order: "The rolled order: which slot each team picks from.",
  pool: "Every draftable player with club, position, average and who took them.",
};

export type ExportFormat = "csv" | "json";

export type ExportTable = {
  kind: ExportKind;
  label: string;
  columns: readonly string[];
  rows: readonly (readonly CsvValue[])[];
};

/** G, F, C — a roster is read in that order. Same local constant as `radar.ts`. */
const POSITION_ORDER: readonly Position[] = ["G", "F", "C"];

/**
 * Which kinds a request asked for.
 *
 * Returns them in `EXPORT_KINDS` order rather than the order they were typed,
 * so two links that name the same kinds produce byte-identical files. Unknown
 * values are dropped rather than rejected: a hand-edited URL should not be an
 * error page, and an empty result is a case the caller has to answer anyway.
 *
 * Accepts both `?include=a&include=b` and `?include=a,b`, because the form
 * produces the first and a human sharing a link writes the second.
 */
export function parseKinds(raw: readonly string[]): ExportKind[] {
  const asked = new Set(
    raw.flatMap((value) => value.split(",")).map((value) => value.trim()),
  );
  return EXPORT_KINDS.filter((kind) => asked.has(kind));
}

/** CSV unless JSON was asked for by name. */
export function parseFormat(raw: string | null | undefined): ExportFormat {
  return raw === "json" ? "json" : "csv";
}

/** Every pick, in the order they were made. */
export function resultsTable(picks: readonly BoardPick[]): ExportTable {
  const ordered = [...picks].sort((a, b) => a.overallNo - b.overallNo);
  return {
    kind: "results",
    label: EXPORT_LABEL.results,
    columns: ["Overall", "Round", "Slot", "Team", "Player", "Club", "Position", "Autodraft"],
    rows: ordered.map((pick) => [
      pick.overallNo,
      pick.round,
      pick.slot,
      pick.memberName,
      pick.playerName,
      pick.playerClub,
      pick.position,
      pick.isAuto ? "yes" : "no",
    ]),
  };
}

/**
 * The squads the draft produced, team by team.
 *
 * **As drafted**, which is not the same thing as a team's roster today — a
 * trade moves a player without moving the pick that took them. Naming the kind
 * "Rosters as drafted" is the whole guard against reading this as the current
 * squad, so the label and this note travel together.
 *
 * Teams come in draft order and their players in G/F/C order, because that is
 * how the roster template is written and how the radar already reads.
 */
export function rostersTable(
  picks: readonly BoardPick[],
  order: readonly { memberId: string; memberName: string }[],
): ExportTable {
  const rows: CsvValue[][] = [];
  for (const seat of order) {
    const theirs = picks
      .filter((pick) => pick.memberId === seat.memberId)
      .sort(
        (a, b) =>
          POSITION_ORDER.indexOf(a.position) -
            POSITION_ORDER.indexOf(b.position) || a.overallNo - b.overallNo,
      );
    for (const pick of theirs) {
      rows.push([
        seat.memberName,
        pick.position,
        pick.playerName,
        pick.playerClub,
        pick.round,
        pick.overallNo,
      ]);
    }
  }
  return {
    kind: "rosters",
    label: EXPORT_LABEL.rosters,
    columns: ["Team", "Position", "Player", "Club", "Round", "Overall"],
    rows,
  };
}

/** The rolled order — one row per slot, whether or not a pick was made. */
export function orderTable(
  order: readonly { memberId: string; memberName: string }[],
): ExportTable {
  return {
    kind: "order",
    label: EXPORT_LABEL.order,
    columns: ["Slot", "Team"],
    rows: order.map((seat, index) => [index + 1, seat.memberName]),
  };
}

/** A pool row, in the few fields an export needs from the room's own type. */
export type ExportPoolPlayer = {
  readonly name: string;
  readonly club: string;
  readonly clubName?: string;
  readonly position: Position;
  readonly status: string;
  readonly takenBy: string | null;
  readonly takenAt: number | null;
  readonly averagePir: number | null;
  readonly averageGames: number;
  readonly averageSource: "last5" | "prev" | null;
  readonly averageFantasy: number | null;
};

/**
 * The pool, as a cheat sheet.
 *
 * `averagePir` and `averageFantasy` are stored in tenths and written here as
 * the decimal a reader expects. A null stays **empty rather than 0**: the
 * pool's own type is emphatic that "no data" and "averaged 0.0" are different
 * players, and a zero in a spreadsheet column is the one that gets sorted to
 * the bottom and drafted by accident.
 */
export function poolTable(
  players: readonly ExportPoolPlayer[],
  teamNames: Readonly<Record<string, string>>,
): ExportTable {
  const tenths = (value: number | null) =>
    value === null ? null : (value / 10).toFixed(1);
  return {
    kind: "pool",
    label: EXPORT_LABEL.pool,
    columns: [
      "Player",
      "Club",
      "Club name",
      "Position",
      "Status",
      "Avg PIR",
      "Avg fantasy",
      "Games",
      "Average from",
      "Taken by",
      "Taken at",
    ],
    rows: players.map((player) => [
      player.name,
      player.club,
      player.clubName ?? "",
      player.position,
      player.status,
      tenths(player.averagePir),
      tenths(player.averageFantasy),
      player.averageGames,
      player.averageSource === "last5"
        ? "this season, last 5"
        : player.averageSource === "prev"
          ? "last season"
          : "",
      player.takenBy ? (teamNames[player.takenBy] ?? player.takenBy) : "",
      player.takenAt ?? "",
    ]),
  };
}

/**
 * What the browser saves it as.
 *
 * The league's name is in it because a member will export two leagues one day
 * and `draft.csv` twice in a Downloads folder tells them nothing. The date is
 * plain ISO for sorting; a single-kind export names its kind, and a multi-kind
 * one says `draft` because it is the whole thing.
 */
export function exportFileName(
  leagueName: string,
  kinds: readonly ExportKind[],
  format: ExportFormat,
  now: Date,
): string {
  const slug =
    leagueName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "league";
  const what = kinds.length === 1 ? kinds[0] : "draft";
  const day = now.toISOString().slice(0, 10);
  return `${slug}-${what}-${day}.${format}`;
}
