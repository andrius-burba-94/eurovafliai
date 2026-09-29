/** A free-agent exchange was historically recorded as a drop and an add. */
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
  readonly exchange?: {
    readonly memberId: string;
    readonly acquiredId: string;
    readonly releasedId: string;
  };
};

function solePlayer(raw: unknown, memberId: string): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const entries = Object.entries(raw);
  if (entries.length !== 1 || entries[0]?.[0] !== memberId) return null;
  const ids = entries[0][1];
  return Array.isArray(ids) && ids.length === 1 && typeof ids[0] === "string"
    ? ids[0]
    : null;
}

function emptySide(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  return Object.values(raw).every((value) => Array.isArray(value) && value.length === 0);
}

function exchangeOf<T extends HistoryRow>(rows: readonly T[]): HistoryEvent<T>["exchange"] {
  if (rows.length !== 2) return undefined;
  const add = rows.find((row) => row.type === "add");
  const drop = rows.find((row) => row.type === "drop");
  if (!add || !drop) return undefined;
  const memberId = Array.isArray(add.members) && add.members.length === 1
    ? add.members[0]
    : null;
  if (
    typeof memberId !== "string" ||
    !Array.isArray(drop.members) ||
    drop.members.length !== 1 ||
    drop.members[0] !== memberId ||
    !emptySide(add.players_out) ||
    !emptySide(drop.players_in)
  ) return undefined;
  const acquiredId = solePlayer(add.players_in, memberId);
  const releasedId = solePlayer(drop.players_out, memberId);
  if (!acquiredId || !releasedId || acquiredId === releasedId) return undefined;
  const addTime = Date.parse(add.date ?? "");
  const dropTime = Date.parse(drop.date ?? "");
  if (!Number.isFinite(addTime) || !Number.isFinite(dropTime) || Math.abs(addTime - dropTime) > 120_000) return undefined;
  return { memberId, acquiredId, releasedId };
}

/**
 * Group only an exact, unique pair. Repeated notes, missing dates or a batch of
 * players remain separate records rather than inventing a trade that did not happen.
 * Input is already sorted newest first; the first row fixes the event's position.
 */
export function groupTransactionHistory<T extends HistoryRow>(rows: readonly T[]): HistoryEvent<T>[] {
  const keys = rows.map((row) => {
    const note = row.note?.trim();
    if (!note || (row.type !== "add" && row.type !== "drop")) return null;
    return `${row.from_round}\u0000${note}`;
  });
  const used = new Set<string>();
  const events: HistoryEvent<T>[] = [];
  rows.forEach((row, index) => {
    if (used.has(row.id)) return;
    const key = keys[index];
    const matches = key === null ? [] : rows.filter((candidate, at) => keys[at] === key);
    const exchange = exchangeOf(matches);
    if (exchange) {
      matches.forEach((match) => used.add(match.id));
      events.push({ rows: matches, exchange });
    } else {
      events.push({ rows: [row] });
    }
  });
  return events;
}
