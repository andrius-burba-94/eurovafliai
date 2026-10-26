import { createHash, randomBytes } from "node:crypto";
import type PocketBase from "pocketbase";

import { isUniqueViolation } from "@/lib/drafts/unique";
import type { SyncQuestion } from "@/lib/fantasy/match";
import { rostersAgree, type SyncSeat, type SyncStep } from "@/lib/fantasy/plan";
import type { FantasyPlayer } from "@/lib/fantasy/parse";
import type { Position } from "@/lib/engine";
import type { FrozenRoles, LineupSlots } from "@/lib/lineups/lineup";
import { readPool } from "@/lib/fantasy/store";
import { readFrozenRoles, writeLineup } from "@/lib/lineups/store";
import { applySteps, clip, materializeDraftMemberships, readSeats } from "@/lib/memberships/store";
import { newTeamSlug } from "@/lib/slugs/store";
import { recomputeStandings } from "@/lib/stats/standings-store";

import type { BasketNewsTeam } from "./client";
import type { BasketNewsRepository, BasketNewsRoundResult, RoundFreeze } from "./sync";
import { rememberSourcePlayers } from "./registrations";

type LeagueRow = { id: string; name: string; season: string; commissioner: string; basketnews_team_id: string; basketnews_roster_round?: number };
type MemberRow = { id: string; user: string; team_name: string; basketnews_team_id?: string };
type DraftRow = { id: string; status: string; order: unknown; rounds: number };
type PickRow = { id: string; overall_no: number; member: string; player: string };
type JobRow = { id: string; league: string; status: string; job_meta?: { nextRound?: number } };
type RosterBatch = { id: string; league: string; season: string; round: number; target: [string, string[]][]; steps: SyncStep[]; at: string; status: string };

/** Stored source scores drive every BasketNews player view as well as the ladder. */
export async function readBasketNewsPlayerRounds(pb: PocketBase, leagueId: string, season: string, memberId?: string) {
  const scope = memberId ? ` && member = '${memberId}'` : "";
  const rows = await pb.collection("round_lineups").getFullList<{
    round: number;
    basketnews_result?: { players?: { playerId: string; rawHundredths: number }[] };
  }>({
    filter: `league = '${leagueId}' && season = "${season}"${scope}`,
    fields: "round,basketnews_result", requestKey: null,
  });
  return rows.flatMap((row) => (row.basketnews_result?.players ?? []).map((player) => ({
    player: player.playerId, round: row.round, fantasy_pts: player.rawHundredths / 10,
  })));
}

/** A unique active row makes repeated clicks and scheduled passes one job. */
export async function queueBasketNewsSync(pb: PocketBase, leagueId: string, now: Date): Promise<string> {
  const active = await pb.collection("fantasy_syncs").getFullList<JobRow>({
    filter: `league = '${leagueId}' && provider = 'basketnews' && (status = 'queued' || status = 'running')`,
    fields: "id,league,status,job_meta", requestKey: null,
  });
  if (active[0]) return active[0].id;
  const previous = await pb.collection("fantasy_syncs").getList<JobRow>(1, 1, {
    filter: `league = '${leagueId}' && provider = 'basketnews'`,
    sort: "-ran_at", fields: "status,job_meta", requestKey: null,
  });
  try {
    const job = await pb.collection("fantasy_syncs").create<JobRow>({
      league: leagueId, provider: "basketnews", kind: "basketnews", mode: "apply", round: 0,
      ran_at: now.toISOString().replace("T", " "), status: "queued", message: "Waiting for the BasketNews worker.",
      moves: [], questions: [], steps: [], job_meta: previous.items[0]?.status === "failed" ? previous.items[0].job_meta ?? {} : {}, active_league: leagueId,
    }, { requestKey: null });
    return job.id;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const raced = await pb.collection("fantasy_syncs").getFullList<JobRow>({
      filter: `league = '${leagueId}' && provider = 'basketnews' && (status = 'queued' || status = 'running')`,
      fields: "id", requestKey: null,
    });
    if (!raced[0]) throw error;
    return raced[0].id;
  }
}

