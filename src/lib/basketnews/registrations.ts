import type PocketBase from "pocketbase";

import { isUniqueViolation } from "@/lib/drafts/unique";
import type { FantasyPlayer } from "@/lib/fantasy/parse";
import type { Position } from "@/lib/engine";
import { resolveClubs } from "@/lib/fantasy/match";
import { readPool } from "@/lib/fantasy/store";
import { readCurrentPlayers } from "@/lib/rosters/apply";
import { normalizeName } from "@/lib/rosters/normalize";
import { SafeActionError } from "@/lib/safe-error";
import type { NormalizedPlayer } from "@/lib/rosters/types";

import { queueBasketNewsSync } from "./repository";
import { readBasketNewsPlayerPool, readBasketNewsTeamReference } from "./client";

export type SourcePlayerQuestion = {
  id: string; provider: "basketnews"; season: string; source_id: string;
  details: FantasyPlayer; leagues: string[]; status: "pending" | "approved" | "confirmed";
  player?: string; approved_by?: string; checked_at?: string; recovery_pending?: boolean;
  pending_leagues?: string[];
};

/** One durable question per source identity, even when several leagues need it. */
export async function rememberSourcePlayers(pb: PocketBase, leagueId: string, season: string, players: readonly FantasyPlayer[], raced = false): Promise<void> {
  for (const player of players) {
    const filter = `provider = 'basketnews' && season = '${season}' && source_id = '${player.id}'`;
    const [existing] = await pb.collection("source_player_questions").getFullList<SourcePlayerQuestion>({ filter, requestKey: null });
    if (existing) {
      await pb.collection("source_player_questions").update(existing.id, { details: player, leagues: [...new Set([...existing.leagues, leagueId])] }, { requestKey: null });
      continue;
    }
    try {
      await pb.collection("source_player_questions").create({ provider: "basketnews", season, source_id: player.id, details: player, leagues: [leagueId], status: "pending" }, { requestKey: null });
    } catch (error) {
      // Re-read the winning identity so a second league is not lost in a race;
      // a second violation is no race.
      if (raced || !isUniqueViolation(error)) throw error;
      await rememberSourcePlayers(pb, leagueId, season, [player], true);
    }
  }
}

/** Called only after the server action has checked this league's manager. */
export async function approveSourcePlayer(pb: PocketBase, input: {
  leagueId: string; season: string; userId: string; sourceId: string; freshPool: readonly FantasyPlayer[];
}): Promise<string> {
  const player = input.freshPool.find((row) => row.id === input.sourceId);
  if (!player) throw new SafeActionError("BasketNews no longer lists this player. Sync again before approving.");
  await rememberSourcePlayers(pb, input.leagueId, input.season, [player]);
  const [question] = await pb.collection("source_player_questions").getFullList<SourcePlayerQuestion>({
    filter: `provider = 'basketnews' && season = '${input.season}' && source_id = '${input.sourceId}'`, requestKey: null,
  });
  const linked = await pb.collection("players").getFullList<{ id: string }>({ filter: `basketnews_id = '${player.id}'`, fields: "id", requestKey: null });
  let id = linked[0]?.id;
  if (!id) {
    const pool = await readPool(pb);
    const clubs = resolveClubs([{ id: "pool", name: "BasketNews", manager: "", players: [...input.freshPool] }], pool);
    const clubCode = clubs.get(player.club.id);
    if (!clubCode) throw new SafeActionError("The source club needs a mapping before this player can be approved.");
    const surname = normalizeName(player.lastName).split(" ").filter(Boolean);
    if (pool.some((row) => row.clubCode === clubCode && surname.every((token) => row.nameNormalized.split(" ").includes(token)))) {
      throw new SafeActionError("A possible existing player needs mapping; approval cannot create a duplicate.");
    }
    // Approval intent precedes creation. If creation or queuing fails, retrying
    // finds the same source identity and finishes it under its unique index.
    await pb.collection("source_player_questions").update(question!.id, { approved_by: input.userId, recovery_pending: true, pending_leagues: question!.leagues }, { requestKey: null });
    try {
      const created = await pb.collection("players").create<{ id: string }>({
        name: `${player.lastName}, ${player.firstName}`, name_normalized: normalizeName(`${player.firstName} ${player.lastName}`),
        club_code: clubCode, club_name: player.club.name, position: player.position,
        basketnews_id: player.id, basketnews_position: player.position, basketnews_listed: true,
        status: "active", source: "manual", person_code: "", dorsal: player.jersey,
        awaiting_registration: true, manual_lock: false,
      }, { requestKey: null });
      id = created.id;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const [winner] = await pb.collection("players").getFullList<{ id: string }>({ filter: `basketnews_id = '${player.id}'`, fields: "id", requestKey: null });
      if (!winner) throw error;
      id = winner.id;
    }
  }
  await pb.collection("source_player_questions").update(question!.id, { player: id, status: question!.status === "confirmed" ? "confirmed" : "approved", approved_by: input.userId, recovery_pending: true, pending_leagues: question!.leagues }, { requestKey: null });
  await recoverSourcePlayers(pb, input.season);
  return id;
}

