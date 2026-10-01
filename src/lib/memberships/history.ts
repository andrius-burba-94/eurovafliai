/**
 * The official game has no trades, so a roster change arrives as drops and
 * adds: a free-agent swap is one team's drop and add, and a swap between two
 * friends is each team dropping the player the other then adds. History reads
 * them back as the moves people made.
 */
export type HistoryRow = {
  readonly id: string;
  readonly type: string;
  readonly from_round: number;
  readonly members: unknown;
  readonly players_in: unknown;
  readonly players_out: unknown;
  readonly note?: string;
  readonly date?: string;
};

export type HistoryEvent<T extends HistoryRow> = {
  readonly rows: readonly T[];
  /** One team's drops and adds from one sync: released players for signed ones. */
  readonly exchange?: {
    readonly memberId: string;
    readonly acquiredIds: readonly string[];
    readonly releasedIds: readonly string[];
  };
  /** Two teams that each dropped the player the other added, in one round. */
  readonly swap?: {
    readonly a: string;
    readonly b: string;
    /** Players that left `a` for `b`. */
    readonly aSent: readonly string[];
    /** Players that left `b` for `a`. */
    readonly bSent: readonly string[];
  };
};

/** Rows of one sync are written seconds apart; a later change is a new decision. */
const SYNC_WINDOW_MS = 120_000;

type Move = {
  readonly index: number;
  readonly member: string;
  readonly kind: "add" | "drop";
  readonly ids: readonly string[];
  readonly time: number;
};

function idsOf(raw: unknown, memberId: string): string[] | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = (raw as Record<string, unknown>)[memberId];
  if (value === undefined) return [];
  return Array.isArray(value) && value.every((id) => typeof id === "string") ? (value as string[]) : null;
}

function emptyBut(raw: unknown, memberId: string): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  return Object.entries(raw).every(([key, value]) => key === memberId || (Array.isArray(value) && value.length === 0));
}

/**
 * A one-team add or drop that names players on one side only, with a note and
 * a date: what a sync or a hand-recorded free-agent move writes. Anything else
 * is shown as it was recorded.
 */
function moveOf(row: HistoryRow, index: number): Move | null {
  if (row.type !== "add" && row.type !== "drop") return null;
  if (!row.note?.trim()) return null;
  const time = Date.parse(row.date ?? "");
  if (!Number.isFinite(time)) return null;
  if (!Array.isArray(row.members) || row.members.length !== 1 || typeof row.members[0] !== "string") return null;
  const member = row.members[0];
  const filled = row.type === "add" ? row.players_in : row.players_out;
  const blank = row.type === "add" ? row.players_out : row.players_in;
  const ids = idsOf(filled, member);
  const other = idsOf(blank, member);
  if (!ids || ids.length === 0 || !other || other.length > 0) return null;
  if (!emptyBut(filled, member) || !emptyBut(blank, member)) return null;
  return { index, member, kind: row.type, ids, time };
}

const meets = (a: readonly string[], b: readonly string[]) => a.some((id) => b.includes(id));

/**
 * Two teams in one round where each dropped a player the other added. Found
 * before the exchanges, because each team's half also looks like its own
 * free-agent swap.
 */
