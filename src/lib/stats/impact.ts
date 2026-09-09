/**
 * What a recorded deal has been worth, from this member's side.
 *
 * Pure: the team page reads transactions and box scores; this subtracts.
 * Scoring starts at `from_round`, not the calendar stamp on the row — box
 * scores have a Euroleague round and no game date (same cut as standings).
 * Missing a line is 0. Every stored phase counts: a trade's impact is from
 * that round onward, not the standings RS filter.
 */

export type ImpactType = "trade" | "add" | "drop";

export type ImpactTransaction = {
  readonly id: string;
  readonly type: ImpactType;
  readonly fromRound: number;
  readonly playersIn: Readonly<Record<string, readonly string[]>>;
  readonly playersOut: Readonly<Record<string, readonly string[]>>;
};

export type ImpactLine = {
  readonly playerId: string;
  readonly round: number;
  readonly fantasyTenths: number;
  readonly pir: number;
};

export type RoundDelta = {
  readonly round: number;
  readonly inTenths: number;
  readonly outTenths: number;
  readonly deltaTenths: number;
  readonly inPir: number;
  readonly outPir: number;
  readonly deltaPir: number;
};

export type MemberImpact = {
  readonly transactionId: string;
  readonly type: ImpactType;
  readonly fromRound: number;
  readonly inIds: readonly string[];
  readonly outIds: readonly string[];
  readonly inTenths: number;
  readonly outTenths: number;
  readonly deltaTenths: number;
  readonly inPir: number;
  readonly outPir: number;
  readonly deltaPir: number;
  readonly byRound: readonly RoundDelta[];
};

function asIds(map: Readonly<Record<string, readonly string[]>>, memberId: string): string[] {
  const raw = map[memberId];
  if (!raw) return [];
  return [...new Set(raw.filter((id) => id.length > 0))];
}

function namesThisMember(
  tx: ImpactTransaction,
  memberId: string,
): { inIds: string[]; outIds: string[] } | null {
  const inIds = asIds(tx.playersIn, memberId);
  const outIds = asIds(tx.playersOut, memberId);
  if (inIds.length === 0 && outIds.length === 0) return null;
  return { inIds, outIds };
}

function sumFor(
  ids: readonly string[],
  lines: readonly ImpactLine[],
  fromRound: number,
): { tenths: number; pir: number; byRound: Map<number, { tenths: number; pir: number }> } {
  const wanted = new Set(ids);
  const byRound = new Map<number, { tenths: number; pir: number }>();
  let tenths = 0;
  let pir = 0;
  for (const line of lines) {
    if (!wanted.has(line.playerId)) continue;
    if (line.round < fromRound) continue;
    tenths += line.fantasyTenths;
    pir += line.pir;
    const slot = byRound.get(line.round) ?? { tenths: 0, pir: 0 };
    slot.tenths += line.fantasyTenths;
    slot.pir += line.pir;
    byRound.set(line.round, slot);
  }
  return { tenths, pir, byRound };
}

export function impactForMember(
  memberId: string,
  transactions: readonly ImpactTransaction[],
  lines: readonly ImpactLine[],
): MemberImpact[] {
  const out: MemberImpact[] = [];
  for (const tx of transactions) {
    const sides = namesThisMember(tx, memberId);
    if (!sides) continue;
    const incoming = sumFor(sides.inIds, lines, tx.fromRound);
    const outgoing = sumFor(sides.outIds, lines, tx.fromRound);
    const rounds = new Set([...incoming.byRound.keys(), ...outgoing.byRound.keys()]);
    const byRound = [...rounds]
      .sort((a, b) => a - b)
      .map((round) => {
        const inn = incoming.byRound.get(round) ?? { tenths: 0, pir: 0 };
        const outg = outgoing.byRound.get(round) ?? { tenths: 0, pir: 0 };
        return {
          round,
          inTenths: inn.tenths,
          outTenths: outg.tenths,
          deltaTenths: inn.tenths - outg.tenths,
          inPir: inn.pir,
          outPir: outg.pir,
          deltaPir: inn.pir - outg.pir,
        };
      });
    out.push({
      transactionId: tx.id,
      type: tx.type,
      fromRound: tx.fromRound,
      inIds: sides.inIds,
      outIds: sides.outIds,
      inTenths: incoming.tenths,
      outTenths: outgoing.tenths,
      deltaTenths: incoming.tenths - outgoing.tenths,
      inPir: incoming.pir,
      outPir: outgoing.pir,
      deltaPir: incoming.pir - outgoing.pir,
      byRound,
    });
  }
  return out.sort((a, b) => {
    if (b.fromRound !== a.fromRound) return b.fromRound - a.fromRound;
    return a.transactionId < b.transactionId ? -1 : 1;
  });
}
