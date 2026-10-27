import type PocketBase from "pocketbase";
import { moveKey, type SyncSeat } from "@/lib/fantasy/plan";
import { slotsFrom } from "@/lib/lineups/store";
import { asPbDate } from "@/lib/memberships/store";
import { recomputeStandings } from "@/lib/stats/standings-store";
import { readBasketNewsTransfers } from "./client";
import { planBasketNewsTransfers } from "./transfers";

/** Historical repair changes source-owned transaction rows only. Create/adopt
 * desired source legs before removing stale snapshot rows; a crash can leave
 * duplicates, which the same reconciliation removes on retry. */
export async function repairBasketNewsMoves(input: {
  pb: PocketBase; leagueId: string; round: number; write: boolean;
  transfers?: typeof readBasketNewsTransfers;
}): Promise<{ status: "verified" | "blocked"; message: string; create: number; remove: number }> {
  const { pb, leagueId, round, write } = input;
  const league = await pb.collection("leagues").getOne<{ season: string; basketnews_league_id?: string }>(leagueId, { requestKey: null });
  if (!league.basketnews_league_id || !Number.isInteger(round) || round < 2) return { status: "blocked", message: "Choose a linked BasketNews league and a round after the draft.", create: 0, remove: 0 };
  const season = `E${league.season.slice(0, 4)}`;
  const [windows, lineups, members, players, events, stored] = await Promise.all([
    pb.collection("roster_memberships").getFullList<{ id: string; member: string; player: string; from_round: number; to_round: number }>({ filter: `league = '${leagueId}'`, requestKey: null }),
    pb.collection("round_lineups").getFullList<{ member: string; slots: unknown }>({ filter: `league = '${leagueId}' && season = '${season}' && round = ${round}`, requestKey: null }),
    pb.collection("league_members").getFullList<{ id: string; basketnews_team_id: string; team_name: string }>({ filter: `league = '${leagueId}'`, requestKey: null }),
    pb.collection("players").getFullList<{ id: string; name: string; basketnews_id: string }>({ fields: "id,name,basketnews_id", requestKey: null }),
    (input.transfers ?? readBasketNewsTransfers)(league.basketnews_league_id, round - 1),
    pb.collection("transactions").getFullList<{ id: string; type: string; members: string[]; players_in: Record<string, string[]>; players_out: Record<string, string[]>; note?: string; source_provider?: string; source_event_id?: string; source_leg?: string }>({ filter: `league = '${leagueId}' && from_round = ${round}`, requestKey: null }),
  ]);
  const target = new Map<string, string[]>();
  for (const lineup of lineups) {
    const slots = slotsFrom(lineup.slots);
    if (slots) target.set(lineup.member, [...new Set([...slots.starters, ...slots.sixth, ...slots.bench, ...slots.inactive])]);
  }
  if (target.size !== members.length || [...target.values()].some((ids) => ids.length !== 13)) return { status: "blocked", message: "The round needs a complete verified lineup for every team before history can be repaired.", create: 0, remove: 0 };
  const seats: SyncSeat[] = windows.filter((row) => row.from_round < round && (!row.to_round || row.to_round >= round));
  const steps = planBasketNewsTransfers({ round, seats, target, events,
    teamName: (id) => members.find((row) => row.id === id)?.team_name ?? id,
    playerName: (id) => players.find((row) => row.id === id)?.name ?? id,
    memberOf: new Map(members.map((row) => [row.basketnews_team_id, row.id])),
    playerOf: new Map(players.filter((row) => row.basketnews_id).map((row) => [row.basketnews_id, row.id])),
  });
  if (!steps) return { status: "blocked", message: "The official transfer log does not replay to the stored round rosters; history was left intact.", create: 0, remove: 0 };
  const sourceRows = stored.filter((row) => row.source_provider === "basketnews" || (!row.source_event_id && row.note?.startsWith(`BasketNews, round ${round}:`)));
  const retained = new Set<string>();
  const creates: typeof steps = [];
  const adoptions: { id: string; source_event_id: string; source_leg: string; note: string }[] = [];
  for (const step of steps) {
    const shape = { type: step.plan.type, members: [...step.plan.members], players_in: step.plan.playersIn, players_out: step.plan.playersOut };
    const exact = sourceRows.find((row) => row.source_event_id === step.provenance!.eventId && row.source_leg === step.provenance!.leg);
    if (exact && moveKey(exact) !== moveKey(shape)) return { status: "blocked", message: "An existing source event differs from its official record; review is required.", create: 0, remove: 0 };
    const match = exact ?? sourceRows.find((row) => !row.source_event_id && !retained.has(row.id) && moveKey(row) === moveKey(shape));
    if (match) {
      retained.add(match.id);
      if (!match.source_event_id) adoptions.push({ id: match.id, source_event_id: step.provenance!.eventId, source_leg: step.provenance!.leg, note: step.note });
    } else creates.push(step);
  }
  const remove = sourceRows.filter((row) => !retained.has(row.id));
  if (write) {
    for (const adoption of adoptions) await pb.collection("transactions").update(adoption.id, { source_provider: "basketnews", source_event_id: adoption.source_event_id, source_leg: adoption.source_leg, note: adoption.note }, { requestKey: null });
    for (const step of creates) await pb.collection("transactions").create({
      league: leagueId, type: step.plan.type, from_round: round, date: asPbDate(new Date()), members: [...step.plan.members],
      players_in: step.plan.playersIn, players_out: step.plan.playersOut, note: step.note,
      source_provider: "basketnews", source_event_id: step.provenance!.eventId, source_leg: step.provenance!.leg,
    }, { requestKey: null });
    for (const row of remove) await pb.collection("transactions").delete(row.id, { requestKey: null });
    await recomputeStandings(pb, season, { leagueId });
  }
  return { status: "verified", message: `${write ? "Reconciled" : "Dry run"}: ${creates.length} source legs to create, ${adoptions.length} to identify, ${remove.length} stale source rows to remove. Roster windows are unchanged.`, create: creates.length, remove: remove.length };
}
