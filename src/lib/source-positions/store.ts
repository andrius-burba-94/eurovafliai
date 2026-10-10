import type PocketBase from "pocketbase";

import { isUniqueViolation } from "@/lib/drafts/unique";
import type { Position, RosterTemplate } from "@/lib/engine";
import type { FantasyPlayer } from "@/lib/fantasy/parse";
import { parseLeagueSettings } from "@/lib/leagues/settings";
import { asPbDate, listActiveMemberships } from "@/lib/memberships/store";

import { countsTemplate, planPositionRead, type PositionSource, type StoredPlayer } from "./plan";

/**
 * Each linked league's game, read for its whole pool (7.2 D). Framework-free:
 * the worker runs it.
 *
 * A league is read on the first pass after it is created or linked, then once
 * a day. The plan's writes land one player at a time and the league's
 * `positions_read_at` is stamped last, so a read that dies halfway leaves the
 * league due: the next pass re-plans from what is stored and writes only what
 * is still missing. Questions are created under a unique open key, so a re-run
 * or a racing pass cannot ask twice.
 */

export const POSITIONS_READ_EVERY_MS = 24 * 60 * 60_000;

export type PoolReaders = {
  /** Null without a token: the Fantasy Challenge's pool is not public. */
  readonly fantasy: (() => Promise<readonly FantasyPlayer[]>) | null;
  /** The pool of the BasketNews game the league's team plays in. */
  readonly basketnews: (teamId: string) => Promise<readonly FantasyPlayer[]>;
};

export type PositionsReport = {
  readonly leagueId: string;
  readonly source: PositionSource;
  readonly links: number;
  readonly additions: number;
  /** Player questions opened by this read. */
  readonly questions: number;
  readonly unlisted: number;
  readonly unmatched: number;
  /** Open roster questions after the check. */
  readonly rosterQuestions: number;
  readonly error?: string;
};

type LeagueRow = {
  id: string;
  settings?: unknown;
  positions_read_at?: string;
  fantasy_league_id?: string;
  basketnews_team_id?: string;
};

type QuestionRow = { id: string; kind: string; player?: string; member?: string; roster?: unknown; status: string };

/** Each game's fields on `players`. */
export const SOURCE_FIELDS = {
  fantasy: { id: "fantasy_id", position: "fantasy_position", confirmed: "fantasy_position_confirmed", listed: "fantasy_listed" },
  basketnews: { id: "basketnews_id", position: "basketnews_position", confirmed: "basketnews_position_confirmed", listed: "basketnews_listed" },
} as const satisfies Record<PositionSource, Record<string, string>>;

export function linkedSource(league: { fantasy_league_id?: string; basketnews_team_id?: string }): PositionSource | null {
  if (league.basketnews_team_id) return "basketnews";
  if (league.fantasy_league_id) return "fantasy";
  return null;
}

function instant(value: string | undefined): number {
  return value ? new Date(value.replace(" ", "T")).getTime() || 0 : 0;
}

export async function readDuePositions(deps: {
  readonly pb: PocketBase;
  readonly now: Date;
  readonly readers: PoolReaders;
}): Promise<PositionsReport[]> {
  const { pb, now, readers } = deps;
  const leagues = await pb.collection("leagues").getFullList<LeagueRow>({
    filter: "basketnews_team_id != '' || fantasy_league_id != ''",
    fields: "id,settings,positions_read_at,fantasy_league_id,basketnews_team_id",
    requestKey: null,
  });

  const reports: PositionsReport[] = [];
  for (const league of leagues) {
    const source = linkedSource(league);
    if (!source || now.getTime() - instant(league.positions_read_at) < POSITIONS_READ_EVERY_MS) continue;
    if (source === "fantasy" && !readers.fantasy) continue;
    let read: readonly FantasyPlayer[];
    try {
      read = source === "fantasy" ? await readers.fantasy!() : await readers.basketnews(league.basketnews_team_id!);
    } catch (error) {
      reports.push({ ...emptyReport(league.id, source), error: (error as Error).message });
      continue;
    }
    reports.push(await applyRead(pb, league, source, read, now));
  }
  return reports;
}

function emptyReport(leagueId: string, source: PositionSource): PositionsReport {
  return { leagueId, source, links: 0, additions: 0, questions: 0, unlisted: 0, unmatched: 0, rosterQuestions: 0 };
}

