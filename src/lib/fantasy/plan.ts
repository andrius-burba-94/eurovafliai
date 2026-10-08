import { announceAdd, announceDrop, announceExchange, announceTrade } from "@/lib/chat/messages";
import type { ApplyPlan, CloseStep, OpenStep } from "@/lib/memberships/plan";

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

type Wording = Pick<SyncPlanInput, "round" | "teamName" | "playerName" | "source">;

function ownership(seats: readonly SyncSeat[], target: ReadonlyMap<string, readonly string[]>): Map<string, string> {
  for (const seat of seats) {
    if (!target.has(seat.member)) {
      throw new Error(`No official roster for member ${seat.member}; refusing to plan a partial sync.`);
    }
  }
  const ownerAfter = new Map<string, string>();
  for (const [member, players] of target) {
    for (const player of players) {
      if (ownerAfter.has(player)) throw new Error(`Player ${player} is on two official rosters.`);
      ownerAfter.set(player, member);
    }
  }
  return ownerAfter;
}

function tradeStep(
  wording: Wording,
  trade: { a: string; b: string; sent: readonly string[]; received: readonly string[] },
  closes: readonly CloseStep[],
  opens: readonly OpenStep[],
): SyncStep {
  const { round, teamName, playerName, source } = wording;
  const { a, b, sent, received } = trade;
  return {
    note: note(round, `${teamName(a)} sent ${list(sent.map(playerName))} to ${teamName(b)} for ${list(received.map(playerName))}.`, source),
    announcement: announceTrade({ teamA: teamName(a), teamB: teamName(b), sent: sent.map(playerName), received: received.map(playerName), fromRound: round }),
    plan: {
      type: "trade",
      fromRound: round,
      members: [a, b],
      playersOut: { [a]: sent, [b]: received },
      playersIn: { [a]: received, [b]: sent },
      closes,
      opens,
    },
  };
}

/**
 * One team's dealings with free agency: a release and a signing sharing one
 * note, which `groupTransactionHistory` reads back as one exchange.
 */
function freeAgencySteps(
  wording: Wording,
  move: { member: string; released: readonly string[]; acquired: readonly string[] },
  ops: { closes: readonly CloseStep[]; opens: readonly OpenStep[] },
): { moves: string[]; drop: SyncStep | null; add: SyncStep | null } {
  const { round, teamName, playerName, source } = wording;
  const { member, released, acquired } = move;
  const team = teamName(member);
  const parts = [
    released.length > 0 ? `${team} released ${list(released.map(playerName))}` : null,
    acquired.length > 0 ? `${released.length > 0 ? "and acquired" : `${team} acquired`} ${list(acquired.map(playerName))}` : null,
  ].filter(Boolean);
  const shared = note(round, `${parts.join(" ")}.`, source);
  const exchange = released.length === 1 && acquired.length === 1;
  const exchanged = () => announceExchange({ teamName: team, released: released.map(playerName), acquired: acquired.map(playerName), fromRound: round });
  const dropped = () => announceDrop({ teamName: team, players: released.map(playerName), fromRound: round });
  const added = () => announceAdd({ teamName: team, players: acquired.map(playerName), fromRound: round });

  const moves = exchange
    ? [exchanged()]
    : [...(released.length > 0 ? [dropped()] : []), ...(acquired.length > 0 ? [added()] : [])];
  const drop: SyncStep | null =
    released.length > 0
      ? {
          note: shared,
          announcement: exchange ? exchanged() : dropped(),
          plan: { type: "drop", fromRound: round, members: [member], playersOut: { [member]: released }, playersIn: {}, closes: ops.closes, opens: [] },
        }
      : null;
  const add: SyncStep | null =
    acquired.length > 0
      ? {
          note: shared,
          announcement: exchange ? null : added(),
          plan: { type: "add", fromRound: round, members: [member], playersOut: {}, playersIn: { [member]: acquired }, closes: [], opens: ops.opens },
        }
      : null;
  return { moves, drop, add };
}

