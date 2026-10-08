import { displayName } from "@/lib/players/name";
import type PocketBase from "pocketbase";

import { readStoredFixtures } from "@/lib/fixtures/store";
import { parseLeagueSettings } from "@/lib/leagues/settings";
import { formationName, type LineupSlots, type LineupSquadPlayer } from "@/lib/lineups/lineup";
import { readSquadWithPositions, writeLineup } from "@/lib/lineups/store";
import { applyTransaction, asPbDate, listActiveMemberships } from "@/lib/memberships/store";
import { snapshotRowsFrom } from "@/lib/stats/standings";
import { recomputeStandings } from "@/lib/stats/standings-store";

import { FantasyTokenRefused, fetchCurrentMatchday, fetchLeagueMoves, fetchLeagueRosters, fetchRoundLineup } from "./client";
import { linkLineupPlayers, matchdayIdForRound, slotsFromOfficial, type OfficialLineup } from "./lineup";
import { resolveFantasy, type PoolPlayer, type SyncMember, type SyncQuestion } from "./match";
import { planFromLog, planSync, reconcileMoves, rostersAgree, type LoggedMove, type SyncPlan, type SyncPlanInput, type SyncSeat, type SyncStep } from "./plan";
import { lineupRoundsDue, roundWindows, syncDue, syncModeAt, type SyncDecision } from "./windows";

/**
 * Running a sync — the PocketBase half.
 *
 * Framework-free: the worker runs it on the freeze schedule and the "Sync now"
 * button runs it on demand, through the same function.
 *
 * ## Failure-recovery story
 *
 * 1. Links first. A team or player link found by the heuristics is written
 *    before anything else; each is a single idempotent field update, backed by
 *    the partial unique index on `players.fantasy_id`.
 * 2. Intent second. An apply stores its report with `status = applying` and
 *    every planned step before the first roster write.
 * 3. Steps in their planned order through `applyTransaction`, which finds its
 *    own `transactions` row on a replay and skips windows already closed or
 *    opened. The unique active `(league, player)` index is the backstop.
 * 4. Verify, then mark the report `applied`. If the league's rosters do not
 *    now equal the official ones, it is marked `failed` and says so.
 *
 * A run that dies anywhere in 3 leaves an `applying` report. Every run starts
 * by finishing those from their stored steps, so the next pass — at most an
 * hour later, or a tap on "Sync now" — completes the same plan rather than
 * planning a different one from a half-written state.
 */

export type SyncStatus = "preview" | "blocked" | "applying" | "applied" | "failed" | "queued" | "running";

/** What a run read: the rosters, or the round's lineups. */
export type SyncKind = "rosters" | "lineups" | "basketnews";

export type SyncRun = {
  readonly id: string;
  readonly kind: SyncKind;
  readonly mode: SyncDecision["mode"];
  readonly round: number;
  readonly status: SyncStatus;
  readonly message: string;
  readonly moves: readonly string[];
  readonly questions: readonly SyncQuestion[];
  readonly ran_at: string;
};

type SyncRecord = SyncRun & { readonly steps?: readonly SyncStep[] | null };

type LeagueRow = { id: string; status: string; fantasy_league_id?: string; settings?: unknown };

/** Roster runs written before `kind` existed have it empty. */
const ROSTER_RUNS = "kind != 'lineups'";

const MESSAGE_MAX = 500;