async function applyRead(
  pb: PocketBase,
  league: LeagueRow,
  source: PositionSource,
  read: readonly FantasyPlayer[],
  now: Date,
): Promise<PositionsReport> {
  const fields = SOURCE_FIELDS[source];
  const plan = planPositionRead(read, await readStoredPlayers(pb, source));

  const patches = new Map<string, Record<string, unknown>>();
  const patch = (playerId: string, values: Record<string, unknown>) =>
    patches.set(playerId, { ...(patches.get(playerId) ?? {}), ...values });
  for (const link of plan.links) patch(link.playerId, { [fields.id]: link.sourceId });
  for (const addition of plan.additions) patch(addition.playerId, { [fields.position]: addition.position });
  for (const change of plan.listed) patch(change.playerId, { [fields.listed]: change.listed });
  for (const [playerId, values] of patches) {
    try {
      await pb.collection("players").update(playerId, values, { requestKey: null });
    } catch (error) {
      // Another row already holds this game's id: the link waits for a person.
      if (!isUniqueViolation(error)) throw error;
    }
  }

  const open = await readOpenQuestions(pb, league.id);
  const asked = new Set(plan.questions.map((question) => question.playerId));
  let opened = 0;
  for (const question of plan.questions) {
    const created = await createQuestion(pb, {
      league: league.id,
      source,
      kind: "player",
      player: question.playerId,
      stored_position: question.stored,
      read_position: question.read,
      open_key: `player:${league.id}:${question.playerId}`,
    });
    if (created) opened += 1;
  }
  for (const question of open) {
    if (question.kind === "player" && question.player && !asked.has(question.player)) await resolve(pb, question.id);
  }

  const rosterQuestions = await checkRosters(pb, league, source);
  await pb.collection("leagues").update(league.id, { positions_read_at: asPbDate(now) }, { requestKey: null });

  return {
    leagueId: league.id,
    source,
    links: plan.links.length,
    additions: plan.additions.length,
    questions: opened,
    unlisted: plan.listed.filter((change) => !change.listed).length,
    unmatched: plan.unmatched.length,
    rosterQuestions,
  };
}

async function readStoredPlayers(pb: PocketBase, source: PositionSource): Promise<StoredPlayer[]> {
  const fields = SOURCE_FIELDS[source];
  const rows = await pb.collection("players").getFullList<Record<string, unknown>>({
    fields: ["id", "name", "name_normalized", "club_code", "club_name", "dorsal", "status", ...Object.values(fields)].join(","),
    requestKey: null,
  });
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name ?? ""),
    nameNormalized: String(row.name_normalized ?? ""),
    clubCode: String(row.club_code ?? ""),
    clubName: String(row.club_name ?? ""),
    dorsal: String(row.dorsal ?? ""),
    fantasyId: "",
    status: String(row.status ?? ""),
    sourceId: String(row[fields.id] ?? ""),
    position: (row[fields.position] as Position | "" | undefined) || null,
    confirmed: row[fields.confirmed] === true,
    listed: row[fields.listed] === true,
  }));
}

async function readOpenQuestions(pb: PocketBase, leagueId: string): Promise<QuestionRow[]> {
  return pb.collection("position_questions").getFullList<QuestionRow>({
    filter: `league = '${leagueId}' && status = 'open'`,
    fields: "id,kind,player,member,roster,status",
    requestKey: null,
  });
}

/** False when the same question is already open: its key is taken. */
async function createQuestion(pb: PocketBase, values: Record<string, unknown>): Promise<boolean> {
  try {
    await pb.collection("position_questions").create({ ...values, status: "open" }, { requestKey: null });
    return true;
  } catch (error) {
    if (isUniqueViolation(error)) return false;
    throw error;
  }
}

async function resolve(pb: PocketBase, questionId: string): Promise<void> {
  await pb.collection("position_questions").update(questionId, { status: "resolved", open_key: "" }, { requestKey: null });
}

type Membership = {
  member: string;
  player: string;
  to_date?: string | null;
  expand?: { player?: { position: Position; fantasy_position?: Position | ""; basketnews_position?: Position | "" } };
};

/**
 * Every member's roster counted in the league's game's positions. A roster that
 * does not count the template is a question listing it; one that counts again
 * closes its question. Returns how many roster questions are open afterwards.
 */
export async function checkRosters(pb: PocketBase, league: LeagueRow, source: PositionSource): Promise<number> {
  const template: RosterTemplate = parseLeagueSettings(league.settings).roster_template;
  const memberships = await listActiveMemberships<Membership>(pb, league.id, { expand: "player" });
  const rosters = new Map<string, { player: string; position: Position }[]>();
  for (const row of memberships) {
    const player = row.expand?.player;
    if (!player) continue;
    const position = player[SOURCE_FIELDS[source].position] || player.position;
    rosters.set(row.member, [...(rosters.get(row.member) ?? []), { player: row.player, position }]);
  }

  const open = (await readOpenQuestions(pb, league.id)).filter((question) => question.kind === "roster");
  let standing = 0;
  for (const [member, roster] of rosters) {
    const question = open.find((row) => row.member === member);
    if (countsTemplate(roster.map((seat) => seat.position), template)) {
      if (question) await resolve(pb, question.id);
      continue;
    }
    standing += 1;
    if (!question) {
      await createQuestion(pb, { league: league.id, source, kind: "roster", member, roster, open_key: `roster:${league.id}:${member}` });
    } else if (JSON.stringify(question.roster) !== JSON.stringify(roster)) {
      await pb.collection("position_questions").update(question.id, { roster }, { requestKey: null });
    }
  }
  return standing;
}
