import { announceAdd, announceDrop, announceExchange, announceTrade } from "@/lib/chat/messages";
import type { ApplyPlan } from "@/lib/memberships/plan";

/**
 * What the official rosters say that ours do not, as transactions.
 *
 * Pure. The official game is the authority, so there is no template check
 * here — its own caps (7 G, 7 F, 5 C of 13) are not ours, and refusing its
 * roster would leave ours wrong. The shape follows the records the league
 * already keeps by hand: a one-for-one free-agent swap is a drop and an add
 * sharing one note (which `groupTransactionHistory` reads as one exchange),
 * a two-way move between members is a trade, and a one-way move is a release
 * by one team and a signing by the other.
 *
 * Steps are ordered **every drop, then every trade, then every add**. An add
 * whose player is still held elsewhere is skipped by `applyTransaction`'s
 * unique-index guard, so a signing must never run before the release that
 * frees its player.
 */

export type SyncSeat = {
  readonly id: string;
  readonly member: string;
  readonly player: string;
};

export type SyncStep = {
  readonly plan: ApplyPlan;
  readonly note: string;
  /** Null for the second half of an exchange, which the first half announced. */
  readonly announcement: string | null;
};

export type SyncPlan = {
  /** One sentence per move, for the report and the preview. */
  readonly moves: readonly string[];
  readonly steps: readonly SyncStep[];
};

export type SyncPlanInput = {
  readonly round: number;
  readonly seats: readonly SyncSeat[];
  /** Every member's full official roster, as our player ids. */
  readonly target: ReadonlyMap<string, readonly string[]>;
  readonly teamName: (memberId: string) => string;
  readonly playerName: (playerId: string) => string;
  readonly source?: string;
};

const NOTE_MAX = 500;

function note(round: number, body: string, source = "Fantasy Challenge"): string {
  const text = `${source}, round ${round}: ${body}`;
  return text.length > NOTE_MAX ? `${text.slice(0, NOTE_MAX - 1)}…` : text;
}

function list(names: readonly string[]): string {
  return names.join(", ");
}

export function planSync(input: SyncPlanInput): SyncPlan {
  const { round, seats, target, teamName, playerName, source } = input;
  for (const seat of seats) {
    if (!target.has(seat.member)) {
      throw new Error(`No official roster for member ${seat.member}; refusing to plan a partial sync.`);
    }
  }

  const seatOf = new Map(seats.map((seat) => [seat.player, seat]));
  const ownerAfter = new Map<string, string>();
  for (const [member, players] of target) {
    for (const player of players) {
      if (ownerAfter.has(player)) throw new Error(`Player ${player} is on two official rosters.`);
      ownerAfter.set(player, member);
    }
  }

  const members = [...target.keys()].sort((a, b) => teamName(a).localeCompare(teamName(b)));
  const outOf = new Map<string, string[]>();
  const into = new Map<string, string[]>();
  for (const member of members) {
    const wanted = new Set(target.get(member));
    const held = seats.filter((seat) => seat.member === member).map((seat) => seat.player);
    outOf.set(member, held.filter((player) => !wanted.has(player)));
    const holding = new Set(held);
    into.set(member, [...wanted].filter((player) => !holding.has(player)));
  }

  const flow = (from: string, to: string) =>
    (outOf.get(from) ?? []).filter((player) => ownerAfter.get(player) === to);

  const drops: SyncStep[] = [];
  const trades: SyncStep[] = [];
  const adds: SyncStep[] = [];
  const moves: string[] = [];
  const traded = new Set<string>();

  for (const [index, a] of members.entries()) {
    for (const b of members.slice(index + 1)) {
      const sent = flow(a, b);
      const received = flow(b, a);
      if (sent.length === 0 || received.length === 0) continue;
      for (const player of [...sent, ...received]) traded.add(player);
      const sentence = announceTrade({
        teamA: teamName(a),
        teamB: teamName(b),
        sent: sent.map(playerName),
        received: received.map(playerName),
        fromRound: round,
      });
      moves.push(sentence);
      trades.push({
        note: note(round, `${teamName(a)} sent ${list(sent.map(playerName))} to ${teamName(b)} for ${list(received.map(playerName))}.`, source),
        announcement: sentence,
        plan: {
          type: "trade",
          fromRound: round,
          members: [a, b],
          playersOut: { [a]: sent, [b]: received },
          playersIn: { [a]: received, [b]: sent },
          closes: [...sent, ...received].map((player) => ({ membershipId: seatOf.get(player)!.id, toRound: round })),
          opens: [
            ...sent.map((player) => ({ member: b, player, fromRound: round, acquired_via: "trade" as const })),
            ...received.map((player) => ({ member: a, player, fromRound: round, acquired_via: "trade" as const })),
          ],
        },
      });
    }
  }

  for (const member of members) {
    const released = (outOf.get(member) ?? []).filter((player) => !traded.has(player));
    const acquired = (into.get(member) ?? []).filter((player) => !traded.has(player));
    if (released.length === 0 && acquired.length === 0) continue;
    const team = teamName(member);
    const parts = [
      released.length > 0 ? `${team} released ${list(released.map(playerName))}` : null,
      acquired.length > 0 ? `${released.length > 0 ? "and acquired" : `${team} acquired`} ${list(acquired.map(playerName))}` : null,
    ].filter(Boolean);
    const shared = note(round, `${parts.join(" ")}.`, source);
    const exchange = released.length === 1 && acquired.length === 1;

    if (exchange) {
      moves.push(
        announceExchange({ teamName: team, released: released.map(playerName), acquired: acquired.map(playerName), fromRound: round }),
      );
    } else {
      if (released.length > 0) moves.push(announceDrop({ teamName: team, players: released.map(playerName), fromRound: round }));
      if (acquired.length > 0) moves.push(announceAdd({ teamName: team, players: acquired.map(playerName), fromRound: round }));
    }

    if (released.length > 0) {
      drops.push({
        note: shared,
        announcement: exchange
          ? announceExchange({ teamName: team, released: released.map(playerName), acquired: acquired.map(playerName), fromRound: round })
          : announceDrop({ teamName: team, players: released.map(playerName), fromRound: round }),
        plan: {
          type: "drop",
          fromRound: round,
          members: [member],
          playersOut: { [member]: released },
          playersIn: {},
          closes: released.map((player) => ({ membershipId: seatOf.get(player)!.id, toRound: round })),
          opens: [],
        },
      });
    }
    if (acquired.length > 0) {
      adds.push({
        note: shared,
        announcement: exchange ? null : announceAdd({ teamName: team, players: acquired.map(playerName), fromRound: round }),
        plan: {
          type: "add",
          fromRound: round,
          members: [member],
          playersOut: {},
          playersIn: { [member]: acquired },
          closes: [],
          opens: acquired.map((player) => ({ member, player, fromRound: round, acquired_via: "signing" as const })),
        },
      });
    }
  }

  return { moves, steps: [...drops, ...trades, ...adds] };
}

/** Does the league's roster now read exactly as the official one? */
export function rostersAgree(
  seats: readonly SyncSeat[],
  target: ReadonlyMap<string, readonly string[]>,
): boolean {
  const held = new Map<string, Set<string>>();
  for (const seat of seats) {
    const set = held.get(seat.member) ?? new Set<string>();
    set.add(seat.player);
    held.set(seat.member, set);
  }
  for (const [member, players] of target) {
    const have = held.get(member) ?? new Set<string>();
    if (have.size !== players.length || players.some((player) => !have.has(player))) return false;
  }
  return [...held.keys()].every((member) => target.has(member));
}