function clip(text: string): string {
  return text.length > MESSAGE_MAX ? `${text.slice(0, MESSAGE_MAX - 1)}…` : text;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export async function decideSync(pb: PocketBase, season: string, now: Date): Promise<SyncDecision> {
  const fixtures = await readStoredFixtures(pb, season);
  return syncModeAt(
    now.getTime(),
    roundWindows(fixtures.map((row) => ({ round: row.round, utcDate: row.utc_date || null }))),
  );
}

export async function readSyncRuns(pb: PocketBase, leagueId: string, limit: number): Promise<SyncRun[]> {
  const page = await pb.collection("fantasy_syncs").getList<SyncRun>(1, limit, {
    filter: `league = '${leagueId}'`,
    sort: "-ran_at",
    requestKey: null,
  });
  return page.items.map((row) => ({
    ...row,
    kind: row.kind === "lineups" ? "lineups" : row.kind === "basketnews" ? "basketnews" : "rosters",
    moves: Array.isArray(row.moves) ? row.moves : [],
    questions: Array.isArray(row.questions) ? row.questions : [],
  }));
}

async function lastRunAt(pb: PocketBase, filter: string): Promise<number | null> {
  const page = await pb.collection("fantasy_syncs").getList<{ ran_at: string }>(1, 1, {
    filter,
    sort: "-ran_at",
    requestKey: null,
  });
  const ranAt = page.items[0]?.ran_at;
  const at = ranAt ? Date.parse(ranAt.replace(" ", "T")) : Number.NaN;
  return Number.isFinite(at) ? at : null;
}

async function record(
  pb: PocketBase,
  leagueId: string,
  decision: SyncDecision,
  now: Date,
  fields: {
    kind?: SyncKind;
    status: SyncStatus;
    message: string;
    moves?: readonly string[];
    questions?: readonly SyncQuestion[];
    steps?: readonly SyncStep[];
  },
): Promise<SyncRecord> {
  return pb.collection("fantasy_syncs").create<SyncRecord>(
    {
      league: leagueId,
      kind: fields.kind ?? "rosters",
      mode: decision.mode,
      round: decision.round ?? 0,
      ran_at: now.toISOString().replace("T", " "),
      status: fields.status,
      message: clip(fields.message),
      moves: fields.moves ?? [],
      questions: fields.questions ?? [],
      steps: fields.steps ?? [],
    },
    { requestKey: null },
  );
}

async function applySteps(pb: PocketBase, leagueId: string, steps: readonly SyncStep[], now: Date): Promise<void> {
  for (const step of steps) {
    await applyTransaction(pb, leagueId, step.plan, now, step.announcement, step.note);
  }
}

async function finishInterrupted(pb: PocketBase, leagueId: string, now: Date): Promise<number> {
  const open = await pb.collection("fantasy_syncs").getFullList<SyncRecord>({
    filter: `league = '${leagueId}' && status = 'applying'`,
    requestKey: null,
  });
  for (const run of open) {
    await applySteps(pb, leagueId, Array.isArray(run.steps) ? run.steps : [], now);
    await pb.collection("fantasy_syncs").update(
      run.id,
      { status: "applied", message: clip(`${run.message} Finished after an interruption.`) },
      { requestKey: null },
    );
  }
  return open.length;
}

async function readSeats(pb: PocketBase, leagueId: string): Promise<SyncSeat[]> {
  const rows = await listActiveMemberships<{ id: string; member: string; player: string; to_date?: string }>(
    pb,
    leagueId,
    { fields: "id,member,player,to_date" },
  );
  return rows.map(({ id, member, player }) => ({ id, member, player }));
}

async function readMembers(pb: PocketBase, leagueId: string): Promise<SyncMember[]> {
  const rows = await pb.collection("league_members").getFullList<{ id: string; team_name: string; fantasy_team_id?: string }>({
    filter: `league = '${leagueId}'`,
    fields: "id,team_name,fantasy_team_id",
    requestKey: null,
  });
  return rows.map((row) => ({
    id: row.id,
    teamName: row.team_name.trim() || "Unnamed team",
    fantasyTeamId: row.fantasy_team_id ?? "",
  }));
}

async function readPool(pb: PocketBase): Promise<PoolPlayer[]> {
  const rows = await pb.collection("players").getFullList<{
    id: string;
    name: string;
    name_normalized: string;
    club_code: string;
    club_name: string;
    dorsal?: string;
    fantasy_id?: string;
    status?: string;
  }>({
    fields: "id,name,name_normalized,club_code,club_name,dorsal,fantasy_id,status",
    requestKey: null,
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    nameNormalized: row.name_normalized,
    clubCode: row.club_code,
    clubName: row.club_name,
    dorsal: row.dorsal ?? "",
    fantasyId: row.fantasy_id ?? "",
    status: row.status ?? "",
  }));
}

/**
 * The round's moves as the official log records them, or null when the log
 * cannot be read or does not explain the rosters. Never throws: the roster
 * difference is always there to fall back on.
 */
