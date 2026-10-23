import { announceAdd, announceDrop, announceTrade } from "@/lib/chat/messages";
import { rostersAgree, type SyncPlanInput, type SyncStep } from "@/lib/fantasy/plan";
import type { BasketNewsTransfer } from "./client";

/** Replay complete source events. A log that cannot explain the target is
 * evidence of missing history, never permission to guess a player's journey. */
export function planBasketNewsTransfers(input: SyncPlanInput & {
  events: readonly BasketNewsTransfer[];
  memberOf: ReadonlyMap<string, string>;
  playerOf: ReadonlyMap<string, string>;
  appliedIds?: ReadonlySet<string>;
}): SyncStep[] | null {
  const owner = new Map(input.seats.map((seat) => [seat.player, seat.member]));
  const steps: SyncStep[] = [];
  const events = input.events.filter((event) => event.status === "accepted" && !input.appliedIds?.has(event.id))
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  if (new Set(events.map((event) => event.id)).size !== events.length) return null;
  for (const event of events) {
    const a = input.memberOf.get(event.offer.fantasyTeamId ?? "");
    const b = event.request.fantasyTeamId ? input.memberOf.get(event.request.fantasyTeamId) : null;
    const sent = event.offer.players.map((entry) => input.playerOf.get(entry.playerId));
    const received = event.request.players.map((entry) => input.playerOf.get(entry.playerId));
    if (!a || (event.request.fantasyTeamId && !b) || a === b || !sent.length || !received.length ||
      sent.some((player) => !player || owner.get(player) !== a) ||
      received.some((player) => !player || (b ? owner.get(player) !== b : owner.has(player))) ||
      new Set([...sent, ...received]).size !== sent.length + received.length) return null;
    const out = sent as string[];
    const into = received as string[];
    for (const player of into) owner.set(player, a);
    for (const player of out) { if (b) owner.set(player, b); else owner.delete(player); }
    const common = { fromRound: input.round, closes: [], opens: [] };
    const wording = `BasketNews, round ${input.round}, transfer ${event.id}`;
    if (b) {
      steps.push({
        provenance: { provider: "basketnews", eventId: event.id, leg: "trade" }, note: wording,
        announcement: announceTrade({ teamA: input.teamName(a), teamB: input.teamName(b), sent: out.map(input.playerName), received: into.map(input.playerName), fromRound: input.round }),
        plan: { ...common, type: "trade", members: [a, b], playersOut: { [a]: out, [b]: into }, playersIn: { [a]: into, [b]: out } },
      });
    } else {
      steps.push({
        provenance: { provider: "basketnews", eventId: event.id, leg: "drop" }, note: wording,
        announcement: announceDrop({ teamName: input.teamName(a), players: out.map(input.playerName), fromRound: input.round }),
        plan: { ...common, type: "drop", members: [a], playersOut: { [a]: out }, playersIn: {} },
      }, {
        provenance: { provider: "basketnews", eventId: event.id, leg: "add" }, note: wording,
        announcement: announceAdd({ teamName: input.teamName(a), players: into.map(input.playerName), fromRound: input.round }),
        plan: { ...common, type: "add", members: [a], playersOut: {}, playersIn: { [a]: into } },
      });
    }
  }
  if (!rostersAgree([...owner].map(([player, member]) => ({ id: player, player, member })), input.target)) return null;
  // Only ownership at the round boundary gets a window. Pass-through players
  // remain in the event rows, without fictitious scoring windows.
  const closes = steps.map(() => [] as { membershipId: string; toRound: number }[]);
  const opens = steps.map(() => [] as { member: string; player: string; fromRound: number; acquired_via: "trade" | "signing" }[]);
  for (const player of new Set([...input.seats.map((seat) => seat.player), ...owner.keys()])) {
    const before = input.seats.find((seat) => seat.player === player);
    const after = owner.get(player);
    if (before?.member === after) continue;
    const closeAt = before ? steps.findIndex((step) => step.plan.playersOut[before.member]?.includes(player)) : -1;
    const openAt = after ? steps.findLastIndex((step) => step.plan.playersIn[after]?.includes(player)) : -1;
    if ((before && closeAt < 0) || (after && openAt < 0) || (before && after && closeAt > openAt)) return null;
    if (before) closes[closeAt]!.push({ membershipId: before.id, toRound: input.round });
    if (after) opens[openAt]!.push({ member: after, player, fromRound: input.round, acquired_via: steps[openAt]!.plan.type === "trade" ? "trade" : "signing" });
  }
  return steps.map((step, index) => ({ ...step, plan: { ...step.plan, closes: closes[index]!, opens: opens[index]! } }));
}