export function planSync(input: SyncPlanInput): SyncPlan {
  const { round, seats, target, teamName } = input;
  const ownerAfter = ownership(seats, target);
  const seatOf = new Map(seats.map((seat) => [seat.player, seat]));

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
      const step = tradeStep(
        input,
        { a, b, sent, received },
        [...sent, ...received].map((player) => ({ membershipId: seatOf.get(player)!.id, toRound: round })),
        [
          ...sent.map((player) => ({ member: b, player, fromRound: round, acquired_via: "trade" as const })),
          ...received.map((player) => ({ member: a, player, fromRound: round, acquired_via: "trade" as const })),
        ],
      );
      moves.push(step.announcement!);
      trades.push(step);
    }
  }

  for (const member of members) {
    const released = (outOf.get(member) ?? []).filter((player) => !traded.has(player));
    const acquired = (into.get(member) ?? []).filter((player) => !traded.has(player));
    if (released.length === 0 && acquired.length === 0) continue;
    const result = freeAgencySteps(input, { member, released, acquired }, {
      closes: released.map((player) => ({ membershipId: seatOf.get(player)!.id, toRound: round })),
      opens: acquired.map((player) => ({ member, player, fromRound: round, acquired_via: "signing" as const })),
    });
    moves.push(...result.moves);
    if (result.drop) drops.push(result.drop);
    if (result.add) adds.push(result.add);
  }

  return { moves, steps: [...drops, ...trades, ...adds] };
}

/** One move from the official log, in our ids. */
export type LoggedMove = {
  /** The log's own order: the official ids rise as moves are made. */
  readonly order: number;
  /** The team the arriving player joined. */
  readonly member: string;
  readonly arrival: string;
  readonly departure: string;
  /** Where the departing player went: the other team in a trade, null for free agency. */
  readonly departureTo: string | null;
};

/**
 * The official move log replayed over the league's rosters, so each move is
 * recorded as the people made it. A roster difference cannot see a player who
 * passed through a team between two passes: traded to it and released by it,
 * he never sat on its roster in either snapshot, and the difference blames the
 * team that traded him. The log names both.
 *
 * Returns null whenever the log does not explain the difference — a move that
 * neither applies nor was applied by an earlier pass, rosters that do not end
 * where the official ones are, or windows that cannot be ordered. The caller
 * then plans from the difference and says so.
 *
 * A player who passes through a team is in that team's rows (in by the trade,
 * out by the release) but gets no roster window: his old window closes, and a
 * new one opens only where he ends up. Every close is on the first step that
 * sends him out of that window's team and every open on the last that brings
 * him in; steps run
 * releases, then trades in log order, then signings, so the windows of one
 * player never overlap.
 */