async function planFromOfficialLog(
  input: SyncPlanInput,
  source: {
    readonly token: string;
    readonly fantasyLeagueId: string;
    readonly round: number;
    /** Official team id → member. */
    readonly teams: ReadonlyMap<string, string>;
    /** Official player id → pool player, released players included. */
    readonly players: ReadonlyMap<string, string>;
    readonly doFetch?: typeof fetch;
  },
): Promise<SyncPlan | null> {
  try {
    const current = await fetchCurrentMatchday(source.token, source.fantasyLeagueId, source.doFetch);
    const moves = await fetchLeagueMoves(source.token, source.fantasyLeagueId, matchdayIdForRound(current, source.round), source.doFetch);
    const log: LoggedMove[] = [];
    for (const move of moves) {
      const member = source.teams.get(move.arrival.teamId);
      const departureTo = move.departure.teamId === null ? null : source.teams.get(move.departure.teamId);
      const arrival = source.players.get(move.arrival.playerId);
      const departure = source.players.get(move.departure.playerId);
      if (!member || departureTo === undefined || !arrival || !departure) return null;
      log.push({ order: move.id, member, arrival, departure, departureTo });
    }
    return planFromLog({ ...input, log });
  } catch {
    return null;
  }
}

export type SyncOptions = {
  readonly pb: PocketBase;
  readonly leagueId: string;
  readonly token: string;
  readonly season: string;
  readonly decision: SyncDecision;
  readonly now: Date;
  readonly doFetch?: typeof fetch;
};

export async function runFantasySync(options: SyncOptions): Promise<SyncRun> {
  const { pb, leagueId, token, season, decision, now, doFetch } = options;
  const league = await pb.collection("leagues").getOne<LeagueRow>(leagueId, { requestKey: null });
  if (!league.fantasy_league_id) throw new Error("This league is not linked to a Fantasy Challenge league.");
  if (league.status !== "season") throw new Error("Rosters sync once the draft is complete.");

  await finishInterrupted(pb, leagueId, now);

  let teams;
  try {
    teams = await fetchLeagueRosters(token, league.fantasy_league_id, doFetch);
  } catch (error) {
    return record(pb, leagueId, decision, now, {
      status: "failed",
      message: error instanceof FantasyTokenRefused ? error.message : `Could not read the official rosters: ${describe(error)}`,
    });
  }

  const [members, pool, seats] = await Promise.all([readMembers(pb, leagueId), readPool(pb), readSeats(pb, leagueId)]);

  const resolution = resolveFantasy(teams, members, pool);
  for (const link of resolution.teamLinks) {
    await pb.collection("league_members").update(link.memberId, { fantasy_team_id: link.fantasyTeamId }, { requestKey: null });
  }
  for (const link of resolution.playerLinks) {
    await pb.collection("players").update(link.playerId, { fantasy_id: link.fantasyId }, { requestKey: null });
  }
  if (resolution.questions.length > 0) {
    return record(pb, leagueId, decision, now, {
      status: "blocked",
      message: `${plural(resolution.questions.length, "question")} to answer before the rosters can sync.`,
      questions: resolution.questions,
    });
  }

  const target = new Map<string, string[]>();
  for (const team of teams) {
    target.set(resolution.teams.get(team.id)!, team.players.map((player) => resolution.players.get(player.id)!));
  }
  const teamNames = new Map(members.map((member) => [member.id, member.teamName]));
  const playerNames = new Map(pool.map((player) => [player.id, displayName(player.name)]));
  const input: SyncPlanInput = {
    round: decision.round ?? 0,
    seats,
    target,
    teamName: (id) => teamNames.get(id) ?? "A team",
    playerName: (id) => playerNames.get(id) ?? "a player",
  };
  const difference = planSync(input);
  const fromLog =
    difference.steps.length > 0 && decision.round
      ? await planFromOfficialLog(input, {
          token,
          fantasyLeagueId: league.fantasy_league_id,
          round: decision.round,
          teams: resolution.teams,
          players: new Map([
            ...pool.flatMap((player) => (player.fantasyId ? [[player.fantasyId, player.id] as const] : [])),
            ...resolution.players,
          ]),
          doFetch,
        })
      : null;
  const plan = fromLog ?? difference;
  const unexplained =
    difference.steps.length > 0 && decision.round && !fromLog
      ? " The official move log did not explain the change, so it was read from the roster difference: a player traded and released between passes may be credited to the wrong team."
      : "";

  if (decision.mode === "preview") {
    const message =
      plan.steps.length === 0
        ? "The official rosters match the league's."
        : decision.round
          ? `${plural(plan.moves.length, "change")} waiting for round ${decision.round} to tip off.${unexplained}`
          : `${plural(plan.moves.length, "change")} on the official rosters.`;
    return record(pb, leagueId, decision, now, { status: "preview", message, moves: decision.round ? plan.moves : [] });
  }

  if (plan.steps.length === 0) {
    return record(pb, leagueId, decision, now, { status: "applied", message: "The official rosters match the league's." });
  }

  const run = await record(pb, leagueId, decision, now, {
    status: "applying",
    message: clip(`${plural(plan.moves.length, "change")} from the official rosters for round ${decision.round}.${unexplained}`),
    moves: plan.moves,
    steps: plan.steps,
  });
  await applySteps(pb, leagueId, plan.steps, now);

  const agreed = rostersAgree(await readSeats(pb, leagueId), target);
  let message = run.message;
  if (agreed) {
    try {
      await recomputeStandings(pb, season, { leagueId });
    } catch {
      message = `${message} Standings refresh on the next stats pass.`;
    }
  } else {
    message = "The league's rosters still differ from the official ones after the sync; the next pass retries.";
  }
  const status: SyncStatus = agreed ? "applied" : "failed";
  await pb.collection("fantasy_syncs").update(run.id, { status, message: clip(message) }, { requestKey: null });
  return { ...run, status, message: clip(message) };
}