export async function queuedBasketNewsJobs(pb: PocketBase): Promise<JobRow[]> {
  return pb.collection("fantasy_syncs").getFullList<JobRow>({
    filter: "provider = 'basketnews' && (status = 'queued' || status = 'running')",
    sort: "ran_at", fields: "id,league,status,job_meta", requestKey: null,
  });
}

export async function markBasketNewsJob(pb: PocketBase, jobId: string, fields: {
  status: "running" | "applied" | "blocked" | "failed";
  message: string;
  questions?: readonly SyncQuestion[];
  round?: number;
  active_league?: "";
  diagnostics?: readonly string[];
}): Promise<void> {
  await pb.collection("fantasy_syncs").update(jobId, { ...fields, message: clip(fields.message) }, { requestKey: null });
}

export async function basketNewsLeagueIds(pb: PocketBase): Promise<string[]> {
  const leagues = await pb.collection("leagues").getFullList<{ id: string }>({
    filter: "basketnews_team_id != ''", fields: "id", requestKey: null,
  });
  return leagues.map((league) => league.id);
}

/** The only PocketBase adapter; `syncBasketNews` uses its database-agnostic port. */
export class PocketBaseBasketNewsRepository implements BasketNewsRepository {
  constructor(private readonly pb: PocketBase) {}

  async load(leagueId: string) {
    const league = await this.pb.collection("leagues").getOne<LeagueRow>(leagueId, { requestKey: null });
    const season = `E${league.season.slice(0, 4)}`;
    const [pool, lineups, members, fixtures, memberships] = await Promise.all([
      readPool(this.pb),
      this.pb.collection("round_lineups").getFullList<{ round: number; basketnews_result?: { final?: boolean } | null }>({
        filter: `league = '${leagueId}' && season = "${season}"`,
        fields: "round,basketnews_result", requestKey: null,
      }),
      this.pb.collection("league_members").getFullList<{ id: string }>({ filter: `league = '${leagueId}'`, fields: "id", requestKey: null }),
      this.pb.collection("fixtures").getFullList<{ round: number; played: boolean; local_club?: string; road_club?: string; utc_date?: string }>({
        filter: `season = "${season}"`, fields: "round,played,local_club,road_club,utc_date", requestKey: null,
      }),
      this.pb.collection("roster_memberships").getFullList<{ from_round: number }>({ filter: `league = '${leagueId}'`, fields: "from_round", requestKey: null }),
    ]);
    // A result stored before `final` existed is re-read once; replay is idempotent.
    const finalCount = new Map<number, number>();
    for (const row of lineups) {
      finalCount.set(row.round, (finalCount.get(row.round) ?? 0) + (row.basketnews_result?.final === true ? 1 : 0));
    }
    const stored = [...finalCount.keys()].sort((a, b) => a - b);
    let open = 1;
    while (members.length > 0 && finalCount.get(open) === members.length) open += 1;
    return {
      name: league.name, season, commissioner: league.commissioner, sourceTeamId: league.basketnews_team_id,
      firstOpenRound: open,
      latestStoredRound: stored.at(-1) ?? 0,
      rosterRound: league.basketnews_roster_round || Math.max(1, ...memberships.map((row) => row.from_round || 1)),
      fixtures: fixtures.map((row) => ({
        round: row.round, played: row.played, localClub: row.local_club ?? "", roadClub: row.road_club ?? "", utcDate: row.utc_date || null,
      })),
      pool,
    };
  }

  async linkLeague(leagueId: string, sourceLeagueId: string): Promise<void> {
    await this.pb.collection("leagues").update(leagueId, { basketnews_league_id: sourceLeagueId }, { requestKey: null });
  }