/** An official match confirms identity; only the normal authoritative import
 * may create an unapproved player or fill the EuroLeague fields. */
export async function confirmSourcePlayers(pb: PocketBase, season: string, incoming: readonly NormalizedPlayer[], now: Date, source = { teamReference: readBasketNewsTeamReference, playerPool: readBasketNewsPlayerPool }): Promise<string[]> {
  const problems: string[] = [];
  const questions = await pb.collection("source_player_questions").getFullList<SourcePlayerQuestion>({ filter: `season = '${season}'`, requestKey: null });
  for (const question of questions.filter((row) => row.approved_by && !row.player)) {
    try {
    // A manager's saved approval is authority to finish an interrupted create,
    // but the provider must still list the player when that intent resumes.
    const leagues = await pb.collection("leagues").getFullList<{ id: string; basketnews_team_id?: string }>({ filter: "basketnews_team_id != ''", fields: "id,basketnews_team_id", requestKey: null });
    const league = leagues.find((row) => question.leagues.includes(row.id));
    if (!league?.basketnews_team_id) continue;
    const reference = await source.teamReference(league.basketnews_team_id);
    const freshPool = await source.playerPool(reference.leagueId);
    const id = await approveSourcePlayer(pb, { leagueId: league.id, season, sourceId: question.source_id, userId: question.approved_by!, freshPool });
    question.player = id;
    question.status = "approved";
    } catch (error) { problems.push(`Approval ${question.source_id} is still pending: ${(error as Error).message}`); }
  }
  const pool = await readCurrentPlayers(pb);
  const linked = await pb.collection("players").getFullList<{ id: string; basketnews_id?: string; basketnews_position?: Position }>({ fields: "id,basketnews_id,basketnews_position", requestKey: null });
  for (const question of questions) {
    if (question.status === "confirmed") continue;
    const detail = question.details;
    const exactName = normalizeName(`${detail.firstName} ${detail.lastName}`);
    const matches = incoming.filter((row) => row.person_code && row.name_normalized === exactName && normalizeName(row.club_name) === normalizeName(detail.club.name));
    const official = matches.length === 1 ? matches[0] : undefined;
    await pb.collection("source_player_questions").update(question.id, { checked_at: now.toISOString() }, { requestKey: null });
    if (!official) continue;
    const stored = pool.filter((row) => row.person_code === official.person_code);
    if (stored.length !== 1 || stored[0]!.manual_lock) continue;
    const player = stored[0]!;
    const otherLink = linked.find((row) => row.basketnews_id === detail.id);
    if ((otherLink && otherLink.id !== player.id) || (question.player && question.player !== player.id)) continue;
    const already = linked.find((row) => row.id === player.id)?.basketnews_id;
    if (already && already !== detail.id) continue;
    await pb.collection("players").update(player.id, { basketnews_id: detail.id, ...(!linked.find((row) => row.id === player.id)?.basketnews_position ? { basketnews_position: detail.position } : {}), basketnews_listed: true, awaiting_registration: false }, { requestKey: null });
    await pb.collection("source_player_questions").update(question.id, { player: player.id, status: "confirmed", confirmed_at: now.toISOString(), recovery_pending: true, pending_leagues: question.leagues }, { requestKey: null });
  }
  await recoverSourcePlayers(pb, season);
  return problems;
}

/** A failed queue remains outstanding even when the next roster read is unchanged. */
export async function recoverSourcePlayers(pb: PocketBase, season: string): Promise<void> {
  const questions = await pb.collection("source_player_questions").getFullList<SourcePlayerQuestion>({ filter: `season = '${season}' && recovery_pending = true`, requestKey: null });
  for (const question of questions) {
    if (!question.player) continue;
    for (const leagueId of question.pending_leagues ?? question.leagues) {
      const leagues = await pb.collection("leagues").getFullList<{ id: string }>({ filter: `id = '${leagueId}'`, fields: "id", requestKey: null });
      if (leagues.length) await queueBasketNewsSync(pb, leagueId, new Date());
    }
  }
}

/** Queued is not recovered: a running job may already have read old mappings. */
export async function completeSourcePlayerRecovery(pb: PocketBase, season: string, leagueId: string): Promise<void> {
  const questions = await pb.collection("source_player_questions").getFullList<SourcePlayerQuestion>({ filter: `season = '${season}' && recovery_pending = true`, requestKey: null });
  for (const question of questions) {
    if (!question.player) continue;
    const pending = (question.pending_leagues ?? question.leagues).filter((id) => id !== leagueId);
    await pb.collection("source_player_questions").update(question.id, { pending_leagues: pending, recovery_pending: pending.length > 0 }, { requestKey: null });
  }
}
