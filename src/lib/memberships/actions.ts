"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth/session";
import {
  announceAdd,
  announceDrop,
  announceTrade,
} from "@/lib/chat/messages";
import { serverConfig } from "@/lib/config/server";
import type { Position } from "@/lib/engine";
import { isManager } from "@/lib/leagues/lobby";
import { parseLeagueSettings } from "@/lib/leagues/settings";
import type { LeagueRecord, MemberRecord } from "@/lib/leagues/types";
import { getSuperuserClient } from "@/lib/pb/superuser";
import { recomputeStandings } from "@/lib/stats/standings-store";

import { planTransaction, type Proposal, type Seat } from "./plan";
import { applyTransaction, listActiveMemberships } from "./store";

/**
 * Record a trade, add or drop.
 *
 * Friends negotiate out loud. This writes the result: validate, then the
 * `transactions` row, then close and open membership windows, then announce.
 * PocketBase has no transactions; the intent row is the repair key. See
 * `applyTransaction`.
 *
 * ## Failure-recovery story
 *
 * 1. Insert `transactions` first (or find the matching row on retry).
 * 2. Close still-open outgoing windows.
 * 3. Open incoming windows; unique active `(league, player)` refuses a double.
 * 4. `announce()` last and never throws.
 * 5. Recompute standings so round windows show up without waiting for ingest.
 *
 * A crash after (1) retries 2–3 against the stored row. A crash before (1)
 * is a resubmit; validation still sees open windows.
 */

export type TransactionResult = { error: string | null };

const POSITIONS = new Set<Position>(["G", "F", "C"]);