export type MoveRepair = {
  readonly round: number;
  readonly status: "unchanged" | "would-repair" | "repaired" | "unexplained";
  /** Notes of the rows added, or that a write would add. */
  readonly added: readonly string[];
  /** Notes of the rows removed, or that a write would remove. */
  readonly removed: readonly string[];
};

/**
 * Re-record one stored round's synced moves from the official log.
 *
 * Rounds synced before the log was read were planned from roster differences,
 * which credit a player traded and released between two passes to the team
 * that traded him. Rosters were right all along, so this touches only
 * `transactions` rows the sync wrote for the round, never a roster window:
 * the round's before and after rosters are read from the windows themselves,
 * the log is replayed over them, and the stored rows are reconciled with the
 * plan. Hand-recorded rows are left alone. Nothing is announced.
 *
 * ## Failure-recovery story
 *
 * Adds first, then removals, each one row. A run that dies between them
 * leaves both versions; the next run finds the planned rows already stored,
 * removes only the stale ones, and after that finds nothing to do.
 */
export async function repairRoundMoves(options: {
  readonly pb: PocketBase;
  readonly leagueId: string;
  readonly token: string;
  readonly round: number;
  readonly now: Date;
  /** False reports what would change and writes nothing. */
  readonly write: boolean;
  readonly doFetch?: typeof fetch;
}): Promise<MoveRepair> {
  const { pb, leagueId, token, round, now, write, doFetch } = options;
  const league = await pb.collection("leagues").getOne<LeagueRow>(leagueId, { requestKey: null });
  if (!league.fantasy_league_id) throw new Error("This league is not linked to a Fantasy Challenge league.");

  const [members, pool, windows] = await Promise.all([
    readMembers(pb, leagueId),
    readPool(pb),
    pb.collection("roster_memberships").getFullList<{ id: string; member: string; player: string; from_round: number; to_round: number }>({
      filter: `league = '${leagueId}'`,
      fields: "id,member,player,from_round,to_round",
      requestKey: null,
    }),
  ]);
  const heldThrough = (window: { from_round: number; to_round: number }, at: number) =>
    window.from_round <= at && (window.to_round === 0 || window.to_round > at);
  const seats = windows.filter((window) => heldThrough(window, round - 1)).map(({ id, member, player }) => ({ id, member, player }));
  const target = new Map<string, string[]>(members.map((member) => [member.id, []]));
  for (const window of windows) if (heldThrough(window, round)) target.get(window.member)?.push(window.player);

  const teamNames = new Map(members.map((member) => [member.id, member.teamName]));
  const playerNames = new Map(pool.map((player) => [player.id, displayName(player.name)]));
  const plan = await planFromOfficialLog(
    {
      round,
      seats,
      target,
      teamName: (id) => teamNames.get(id) ?? "A team",
      playerName: (id) => playerNames.get(id) ?? "a player",
    },
    {
      token,
      fantasyLeagueId: league.fantasy_league_id,
      round,
      teams: new Map(members.flatMap((member) => (member.fantasyTeamId ? [[member.fantasyTeamId, member.id] as const] : []))),
      players: new Map(pool.flatMap((player) => (player.fantasyId ? [[player.fantasyId, player.id] as const] : []))),
      doFetch,
    },
  );
  if (!plan || plan.steps.length === 0) return { round, status: plan ? "unchanged" : "unexplained", added: [], removed: [] };

  const prefix = `Fantasy Challenge, round ${round}:`;
  const stored = (
    await pb.collection("transactions").getFullList<{ id: string; type: string; members: unknown; players_in: unknown; players_out: unknown; note?: string; date?: string }>({
      filter: `league = '${leagueId}' && from_round = ${round}`,
      requestKey: null,
    })
  ).filter((row) => row.note?.startsWith(prefix));
  const planned = plan.steps.map((step) => ({
    type: step.plan.type,
    members: [...step.plan.members],
    players_in: step.plan.playersIn,
    players_out: step.plan.playersOut,
    note: step.note,
  }));
  const { create, remove } = reconcileMoves(stored, planned);
  const report = { round, added: create.map((row) => row.note), removed: remove.map((row) => row.note ?? "") };
  if (create.length === 0 && remove.length === 0) return { ...report, status: "unchanged" };
  if (!write) return { ...report, status: "would-repair" };

  const date = stored.map((row) => row.date ?? "").filter(Boolean).sort()[0] || asPbDate(now);
  for (const row of create) {
    await pb.collection("transactions").create({ league: leagueId, from_round: round, date, ...row }, { requestKey: null });
  }
  for (const row of remove) await pb.collection("transactions").delete(row.id, { requestKey: null });
  return { ...report, status: "repaired" };
}

