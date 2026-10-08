import { randomBytes } from "node:crypto";
import type PocketBase from "pocketbase";

import { isUniqueViolation } from "@/lib/drafts/unique";
import type { SyncQuestion } from "@/lib/fantasy/match";
import type { SyncSeat, SyncStep } from "@/lib/fantasy/plan";
import type { Position } from "@/lib/engine";
import type { LineupSlots } from "@/lib/lineups/lineup";
import { writeLineup } from "@/lib/lineups/store";
import { applyTransaction, listActiveMemberships, materializeDraftMemberships } from "@/lib/memberships/store";
import { newTeamSlug } from "@/lib/slugs/store";
import { recomputeStandings } from "@/lib/stats/standings-store";

import type { BasketNewsTeam } from "./client";
import type { BasketNewsRepository, BasketNewsRoundResult } from "./sync";

type LeagueRow = { id: string; name: string; season: string; commissioner: string; basketnews_team_id: string };
type MemberRow = { id: string; user: string; team_name: string; basketnews_team_id?: string };
type DraftRow = { id: string; status: string; order: unknown; rounds: number };
type PickRow = { id: string; overall_no: number; member: string; player: string };
type JobRow = { id: string; league: string; status: string; job_meta?: { nextRound?: number } };
type PlayerRow = { id: string; name: string; name_normalized: string; club_code: string; club_name: string; fantasy_id?: string; basketnews_id?: string; basketnews_position?: Position; status?: string; dorsal?: string };

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
}): Promise<void> {
  await pb.collection("fantasy_syncs").update(jobId, fields, { requestKey: null });
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
    const [players, lineups, members, fixtures] = await Promise.all([
      this.pb.collection("players").getFullList<PlayerRow>({
        fields: "id,name,name_normalized,club_code,club_name,dorsal,fantasy_id,basketnews_id,basketnews_position,status", requestKey: null,
      }),
      this.pb.collection("round_lineups").getFullList<{ round: number; basketnews_result?: { final?: boolean } | null }>({
        filter: `league = '${leagueId}' && season = "${season}"`,
        fields: "round,basketnews_result", requestKey: null,
      }),
      this.pb.collection("league_members").getFullList<{ id: string }>({ filter: `league = '${leagueId}'`, fields: "id", requestKey: null }),
      this.pb.collection("fixtures").getFullList<{ round: number; played: boolean }>({
        filter: `season = "${season}"`, fields: "round,played", requestKey: null,
      }),
    ]);
    const pool = players.map((row) => ({
      id: row.id, name: row.name, nameNormalized: row.name_normalized, clubCode: row.club_code,
      clubName: row.club_name, dorsal: row.dorsal ?? "", fantasyId: row.fantasy_id ?? "",
      status: row.status ?? "", basketnewsId: row.basketnews_id ?? "", basketnewsPosition: row.basketnews_position,
    }));
    // A result stored before `final` existed is re-read once; replay is idempotent.
    const finalCount = new Map<number, number>();
    for (const row of lineups) {
      finalCount.set(row.round, (finalCount.get(row.round) ?? 0) + (row.basketnews_result?.final === true ? 1 : 0));
    }
    const stored = [...finalCount.keys()].sort((a, b) => a - b);
    const open = stored.find((round) => finalCount.get(round)! < members.length);
    return {
      name: league.name, season, commissioner: league.commissioner, sourceTeamId: league.basketnews_team_id,
      firstOpenRound: open ?? (stored.at(-1) ?? 0) + 1,
      latestStoredRound: stored.at(-1) ?? 0,
      fixtures, pool,
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
    const rows = await listActiveMemberships<{ id: string; member: string; player: string; to_date?: string }>(this.pb, leagueId, { fields: "id,member,player,to_date" });
    return rows.map((row) => ({ id: row.id, member: row.member, player: row.player }));
  }

  async apply(leagueId: string, steps: readonly SyncStep[], at: Date): Promise<void> {
    for (const step of steps) await applyTransaction(this.pb, leagueId, step.plan, at, step.announcement, step.note);
  }

  async writeRound(leagueId: string, season: string, round: number, memberId: string, slots: LineupSlots, result: BasketNewsRoundResult | null): Promise<void> {
    await writeLineup(this.pb, { leagueId, memberId, season, round, slots, recordedBy: "", source: "synced", basketnewsResult: result });
  }

  async recompute(season: string, leagueId: string): Promise<void> {
    await recomputeStandings(this.pb, season, { leagueId });
  }

  async progress(jobId: string, nextRound: number): Promise<void> {
    await this.pb.collection("fantasy_syncs").update(jobId, { job_meta: { nextRound } }, { requestKey: null });
  }
}
