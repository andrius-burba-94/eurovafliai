/**
 * May this trade, add or drop be recorded?
 *
 * Pure: the store writes PocketBase; this decides. Roster shape comes from
 * the engine's `countByPosition` / `rosterSize` — the same template the draft
 * used — but the rules live here, not in the engine. The engine is draft-only.
 */

import {
  countByPosition,
  rosterSize,
  type Position,
  type RosterTemplate,
} from "@/lib/engine";

export type Seat = {
  readonly id: string;
  readonly member: string;
  readonly player: string;
  readonly position: Position;
};

export type TransactionType = "trade" | "add" | "drop";

export type ProposedTrade = {
  readonly type: "trade";
  readonly fromRound: number;
  readonly memberA: string;
  readonly memberB: string;
  readonly outA: readonly string[];
  readonly outB: readonly string[];
};

export type ProposedDrop = {
  readonly type: "drop";
  readonly fromRound: number;
  readonly member: string;
  readonly playerIds: readonly string[];
};

export type ProposedAdd = {
  readonly type: "add";
  readonly fromRound: number;
  readonly member: string;
  readonly players: readonly { id: string; position: Position }[];
};

export type Proposal = ProposedTrade | ProposedDrop | ProposedAdd;

export type CloseStep = {
  readonly membershipId: string;
  readonly toRound: number;
};

export type OpenStep = {
  readonly member: string;
  readonly player: string;
  readonly fromRound: number;
  readonly acquired_via: "trade" | "signing";
};

export type ApplyPlan = {
  readonly type: TransactionType;
  readonly fromRound: number;
  readonly members: readonly string[];
  readonly playersIn: Readonly<Record<string, readonly string[]>>;
  readonly playersOut: Readonly<Record<string, readonly string[]>>;
  readonly closes: readonly CloseStep[];
  readonly opens: readonly OpenStep[];
};

export type PlanVerdict =
  | { readonly ok: true; readonly plan: ApplyPlan }
  | { readonly ok: false; readonly reason: string };

function roundOk(fromRound: number): string | null {
  if (!Number.isInteger(fromRound) || fromRound < 1) {
    return "Name the first Euroleague round the new roster counts from, starting at 1.";
  }
  return null;
}

function uniqueIds(ids: readonly string[]): boolean {
  return new Set(ids).size === ids.length;
}

function rosterOf(seats: readonly Seat[], member: string): Seat[] {
  return seats.filter((seat) => seat.member === member);
}

function byPlayer(seats: readonly Seat[]): Map<string, Seat> {
  return new Map(seats.map((seat) => [seat.player, seat]));
}

function fitsTemplate(
  positions: readonly Pick<{ position: Position }, "position">[],
  template: RosterTemplate,
  exact: boolean,
): boolean {
  const counts = countByPosition(positions);
  if (counts.G > template.G || counts.F > template.F || counts.C > template.C) {
    return false;
  }
  if (!exact) return true;
  return positions.length === rosterSize(template);
}

export function planTransaction(
  seats: readonly Seat[],
  template: RosterTemplate,
  ownedPlayerIds: ReadonlySet<string>,
  proposal: Proposal,
): PlanVerdict {
  const badRound = roundOk(proposal.fromRound);
  if (badRound) return { ok: false, reason: badRound };

  if (proposal.type === "trade") return planTrade(seats, template, proposal);
  if (proposal.type === "drop") return planDrop(seats, proposal);
  return planAdd(seats, template, ownedPlayerIds, proposal);
}