/**
 * The worker's entry: every linked league in season, when a pass is due.
 *
 * Returns what ran, for the log. A league that throws is reported and the
 * others still run.
 */
export async function syncDueLeagues(options: {
  readonly pb: PocketBase;
  readonly token: string;
  readonly season: string;
  readonly now: Date;
  readonly doFetch?: typeof fetch;
}): Promise<{ leagueId: string; run?: SyncRun; error?: string }[]> {
  const { pb, now } = options;
  const leagues = await pb.collection("leagues").getFullList<LeagueRow>({
    filter: "status = 'season' && fantasy_league_id != ''",
    fields: "id,status,fantasy_league_id",
    requestKey: null,
  });
  if (leagues.length === 0) return [];
  const decision = await decideSync(pb, options.season, now);
  const results: { leagueId: string; run?: SyncRun; error?: string }[] = [];
  for (const league of leagues) {
    try {
      const lastApply =
        decision.mode === "apply"
          ? await lastRunAt(pb, `league = '${league.id}' && ${ROSTER_RUNS} && mode = 'apply' && round = ${decision.round}`)
          : null;
      const lastAny = await lastRunAt(pb, `league = '${league.id}' && ${ROSTER_RUNS}`);
      if (!syncDue(now.getTime(), decision, lastApply, lastAny)) continue;
      const run = await runFantasySync({ ...options, leagueId: league.id, decision });
      results.push({ leagueId: league.id, run });
    } catch (error) {
      results.push({ leagueId: league.id, error: describe(error) });
    }
  }
  return results;
}

function hundredthsText(hundredths: number): string {
  return String(hundredths / 100);
}

function formationOf(slots: LineupSlots, squad: readonly LineupSquadPlayer[]): string {
  const positions = new Map(squad.map((player) => [player.playerId, player.position]));
  const counts: [number, number, number] = [0, 0, 0];
  for (const id of slots.starters) {
    const at = ["G", "F", "C"].indexOf(positions.get(id) ?? "");
    if (at >= 0) counts[at] += 1;
  }
  return formationName(counts);
}