export function planFromLog(input: SyncPlanInput & { readonly log: readonly LoggedMove[] }): SyncPlan | null {
  const { round, seats, target, teamName, log } = input;
  const ownerAfter = ownership(seats, target);
  const seatOf = new Map(seats.map((seat) => [seat.player, seat]));

  const owner = new Map(seats.map((seat) => [seat.player, seat.member]));
  const applied: LoggedMove[] = [];
  for (const move of [...log].sort((a, b) => a.order - b.order)) {
    const from = move.departureTo;
    const ready =
      move.member !== from &&
      owner.get(move.departure) === move.member &&
      (from === null ? !owner.has(move.arrival) : owner.get(move.arrival) === from);
    if (ready) {
      owner.set(move.arrival, move.member);
      if (from === null) owner.delete(move.departure);
      else owner.set(move.departure, from);
      applied.push(move);
      continue;
    }
    const earlier = owner.get(move.arrival) === move.member && owner.get(move.departure) !== move.member;
    if (!earlier) return null;
  }
  if (owner.size !== ownerAfter.size || [...ownerAfter].some(([player, member]) => owner.get(player) !== member)) return null;

  const byName = (a: string, b: string) => teamName(a).localeCompare(teamName(b));
  const trades = new Map<string, { a: string; b: string; sent: string[]; received: string[] }>();
  const free = new Map<string, { released: string[]; acquired: string[] }>();
  for (const move of applied) {
    if (move.departureTo === null) {
      const entry = free.get(move.member) ?? { released: [], acquired: [] };
      entry.released.push(move.departure);
      entry.acquired.push(move.arrival);
      free.set(move.member, entry);
      continue;
    }
    const [a, b] = [move.member, move.departureTo].sort(byName) as [string, string];
    const entry = trades.get(`${a}|${b}`) ?? { a, b, sent: [], received: [] };
    const fromA = move.member === a ? move.departure : move.arrival;
    const fromB = move.member === a ? move.arrival : move.departure;
    entry.sent.push(fromA);
    entry.received.push(fromB);
    trades.set(`${a}|${b}`, entry);
  }

  const freeMembers = [...free.keys()].sort(byName);
  type Draft = {
    readonly kind: "drop" | "trade" | "add";
    readonly outs: ReadonlyMap<string, readonly string[]>;
    readonly ins: ReadonlyMap<string, readonly string[]>;
  };
  const drafts: Draft[] = [
    ...freeMembers.map((member): Draft => ({ kind: "drop", outs: new Map([[member, free.get(member)!.released]]), ins: new Map() })),
    ...[...trades.values()].map((trade): Draft => ({
      kind: "trade",
      outs: new Map([[trade.a, trade.sent], [trade.b, trade.received]]),
      ins: new Map([[trade.a, trade.received], [trade.b, trade.sent]]),
    })),
    ...freeMembers.map((member): Draft => ({ kind: "add", outs: new Map(), ins: new Map([[member, free.get(member)!.acquired]]) })),
  ];
  const closes = drafts.map((): CloseStep[] => []);
  const opens = drafts.map((): OpenStep[] => []);
  const touched = new Set(applied.flatMap((move) => [move.arrival, move.departure]));
  for (const player of touched) {
    const seat = seatOf.get(player);
    const final = owner.get(player);
    if (seat?.member === final) continue;
    let closeAt = -1;
    if (seat) {
      closeAt = drafts.findIndex((draft) => draft.outs.get(seat.member)?.includes(player));
      if (closeAt < 0) return null;
      closes[closeAt]!.push({ membershipId: seat.id, toRound: round });
    }
    if (final) {
      const openAt = drafts.findLastIndex((draft) => draft.ins.get(final)?.includes(player));
      if (openAt < 0 || openAt < closeAt) return null;
      opens[openAt]!.push({ member: final, player, fromRound: round, acquired_via: drafts[openAt]!.kind === "trade" ? "trade" : "signing" });
    }
  }

  const moves: string[] = [];
  const drops: SyncStep[] = [];
  const adds: SyncStep[] = [];
  const tradeSteps = [...trades.values()].map((trade, index) => {
    const at = freeMembers.length + index;
    const step = tradeStep(input, trade, closes[at]!, opens[at]!);
    moves.push(step.announcement!);
    return step;
  });
  for (const [index, member] of freeMembers.entries()) {
    const entry = free.get(member)!;
    const result = freeAgencySteps(input, { member, ...entry }, {
      closes: closes[index]!,
      opens: opens[freeMembers.length + trades.size + index]!,
    });
    moves.push(...result.moves);
    if (result.drop) drops.push(result.drop);
    if (result.add) adds.push(result.add);
  }
  return { moves, steps: [...drops, ...tradeSteps, ...adds] };
}

/** A transaction row as the repair compares it: who, which way, which players. */
export type MoveRow = {
  readonly type: string;
  readonly members: unknown;
  readonly players_in: unknown;
  readonly players_out: unknown;
};

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, inner]) => !(Array.isArray(inner) && inner.length === 0))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, inner]) => [key, canonical(inner)]),
    );
  }
  return value;
}

/** Two rows recording the same move compare equal, whatever order they list it in. */
export function moveKey(row: MoveRow): string {
  return JSON.stringify(canonical([row.type, row.members, row.players_in, row.players_out]));
}

/**
 * What a round's stored rows need to become the planned ones: the planned rows
 * not yet stored, and the stored rows nothing planned, a duplicate included.
 * Rows already right stay.
 */
export function reconcileMoves<S extends MoveRow, P extends MoveRow>(
  stored: readonly S[],
  planned: readonly P[],
): { create: P[]; remove: S[] } {
  const wanted = new Map<string, number>();
  for (const row of planned) wanted.set(moveKey(row), (wanted.get(moveKey(row)) ?? 0) + 1);
  const remove: S[] = [];
  for (const row of stored) {
    const left = wanted.get(moveKey(row)) ?? 0;
    if (left > 0) wanted.set(moveKey(row), left - 1);
    else remove.push(row);
  }
  const create = planned.filter((row) => {
    const left = wanted.get(moveKey(row)) ?? 0;
    if (left === 0) return false;
    wanted.set(moveKey(row), left - 1);
    return true;
  });
  return { create, remove };
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