function swaps(rows: readonly HistoryRow[], moves: readonly (Move | null)[]): { indexes: number[]; swap: NonNullable<HistoryEvent<HistoryRow>["swap"]> }[] {
  const out: { indexes: number[]; swap: NonNullable<HistoryEvent<HistoryRow>["swap"]> }[] = [];
  const taken = new Set<number>();
  const live = moves.filter((move): move is Move => move !== null);
  for (const dropA of live) {
    if (dropA.kind !== "drop" || taken.has(dropA.index)) continue;
    const round = rows[dropA.index]!.from_round;
    const same = (move: Move) => !taken.has(move.index) && rows[move.index]!.from_round === round;
    const addB = live.find((move) => same(move) && move.kind === "add" && move.member !== dropA.member && meets(move.ids, dropA.ids));
    if (!addB) continue;
    const dropB = live.find((move) => same(move) && move.kind === "drop" && move.member === addB.member);
    const addA = dropB && live.find((move) => same(move) && move.kind === "add" && move.member === dropA.member && meets(move.ids, dropB.ids));
    if (!dropB || !addA) continue;
    for (const move of [dropA, addB, dropB, addA]) taken.add(move.index);
    out.push({
      indexes: [dropA.index, addB.index, dropB.index, addA.index],
      swap: {
        a: dropA.member,
        b: addB.member,
        aSent: dropA.ids.filter((id) => addB.ids.includes(id)),
        bSent: dropB.ids.filter((id) => addA.ids.includes(id)),
      },
    });
  }
  return out;
}

/**
 * One team's drops and adds in one round and one sync window, at any count. A
 * group needs both a drop and an add, and never signs a player it releases.
 */
function exchanges(rows: readonly HistoryRow[], moves: readonly (Move | null)[], taken: ReadonlySet<number>): { indexes: number[]; exchange: NonNullable<HistoryEvent<HistoryRow>["exchange"]> }[] {
  const byKey = new Map<string, Move[]>();
  for (const move of moves) {
    if (!move || taken.has(move.index)) continue;
    const key = `${move.member}\u0000${rows[move.index]!.from_round}`;
    byKey.set(key, [...(byKey.get(key) ?? []), move]);
  }
  const out: { indexes: number[]; exchange: NonNullable<HistoryEvent<HistoryRow>["exchange"]> }[] = [];
  for (const group of byKey.values()) {
    const sorted = [...group].sort((a, b) => a.time - b.time);
    const clusters: Move[][] = [];
    for (const move of sorted) {
      const last = clusters.at(-1);
      if (last && move.time - last.at(-1)!.time <= SYNC_WINDOW_MS) last.push(move);
      else clusters.push([move]);
    }
    for (const cluster of clusters) {
      const acquiredIds = [...new Set(cluster.filter((move) => move.kind === "add").flatMap((move) => move.ids))];
      const releasedIds = [...new Set(cluster.filter((move) => move.kind === "drop").flatMap((move) => move.ids))];
      if (acquiredIds.length === 0 || releasedIds.length === 0 || meets(acquiredIds, releasedIds)) continue;
      out.push({ indexes: cluster.map((move) => move.index), exchange: { memberId: cluster[0]!.member, acquiredIds, releasedIds } });
    }
  }
  return out;
}

/**
 * Input is sorted newest first; a group takes the position of its newest row.
 * Rows without a note or a date, or that name players on both sides, stay as
 * they were recorded rather than being read into a deal that may not exist.
 */
export function groupTransactionHistory<T extends HistoryRow>(rows: readonly T[]): HistoryEvent<T>[] {
  const moves = rows.map(moveOf);
  const found = swaps(rows, moves);
  const taken = new Set(found.flatMap((group) => group.indexes));
  const grouped = [
    ...found.map((group) => ({ indexes: group.indexes, event: { swap: group.swap } })),
    ...exchanges(rows, moves, taken).map((group) => ({ indexes: group.indexes, event: { exchange: group.exchange } })),
  ];
  const groupAt = new Map<number, (typeof grouped)[number]>();
  for (const group of grouped) for (const index of group.indexes) groupAt.set(index, group);

  const events: HistoryEvent<T>[] = [];
  const emitted = new Set<(typeof grouped)[number]>();
  rows.forEach((row, index) => {
    const group = groupAt.get(index);
    if (!group) {
      events.push({ rows: [row] });
      return;
    }
    if (emitted.has(group)) return;
    emitted.add(group);
    const indexes = [...group.indexes].sort((a, b) => a - b);
    events.push({ rows: indexes.map((at) => rows[at]!), ...group.event });
  });
  return events;
}