async function roundHundredthsByMember(
  pb: PocketBase,
  leagueId: string,
  season: string,
  round: number,
): Promise<Map<string, number>> {
  const rows = await pb.collection("standings_snapshots").getFullList<{ table: unknown }>({
    filter: `league = '${leagueId}' && season = "${season}" && round = ${round}`,
    fields: "table",
    requestKey: null,
  });
  return new Map(snapshotRowsFrom(rows[0]?.table).map((row) => [row.memberId, row.roundHundredths]));
}

export type LineupSyncOptions = {
  readonly pb: PocketBase;
  readonly leagueId: string;
  readonly token: string;
  readonly season: string;
  readonly round: number;
  readonly now: Date;
  readonly doFetch?: typeof fetch;
};

/**
 * One round's lineups, every linked team, from the official game.
 *
 * The official lineup wins over one typed here, as the official rosters do. A
 * team whose lineup cannot be placed keeps what it had and is named in the
 * report; the others are still written.
 *
 * The report sets our round total beside the official one per team. A
 * difference does not block anything: the lineup is the official one, so a
 * gap is our box-score points, or a round whose games are not all in yet.
 *
 * ## Failure-recovery story
 *
 * Player links first, each one idempotent field update behind the partial
 * unique index on `players.fantasy_id`, exactly as the roster sync writes them.
 * Then each team is one `round_lineups` row, written by `writeLineup`'s upsert
 * on the unique `(league, member, season, round)` index, and the report is
 * written last. A pass that dies part-way leaves some teams on the official
 * lineup and no report, so the round is still due and the next pass writes the
 * same rows again.
 */
export async function syncRoundLineups(options: LineupSyncOptions): Promise<SyncRun> {
  const { pb, leagueId, token, season, round, now, doFetch } = options;
  const decision = { mode: "apply", round } as const;
  const league = await pb.collection("leagues").getOne<LeagueRow>(leagueId, { requestKey: null });
  if (!league.fantasy_league_id) throw new Error("This league is not linked to a Fantasy Challenge league.");
  if (league.status !== "season") throw new Error("Lineups sync once the draft is complete.");

  let matchday: number;
  try {
    matchday = matchdayIdForRound(await fetchCurrentMatchday(token, league.fantasy_league_id, doFetch), round);
  } catch (error) {
    return record(pb, leagueId, decision, now, {
      kind: "lineups",
      status: "failed",
      message: error instanceof FantasyTokenRefused ? error.message : `Could not find round ${round} in the official game: ${describe(error)}`,
    });
  }

  const [members, pool] = await Promise.all([readMembers(pb, leagueId), readPool(pb)]);
  const template = parseLeagueSettings(league.settings).lineup_template;

  const refused: string[] = [];
  const fetched: { memberId: string; team: string; squad: LineupSquadPlayer[]; lineup: OfficialLineup }[] = [];
  for (const member of members) {
    if (!member.fantasyTeamId) {
      refused.push(`${member.teamName}: not linked to an official team.`);
      continue;
    }
    const squad = await readSquadWithPositions(pb, leagueId, member.id, round);
    if (squad.length === 0) continue;
    try {
      const lineup = await fetchRoundLineup(token, member.fantasyTeamId, matchday, doFetch);
      fetched.push({ memberId: member.id, team: member.teamName, squad, lineup });
    } catch (error) {
      if (error instanceof FantasyTokenRefused) {
        return record(pb, leagueId, decision, now, { kind: "lineups", status: "failed", message: error.message });
      }
      refused.push(`${member.teamName}: ${describe(error)}`);
    }
  }

  const { links, questions } = linkLineupPlayers(
    fetched.flatMap((entry) => entry.lineup.players.map((player) => ({ player: player.official, teamName: entry.team }))),
    pool,
  );
  for (const link of links) {
    await pb.collection("players").update(link.playerId, { fantasy_id: link.fantasyId }, { requestKey: null });
  }
  const playerIdFor = new Map([
    ...pool.filter((row) => row.fantasyId).map((row) => [row.fantasyId, row.id] as const),
    ...links.map((link) => [link.fantasyId, link.playerId] as const),
  ]);
  const playerName = new Map(pool.map((row) => [row.id, displayName(row.name)]));

  const written: { memberId: string; team: string; summary: string; officialHundredths: number }[] = [];
  for (const { memberId, team, squad, lineup } of fetched) {
    const verdict = slotsFromOfficial({ lineup, playerIdFor, squad, template });
    if (!verdict.ok) {
      refused.push(`${team}: ${verdict.reason}`);
      continue;
    }
    await writeLineup(pb, { leagueId, memberId, season, round, slots: verdict.slots, recordedBy: "", source: "synced" });
    written.push({
      memberId,
      team,
      summary: `${formationOf(verdict.slots, squad)} · captain ${playerName.get(verdict.slots.captain) ?? "unknown"}`,
      officialHundredths: Math.round(lineup.pts * 100),
    });
  }

  let standingsNote = "";
  if (written.length > 0) {
    try {
      await recomputeStandings(pb, season, { leagueId });
    } catch {
      standingsNote = " Standings refresh on the next stats pass.";
    }
  }
  const ours = await roundHundredthsByMember(pb, leagueId, season, round);
  let differing = 0;
  const moves = written.map((row) => {
    const here = ours.get(row.memberId) ?? 0;
    if (here !== row.officialHundredths) differing += 1;
    const gap = here === row.officialHundredths ? "" : ` (${hundredthsText(here - row.officialHundredths)})`;
    return `${row.team}: ${row.summary} · ${hundredthsText(here)} here, ${hundredthsText(row.officialHundredths)} official${gap}.`;
  });

  const placed = `${written.length} of ${written.length + refused.length} lineups for round ${round} from the official game.`;
  const totals =
    written.length === 0
      ? ""
      : differing === 0
        ? " Every round total matches the official one."
        : ` ${plural(differing, "round total")} ${differing === 1 ? "differs" : "differ"} from the official one.`;
  const asking = questions.length > 0 ? ` ${plural(questions.length, "player")} to place before the rest can sync.` : "";
  return record(pb, leagueId, decision, now, {
    kind: "lineups",
    status: questions.length > 0 ? "blocked" : refused.length > 0 ? "failed" : "applied",
    message: `${placed}${totals}${asking}${standingsNote}`,
    moves: [...refused, ...moves],
    questions,
  });
}

