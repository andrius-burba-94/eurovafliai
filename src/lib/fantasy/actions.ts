"use server";


import { requireSession } from "@/lib/auth/session";
import { serverConfig } from "@/lib/config/server";
import { describeError } from "@/lib/drafts/pipeline";
import { isManager } from "@/lib/leagues/lobby";
import type { LeagueRecord, MemberRecord } from "@/lib/leagues/types";
import { getSuperuserClient } from "@/lib/pb/superuser";

import { fetchLeagueRosters } from "./client";
import { decideSync, runFantasySync, syncDueLineups } from "./store";
import { revalidateLeague } from "@/lib/nav/revalidate";
import { queueBasketNewsSync } from "@/lib/basketnews/repository";

/**
 * The commissioner's side of the Fantasy Challenge sync: link the league,
 * answer what the matcher could not, and sync on demand.
 *
 * Each action is a single write, or `runFantasySync` and `syncRoundLineups` (by
 * way of `syncDueLineups`) — whose own failure-recovery stories cover the
 * multi-write case.
 */

export type FantasyActionResult = { error: string | null; done: string | null };

const REFUSED: FantasyActionResult = { error: "Only the commissioner, or someone they trust with it, can do that.", done: null };

async function managedLeague(leagueId: string) {
  const session = await requireSession();
  const pb = await getSuperuserClient();
  let league: LeagueRecord;
  try {
    league = await pb.collection("leagues").getOne<LeagueRecord>(leagueId, { requestKey: null });
  } catch {
    return null;
  }
  const members = await pb.collection("league_members").getFullList<MemberRecord & { fantasy_team_id?: string }>({
    filter: `league = '${leagueId}'`,
    requestKey: null,
  });
  const own = members.find((member) => member.user === session.user.id);
  const allowed = isManager({
    actorUserId: session.user.id,
    targetUserId: session.user.id,
    actorIsCommissioner: league.commissioner === session.user.id,
    actorCanManage: Boolean(own?.can_manage),
    leagueStatus: league.status,
  });
  return allowed ? { pb, league, members } : null;
}


export async function linkFantasyLeague(
  _previous: FantasyActionResult,
  formData: FormData,
): Promise<FantasyActionResult> {
  const leagueId = String(formData.get("leagueId") ?? "");
  const fantasyLeagueId = String(formData.get("fantasyLeagueId") ?? "").trim();
  const managed = await managedLeague(leagueId);
  if (!managed) return REFUSED;
  if (managed.league.basketnews_team_id) return { error: "This league follows BasketNews.", done: null };
  if (fantasyLeagueId !== "" && !/^\d{1,24}$/.test(fantasyLeagueId)) {
    return { error: "The league id is the number in the official game's league address.", done: null };
  }

  const token = serverConfig().FANTASY_CHALLENGE_TOKEN;
  if (fantasyLeagueId !== "" && token) {
    try {
      await fetchLeagueRosters(token, fantasyLeagueId);
    } catch (error) {
      console.error(`linkFantasyLeague: ${describeError(error)}`);
      return { error: "The official game would not show that league's rosters. Check the id.", done: null };
    }
  }

  // A new link is read for its game's positions on the worker's next pass (7.2 D).
  await managed.pb.collection("leagues").update(leagueId, { fantasy_league_id: fantasyLeagueId, positions_read_at: "" }, { requestKey: null });
  revalidateLeague();
  return { error: null, done: fantasyLeagueId ? `Linked to official league ${fantasyLeagueId}.` : "Unlinked." };
}

export async function answerFantasyQuestion(
  _previous: FantasyActionResult,
  formData: FormData,
): Promise<FantasyActionResult> {
  const leagueId = String(formData.get("leagueId") ?? "");
  const kind = String(formData.get("kind") ?? "");
  const officialId = String(formData.get("officialId") ?? "").trim();
  const choice = String(formData.get("choice") ?? "").trim();
  const managed = await managedLeague(leagueId);
  if (!managed) return REFUSED;
  if (!officialId || !choice) return { error: "Choose one first.", done: null };

  if (kind === "team") {
    const member = managed.members.find((row) => row.id === choice);
    if (!member) return { error: "That team is not in this league.", done: null };
    for (const other of managed.members) {
      if (other.id !== member.id && other.fantasy_team_id === officialId) {
        await managed.pb.collection("league_members").update(other.id, { fantasy_team_id: "" }, { requestKey: null });
      }
    }
    await managed.pb.collection("league_members").update(member.id, { [managed.league.basketnews_team_id ? "basketnews_team_id" : "fantasy_team_id"]: officialId }, { requestKey: null });
    revalidateLeague();
    return { error: null, done: choice };
  }

  if (kind === "player") {
    try {
      await managed.pb.collection("players").update(choice, { [managed.league.basketnews_team_id ? "basketnews_id" : "fantasy_id"]: officialId }, { requestKey: null });
    } catch (error) {
      console.error(`answerFantasyQuestion: ${describeError(error)}`);
      return { error: "That player is already linked to another official player.", done: null };
    }
    revalidateLeague();
    return { error: null, done: choice };
  }

  return { error: "That question is not one this page asks.", done: null };
}

export async function syncFantasyNow(
  _previous: FantasyActionResult,
  formData: FormData,
): Promise<FantasyActionResult> {
  const leagueId = String(formData.get("leagueId") ?? "");
  const managed = await managedLeague(leagueId);
  if (!managed) return REFUSED;
  if (managed.league.basketnews_team_id) {
    const id = await queueBasketNewsSync(managed.pb, leagueId, new Date());
    revalidateLeague();
    return { error: null, done: id };
  }
  const config = serverConfig();
  if (!config.FANTASY_CHALLENGE_TOKEN) {
    return { error: "No Fantasy Challenge token is set on the server.", done: null };
  }
  if (!managed.league.fantasy_league_id) return { error: "Link the official league first.", done: null };

  try {
    const now = new Date();
    const decision = await decideSync(managed.pb, config.EUROLEAGUE_SEASON, now);
    const run = await runFantasySync({
      pb: managed.pb,
      leagueId,
      token: config.FANTASY_CHALLENGE_TOKEN,
      season: config.EUROLEAGUE_SEASON,
      decision,
      now,
    });
    await syncDueLineups({
      pb: managed.pb,
      leagueId,
      token: config.FANTASY_CHALLENGE_TOKEN,
      season: config.EUROLEAGUE_SEASON,
      now: new Date(),
      force: true,
    });
    revalidateLeague();
    return { error: null, done: run.id };
  } catch (error) {
    console.error(`syncFantasyNow: ${describeError(error)}`);
    return { error: "The sync did not run. Try again in a minute.", done: null };
  }
}