  async ensureMembers(leagueId: string, teams: readonly BasketNewsTeam[], ownTeamId: string, commissioner: string, firstPickOrder: readonly string[]) {
    const existing = await this.pb.collection("league_members").getFullList<MemberRow>({
      filter: `league = '${leagueId}'`, fields: "id,user,team_name,basketnews_team_id", requestKey: null,
    });
    const result = new Map<string, { id: string; name: string }>();
    for (const team of teams) {
      let member = existing.find((row) => row.basketnews_team_id === team.id);
      if (!member && team.id === ownTeamId) member = existing.find((row) => row.user === commissioner);
      if (!member) {
        const email = `basketnews-${team.id}@basketnews.invalid`;
        const found = await this.pb.collection("users").getFullList<{ id: string }>({ filter: `email = '${email}'`, fields: "id", requestKey: null });
        let userId = found[0]?.id;
        if (!userId) {
          const password = randomBytes(32).toString("base64url");
          const user = await this.pb.collection("users").create<{ id: string }>({ email, password, passwordConfirm: password, name: team.title.trim(), verified: true }, { requestKey: null });
          userId = user.id;
        }
        member = await this.pb.collection("league_members").create<MemberRow>({
          league: leagueId, user: userId, team_name: team.title.trim(),
          slug: await newTeamSlug(this.pb, leagueId, team.title.trim()),
          basketnews_team_id: team.id, draft_position: firstPickOrder.indexOf(team.id) + 1,
          autodraft_enabled: false, is_ready: true,
        }, { requestKey: null });
      } else {
        await this.pb.collection("league_members").update(member.id, {
          team_name: team.title.trim(), basketnews_team_id: team.id,
          slug: await newTeamSlug(this.pb, leagueId, team.title.trim(), member.id),
          draft_position: firstPickOrder.indexOf(team.id) + 1,
        }, { requestKey: null });
      }
      result.set(team.id, { id: member.id, name: team.title.trim() });
    }
    return result;
  }

  async linkPlayers(links: readonly { playerId: string; sourceId: string; position: Position; updateId: boolean; updatePosition: boolean }[]): Promise<void> {
    for (const link of links) await this.pb.collection("players").update(link.playerId, {
      ...(link.updateId ? { basketnews_id: link.sourceId } : {}),
      ...(link.updatePosition ? { basketnews_position: link.position } : {}),
    }, { requestKey: null });
  }

  async ensureDraft(leagueId: string, picks: readonly { memberId: string; playerId: string }[], order: readonly string[], draftDate: Date): Promise<void> {
    const drafts = await this.pb.collection("drafts").getFullList<DraftRow>({ filter: `league = '${leagueId}'`, fields: "id,status,order,rounds", requestKey: null });
    if (drafts.length > 1) throw new Error("The mirrored league has more than one draft.");
    const draft = drafts[0] ?? await this.pb.collection("drafts").create<DraftRow>({
      league: leagueId, format: "snake", status: "complete", order, rounds: picks.length / order.length,
      current_pick: picks.length + 1,
    }, { requestKey: null });
    const stored = await this.pb.collection("picks").getFullList<PickRow>({ filter: `draft = '${draft.id}'`, fields: "id,overall_no,member,player", requestKey: null });
    const byNumber = new Map(stored.map((row) => [row.overall_no, row]));
    for (const [index, pick] of picks.entries()) {
      const current = byNumber.get(index + 1);
      if (current && (current.member !== pick.memberId || current.player !== pick.playerId)) throw new Error(`BasketNews pick ${index + 1} differs from the stored draft.`);
      if (current) continue;
      await this.pb.collection("picks").create({
        draft: draft.id, overall_no: index + 1, round: Math.floor(index / order.length) + 1,
        slot: index % order.length + 1, member: pick.memberId, player: pick.playerId, is_auto: false,
      }, { requestKey: null });
    }
    await this.pb.collection("leagues").update(leagueId, { status: "season" }, { requestKey: null });
    const windows = await this.pb.collection("roster_memberships").getFullList<{ to_date?: string }>({ filter: `league = '${leagueId}'`, fields: "to_date", requestKey: null });
    if (windows.every((row) => !row.to_date)) {
      await materializeDraftMemberships(this.pb, { id: draft.id, league: leagueId }, picks, draftDate);
    }
  }

  async seats(leagueId: string): Promise<SyncSeat[]> {
    return readSeats(this.pb, leagueId);
  }

  async apply(leagueId: string, steps: readonly SyncStep[], at: Date): Promise<void> {
    await applySteps(this.pb, leagueId, steps, at);
  }