/**
 * The lineup entry, after the roster pass: every linked league (or the one
 * named), every round `lineupRoundsDue` names. A league that throws is
 * reported and the others still run.
 */
export async function syncDueLineups(options: {
  readonly pb: PocketBase;
  readonly token: string;
  readonly season: string;
  readonly now: Date;
  readonly leagueId?: string;
  readonly force?: boolean;
  readonly doFetch?: typeof fetch;
}): Promise<{ leagueId: string; run?: SyncRun; error?: string }[]> {
  const { pb, now } = options;
  const leagues = await pb.collection("leagues").getFullList<LeagueRow>({
    filter: `status = 'season' && fantasy_league_id != ''${options.leagueId ? ` && id = '${options.leagueId}'` : ""}`,
    fields: "id",
    requestKey: null,
  });
  if (leagues.length === 0) return [];
  const fixtures = await readStoredFixtures(pb, options.season);
  const windows = roundWindows(fixtures.map((row) => ({ round: row.round, utcDate: row.utc_date || null })));
  const results: { leagueId: string; run?: SyncRun; error?: string }[] = [];
  for (const league of leagues) {
    try {
      const runs = await pb.collection("fantasy_syncs").getFullList<{ round: number; ran_at: string; status: string }>({
        filter: `league = '${league.id}' && kind = 'lineups'`,
        fields: "round,ran_at,status",
        requestKey: null,
      });
      const refs = runs.map((run) => ({ round: run.round, ranAt: Date.parse(run.ran_at.replace(" ", "T")), status: run.status }));
      for (const round of lineupRoundsDue(now.getTime(), windows, refs, options.force)) {
        const run = await syncRoundLineups({ ...options, leagueId: league.id, round });
        results.push({ leagueId: league.id, run });
      }
    } catch (error) {
      results.push({ leagueId: league.id, error: describe(error) });
    }
  }
  return results;
}