function planTrade(
  seats: readonly Seat[],
  template: RosterTemplate,
  proposal: ProposedTrade,
): PlanVerdict {
  const { memberA, memberB, outA, outB, fromRound } = proposal;
  if (!memberA || !memberB || memberA === memberB) {
    return { ok: false, reason: "A trade is between two different members." };
  }
  if (outA.length === 0 && outB.length === 0) {
    return { ok: false, reason: "Pick at least one player on each side." };
  }
  if (outA.length !== outB.length) {
    return {
      ok: false,
      reason: "Trades move the same number of players each way, so both rosters stay full.",
    };
  }
  if (outA.length === 0) {
    return { ok: false, reason: "Pick at least one player on each side." };
  }
  if (!uniqueIds(outA) || !uniqueIds(outB)) {
    return { ok: false, reason: "The same player cannot be named twice in one trade." };
  }
  if (outA.some((id) => outB.includes(id))) {
    return { ok: false, reason: "A player cannot travel both ways in the same trade." };
  }

  const index = byPlayer(seats);
  const checkOwned = (
    ids: readonly string[],
    member: string,
    label: string,
  ): string | null => {
    for (const id of ids) {
      const seat = index.get(id);
      if (!seat || seat.member !== member) {
        return `${label} does not hold one of those players.`;
      }
    }
    return null;
  };
  const aWrong = checkOwned(outA, memberA, "The first team");
  if (aWrong) return { ok: false, reason: aWrong };
  const bWrong = checkOwned(outB, memberB, "The other team");
  if (bWrong) return { ok: false, reason: bWrong };

  const nextOf = (member: string, leaving: readonly string[], arriving: readonly string[]) => {
    const kept = rosterOf(seats, member).filter((seat) => !leaving.includes(seat.player));
    const added = arriving.map((id) => index.get(id)!);
    return [...kept, ...added];
  };
  const nextA = nextOf(memberA, outA, outB);
  const nextB = nextOf(memberB, outB, outA);
  if (!fitsTemplate(nextA, template, true) || !fitsTemplate(nextB, template, true)) {
    return {
      ok: false,
      reason: "That swap would leave a roster over a position cap, or short of the template.",
    };
  }

  const closes: CloseStep[] = [];
  for (const id of [...outA, ...outB]) {
    const seat = index.get(id)!;
    closes.push({ membershipId: seat.id, toRound: fromRound });
  }
  const opens: OpenStep[] = [
    ...outA.map((player) => ({
      member: memberB,
      player,
      fromRound,
      acquired_via: "trade" as const,
    })),
    ...outB.map((player) => ({
      member: memberA,
      player,
      fromRound,
      acquired_via: "trade" as const,
    })),
  ];

  return {
    ok: true,
    plan: {
      type: "trade",
      fromRound,
      members: [memberA, memberB],
      playersOut: { [memberA]: outA, [memberB]: outB },
      playersIn: { [memberA]: outB, [memberB]: outA },
      closes,
      opens,
    },
  };
}

function planDrop(seats: readonly Seat[], proposal: ProposedDrop): PlanVerdict {
  const { member, playerIds, fromRound } = proposal;
  if (playerIds.length === 0) {
    return { ok: false, reason: "Pick a player to drop." };
  }
  if (!uniqueIds(playerIds)) {
    return { ok: false, reason: "The same player cannot be dropped twice." };
  }
  const index = byPlayer(seats);
  for (const id of playerIds) {
    const seat = index.get(id);
    if (!seat || seat.member !== member) {
      return { ok: false, reason: "That player is not on this roster." };
    }
  }
  return {
    ok: true,
    plan: {
      type: "drop",
      fromRound,
      members: [member],
      playersOut: { [member]: playerIds },
      playersIn: {},
      closes: playerIds.map((id) => ({
        membershipId: index.get(id)!.id,
        toRound: fromRound,
      })),
      opens: [],
    },
  };
}

function planAdd(
  seats: readonly Seat[],
  template: RosterTemplate,
  ownedPlayerIds: ReadonlySet<string>,
  proposal: ProposedAdd,
): PlanVerdict {
  const { member, players, fromRound } = proposal;
  if (players.length === 0) {
    return { ok: false, reason: "Pick a free agent to sign." };
  }
  const ids = players.map((player) => player.id);
  if (!uniqueIds(ids)) {
    return { ok: false, reason: "The same player cannot be signed twice." };
  }
  for (const player of players) {
    if (ownedPlayerIds.has(player.id)) {
      return { ok: false, reason: "That player already has a roster in this league." };
    }
  }
  const next = [
    ...rosterOf(seats, member),
    ...players.map((player) => ({
      id: player.id,
      member,
      player: player.id,
      position: player.position,
    })),
  ];
  if (!fitsTemplate(next, template, false) || next.length > rosterSize(template)) {
    return {
      ok: false,
      reason: "There is no room on that roster for those positions.",
    };
  }
  return {
    ok: true,
    plan: {
      type: "add",
      fromRound,
      members: [member],
      playersOut: {},
      playersIn: { [member]: ids },
      closes: [],
      opens: players.map((player) => ({
        member,
        player: player.id,
        fromRound,
        acquired_via: "signing" as const,
      })),
    },
  };
}
