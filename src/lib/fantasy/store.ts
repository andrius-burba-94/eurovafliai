import type PocketBase from "pocketbase";

import { readStoredFixtures } from "@/lib/fixtures/store";
import { applyTransaction, listActiveMemberships } from "@/lib/memberships/store";
import { recomputeStandings } from "@/lib/stats/standings-store";

import { FantasyTokenRefused, fetchLeagueRosters } from "./client";
import { resolveFantasy, type PoolPlayer, type SyncMember, type SyncQuestion } from "./match";
import { planSync, rostersAgree, type SyncSeat, type SyncStep } from "./plan";
import { roundWindows, syncDue, syncModeAt, type SyncDecision } from "./windows";

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

export type SyncStatus = "preview" | "blocked" | "applying" | "applied" | "failed";

export type SyncRun = {
  readonly id: string;
  readonly mode: SyncDecision["mode"];
  readonly round: number;
  readonly status: SyncStatus;
  readonly message: string;
  readonly moves: readonly string[];
  readonly questions: readonly SyncQuestion[];
  readonly ran_at: string;
};

type SyncRecord = SyncRun & { readonly steps?: readonly SyncStep[] | null };

type LeagueRow = { id: string; status: string; fantasy_league_id?: string };

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

  const [memberRows, poolRows, seats] = await Promise.all([
    pb.collection("league_members").getFullList<{ id: string; team_name: string; fantasy_team_id?: string }>({
      filter: `league = '${leagueId}'`,
      fields: "id,team_name,fantasy_team_id",
      requestKey: null,
    }),
    pb.collection("players").getFullList<{
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
    }),
    readSeats(pb, leagueId),
  ]);
  const members: SyncMember[] = memberRows.map((row) => ({
    id: row.id,
    teamName: row.team_name.trim() || "Unnamed team",
    fantasyTeamId: row.fantasy_team_id ?? "",
  }));
  const pool: PoolPlayer[] = poolRows.map((row) => ({
    id: row.id,
    name: row.name,
    nameNormalized: row.name_normalized,
    clubCode: row.club_code,
    clubName: row.club_name,
    dorsal: row.dorsal ?? "",
    fantasyId: row.fantasy_id ?? "",
    status: row.status ?? "",
  }));

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
  const playerNames = new Map(pool.map((player) => [player.id, player.name]));
  const plan = planSync({
    round: decision.round ?? 0,
    seats,
    target,
    teamName: (id) => teamNames.get(id) ?? "A team",
    playerName: (id) => playerNames.get(id) ?? "a player",
  });

  if (decision.mode === "preview") {
    const message =
      plan.steps.length === 0
        ? "The official rosters match the league's."
        : decision.round
          ? `${plural(plan.moves.length, "change")} waiting for round ${decision.round} to tip off.`
          : `${plural(plan.moves.length, "change")} on the official rosters.`;
    return record(pb, leagueId, decision, now, { status: "preview", message, moves: decision.round ? plan.moves : [] });
  }

  if (plan.steps.length === 0) {
    return record(pb, leagueId, decision, now, { status: "applied", message: "The official rosters match the league's." });
  }

  const run = await record(pb, leagueId, decision, now, {
    status: "applying",
    message: `${plural(plan.moves.length, "change")} from the official rosters for round ${decision.round}.`,
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
          ? await lastRunAt(pb, `league = '${league.id}' && mode = 'apply' && round = ${decision.round}`)
          : null;
      const lastAny = await lastRunAt(pb, `league = '${league.id}'`);
      if (!syncDue(now.getTime(), decision, lastApply, lastAny)) continue;
      const run = await runFantasySync({ ...options, leagueId: league.id, decision });
      results.push({ leagueId: league.id, run });
    } catch (error) {
      results.push({ leagueId: league.id, error: describe(error) });
    }
  }
  return results;
}