function csvIds(formData: FormData, name: string): string[] {
  return String(formData.get(name) ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function teamLabel(member: MemberRecord): string {
  const named = member.team_name.trim();
  if (named) return named;
  return member.expand?.user?.name || "Unknown";
}

async function seasonsForLeague(
  pb: Awaited<ReturnType<typeof getSuperuserClient>>,
  leagueId: string,
): Promise<string[]> {
  const memberships = await pb.collection("roster_memberships").getFullList<{
    player: string;
  }>({
    filter: `league = '${leagueId}'`,
    fields: "player",
    requestKey: null,
  });
  const seasons = new Set<string>([serverConfig().EUROLEAGUE_SEASON]);
  const ids = [...new Set(memberships.map((row) => row.player))];
  if (ids.length === 0) return [...seasons];
  const filter = ids.map((id) => `player = '${id}'`).join(" || ");
  const lines = await pb.collection("player_game_stats").getFullList<{
    season: string;
  }>({
    filter,
    fields: "season",
    requestKey: null,
  });
  for (const line of lines) seasons.add(line.season);
  return [...seasons];
}

export async function recordTransaction(
  _previous: TransactionResult,
  formData: FormData,
): Promise<TransactionResult> {
  const session = await requireSession();
  const leagueId = String(formData.get("leagueId") ?? "");
  if (!leagueId) return { error: "That league is not here." };

  const pb = await getSuperuserClient();
  let league: LeagueRecord;
  try {
    league = await pb
      .collection("leagues")
      .getOne<LeagueRecord>(leagueId, { requestKey: null });
  } catch {
    return { error: "That league is not here." };
  }

  const members = await pb.collection("league_members").getFullList<MemberRecord>(
    {
      filter: `league = '${leagueId}'`,
      expand: "user",
      requestKey: null,
    },
  );
  const own = members.find((member) => member.user === session.user.id);
  const actorIsCommissioner = league.commissioner === session.user.id;
  if (!own && !actorIsCommissioner) {
    return { error: "That is not yours to record." };
  }
  if (
    !isManager({
      actorUserId: session.user.id,
      targetUserId: session.user.id,
      actorIsCommissioner,
      actorCanManage: Boolean(own?.can_manage),
      leagueStatus: league.status,
    })
  ) {
    return {
      error:
        "Only the commissioner, or someone they trust with it, can record a transaction.",
    };
  }
  if (league.status !== "season") {
    return { error: "Transactions wait until the draft is complete." };
  }

  const typeRaw = String(formData.get("type") ?? "");
  const fromRound = Number.parseInt(String(formData.get("from_round") ?? ""), 10);
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);

  const seatsRaw = await listActiveMemberships<{
    id: string;
    member: string;
    player: string;
    expand?: { player?: { id: string; name: string; position: Position } };
  }>(pb, leagueId, { expand: "player" });
  const seats: Seat[] = seatsRaw.flatMap((row) => {
    const player = row.expand?.player;
    if (!player) return [];
    return [
      {
        id: row.id,
        member: row.member,
        player: player.id,
        position: player.position,
      },
    ];
  });
  const owned = new Set(seats.map((seat) => seat.player));
  const namesByPlayer = new Map(
    seatsRaw.flatMap((row) => {
      const player = row.expand?.player;
      return player ? [[player.id, player.name] as const] : [];
    }),
  );
  const memberById = new Map(members.map((member) => [member.id, member]));

  let proposal: Proposal;
  if (typeRaw === "trade") {
    proposal = {
      type: "trade",
      fromRound,
      memberA: String(formData.get("member_a") ?? ""),
      memberB: String(formData.get("member_b") ?? ""),
      outA: csvIds(formData, "out_a"),
      outB: csvIds(formData, "out_b"),
    };
  } else if (typeRaw === "drop") {
    proposal = {
      type: "drop",
      fromRound,
      member: String(formData.get("member") ?? ""),
      playerIds: csvIds(formData, "player_ids"),
    };
  } else if (typeRaw === "add") {
    const ids = csvIds(formData, "player_ids");
    const fetched = await Promise.all(
      ids.map(async (id) => {
        try {
          return await pb.collection("players").getOne<{
            id: string;
            name: string;
            position: string;
          }>(id, { fields: "id,name,position", requestKey: null });
        } catch {
          return null;
        }
      }),
    );
    const players = [];
    for (const row of fetched) {
      if (!row || !POSITIONS.has(row.position as Position)) {
        return { error: "One of those players is not in the pool." };
      }
      players.push({ id: row.id, position: row.position as Position });
      namesByPlayer.set(row.id, row.name);
    }
    proposal = {
      type: "add",
      fromRound,
      member: String(formData.get("member") ?? ""),
      players,
    };
  } else {
    return { error: "Say whether this is a trade, an add or a drop." };
  }

  const settings = parseLeagueSettings(league.settings);
  const verdict = planTransaction(
    seats,
    settings.roster_template,
    owned,
    proposal,
  );
  if (!verdict.ok) return { error: verdict.reason };

  const playerNames = (ids: readonly string[]) =>
    ids.map((id) => namesByPlayer.get(id) ?? id);
  let announcement: string;
  if (proposal.type === "trade") {
    const teamA = memberById.get(proposal.memberA);
    const teamB = memberById.get(proposal.memberB);
    if (!teamA || !teamB) {
      return { error: "A trade is between two different members." };
    }
    announcement = announceTrade({
      teamA: teamLabel(teamA),
      teamB: teamLabel(teamB),
      sent: playerNames(proposal.outA),
      received: playerNames(proposal.outB),
      fromRound: proposal.fromRound,
    });
  } else if (proposal.type === "drop") {
    const team = memberById.get(proposal.member);
    if (!team) return { error: "That player is not on this roster." };
    announcement = announceDrop({
      teamName: teamLabel(team),
      players: playerNames(proposal.playerIds),
      fromRound: proposal.fromRound,
    });
  } else {
    const team = memberById.get(proposal.member);
    if (!team) return { error: "There is no room on that roster for those positions." };
    announcement = announceAdd({
      teamName: teamLabel(team),
      players: playerNames(proposal.players.map((player) => player.id)),
      fromRound: proposal.fromRound,
    });
  }

  await applyTransaction(
    pb,
    leagueId,
    verdict.plan,
    new Date(),
    announcement,
    note,
  );

  for (const season of await seasonsForLeague(pb, leagueId)) {
    await recomputeStandings(pb, season);
  }

  revalidatePath(`/leagues/${leagueId}`);
  revalidatePath(`/leagues/${leagueId}/standings`);
  revalidatePath(`/leagues/${leagueId}/transactions/new`);
  for (const memberId of verdict.plan.members) {
    revalidatePath(`/leagues/${leagueId}/teams/${memberId}`);
  }

  redirect(`/leagues/${leagueId}`);
}