  async rememberPlayers(leagueId: string, season: string, players: readonly FantasyPlayer[]): Promise<void> {
    await rememberSourcePlayers(this.pb, leagueId, season, players);
  }

  async appliedEvents(leagueId: string, round: number): Promise<ReadonlySet<string>> {
    const rows = await this.pb.collection("transactions").getFullList<{ source_event_id?: string }>({
      filter: `league = '${leagueId}' && from_round = ${round} && source_provider = 'basketnews'`, fields: "source_event_id", requestKey: null,
    });
    return new Set(rows.flatMap((row) => row.source_event_id ? [row.source_event_id] : []));
  }

  async resume(leagueId: string): Promise<void> {
    const batches = await this.pb.collection("basketnews_roster_batches").getFullList<RosterBatch>({
      filter: `league = '${leagueId}' && status = 'applying'`, sort: "round", requestKey: null,
    });
    for (const batch of batches) await this.finishBatch(batch);
  }

  private async finishBatch(batch: RosterBatch): Promise<void> {
    await this.apply(batch.league, batch.steps, new Date(batch.at));
    if (!rostersAgree(await this.seats(batch.league), new Map(batch.target))) throw new Error(`BasketNews round ${batch.round}: roster writes are incomplete; the saved plan will retry.`);
    // Checkpoint first, verdict last: a crash cannot leave an applied journal
    // whose ownership checkpoint still invites an older roster replay.
    await this.pb.collection("leagues").update(batch.league, { basketnews_roster_round: batch.round }, { requestKey: null });
    await this.pb.collection("basketnews_roster_batches").update(batch.id, { status: "applied" }, { requestKey: null });
  }

  async reconcile(leagueId: string, season: string, round: number, target: ReadonlyMap<string, readonly string[]>, steps: readonly SyncStep[], at: Date): Promise<void> {
    const serialized = [...target].map(([member, players]) => [member, [...players].sort()] as [string, string[]]).sort(([a], [b]) => a.localeCompare(b));
    // A leave-and-return event changes history without changing ownership.
    // Give its saved intent its own identity alongside the roster target.
    const events = steps.flatMap((step) => step.provenance ? [step.provenance] : []);
    const hash = createHash("sha256").update(JSON.stringify(events.length ? [serialized, events] : serialized)).digest("hex");
    const [previous] = await this.pb.collection("basketnews_roster_batches").getFullList<RosterBatch>({
      filter: `league = '${leagueId}' && season = '${season}' && round = ${round} && target_hash = '${hash}'`, requestKey: null,
    });
    if (previous?.status === "applied" && rostersAgree(await this.seats(leagueId), target)) return;
    if (previous) { await this.finishBatch(previous); return; }
    const batch = await this.pb.collection("basketnews_roster_batches").create<RosterBatch>({
      league: leagueId, season, round, target_hash: hash, target: serialized, steps, at: at.toISOString(), status: "applying",
    }, { requestKey: null });
    await this.finishBatch(batch);
  }

  async frozenRoles(leagueId: string, season: string, round: number): Promise<ReadonlyMap<string, FrozenRoles>> {
    return readFrozenRoles(this.pb, { leagueId, season, round });
  }

  async writeRound(leagueId: string, season: string, round: number, memberId: string, slots: LineupSlots, result: BasketNewsRoundResult | null, freeze?: RoundFreeze): Promise<void> {
    const existing = result ? [] : await this.pb.collection("round_lineups").getFullList<{ id: string }>({ filter: `league = '${leagueId}' && member = '${memberId}' && season = '${season}' && round = ${round}`, fields: "id", requestKey: null });
    await writeLineup(this.pb, { leagueId, memberId, season, round, slots, recordedBy: "", source: "synced", ...(result || existing.length === 0 ? { basketnewsResult: result } : {}), ...(freeze ? { freeze } : {}) });
  }

  async recompute(season: string, leagueId: string): Promise<void> {
    await recomputeStandings(this.pb, season, { leagueId });
  }

  async progress(jobId: string, nextRound: number): Promise<void> {
    await this.pb.collection("fantasy_syncs").update(jobId, { job_meta: { nextRound } }, { requestKey: null });
  }
}
