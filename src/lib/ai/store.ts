import type PocketBase from "pocketbase";

import { isUniqueViolation } from "@/lib/drafts/unique";

import type { BriefLines } from "./briefs";
import type { GeminiUsage } from "./gemini";
import type { TokenRef } from "./tokens";
import type { RoundWriteup, Voice } from "./voice";

/**
 * `ai_writeups`: claim, finish, fail, read — slice 7.0.
 *
 * Two writes with a model call between them, and no transactions, so the row
 * itself is the lock and its `status` the repair key:
 *
 * 1. **Claim** — create the row `pending`, or move an existing one to
 *    `pending` with the new input hash. The previous prose is kept, so a
 *    reader still has the last good write-up while a new one is written.
 * 2. **Call the model** — no database writes.
 * 3. **Finish** — one update to `ready` (prose, refs, usage) or `failed`.
 *
 * A crash between 1 and 3 leaves `pending`; once it is older than
 * `STALE_AFTER_MS` the next run takes it over, and `releaseStaleClaims` puts
 * back any that no pass would claim again. Two runs at once share one row
 * because of the unique index, so the worst case is one duplicate model call.
 * Three failures on the same input stop asking: a free quota is not a thing
 * to burn on a sheet the model cannot write.
 */

export type WriteupKind = "round_summary" | "scout_moves" | "round_brief";

export type WriteupKey = {
  readonly leagueId: string;
  readonly season: string;
  readonly round: number;
  readonly kind: WriteupKind;
  /** Empty for a league-wide write-up. */
  readonly memberId: string;
};

export type WriteupRecord = {
  readonly id: string;
  readonly status: "pending" | "ready" | "failed";
  readonly voice: Voice;
  readonly model: string;
  readonly prompt_version: string;
  readonly input_hash: string;
  /** A `RoundWriteup` from 7.1; 7.0's preview rows hold `{ lines }` only. */
  readonly output?: { headline?: unknown; lines?: unknown; sections?: unknown } | null;
  readonly refs?: Record<string, TokenRef> | null;
  readonly error?: string;
  readonly attempts?: number;
  readonly claimed_at?: string;
  readonly generated_at?: string;
  /** 7.1: the commissioner asked for a rewrite; cleared when the rewrite finishes or fails. */
  readonly rewrite_requested_at?: string;
  /** 7.1: when the stored prose last passed a re-guard (ADR-0013). */
  readonly last_guarded_at?: string;
};

export type Claim =
  | {
      readonly outcome: "claimed";
      readonly id: string;
      /** The row's status before this claim, null for a new row: what `abandonClaim` puts back. */
      readonly previous: WriteupRecord["status"] | null;
      /** Attempts on this input, this claim's included. */
      readonly attempts: number;
    }
  | { readonly outcome: "unchanged" | "busy" | "exhausted"; readonly id: string };

export const STALE_AFTER_MS = 10 * 60_000;
export const MAX_ATTEMPTS = 3;
const ERROR_LIMIT = 500;

const ID = /^[A-Za-z0-9]*$/;

function filterFor(key: WriteupKey): string {
  if (!ID.test(key.leagueId) || !ID.test(key.memberId) || !/^E\d{4}$/.test(key.season) || !Number.isInteger(key.round)) {
    throw new Error("ai_writeups: refusing a malformed key");
  }
  return `league = '${key.leagueId}' && season = "${key.season}" && round = ${key.round} && kind = '${key.kind}' && member = '${key.memberId}'`;
}

const stamp = (now: number) => new Date(now).toISOString().replace("T", " ");

/** A PocketBase date back to epoch ms; NaN when unset. */
export const instant = (value: string | undefined) => Date.parse((value ?? "").replace(" ", "T"));

export async function readWriteup(pb: PocketBase, key: WriteupKey): Promise<WriteupRecord | null> {
  const rows = await pb.collection("ai_writeups").getFullList<WriteupRecord>({ filter: filterFor(key), requestKey: null });
  return rows[0] ?? null;
}

export async function claimWriteup(
  pb: PocketBase,
  key: WriteupKey,
  input: {
    readonly inputHash: string;
    readonly voice: Voice;
    readonly model: string;
    readonly promptVersion: string;
    readonly facts: unknown;
    readonly now: number;
    readonly force?: boolean;
  },
): Promise<Claim> {
  const fields = {
    status: "pending",
    voice: input.voice,
    model: input.model,
    prompt_version: input.promptVersion,
    input_hash: input.inputHash,
    facts: input.facts,
    claimed_at: stamp(input.now),
    error: "",
  };

  let existing = await readWriteup(pb, key);
  if (!existing) {
    try {
      const created = await pb.collection("ai_writeups").create<WriteupRecord>(
        {
          league: key.leagueId,
          season: key.season,
          round: key.round,
          kind: key.kind,
          // Written out, never left unset: the unique index treats '' as a value.
          member: key.memberId,
          attempts: 1,
          ...fields,
        },
        { requestKey: null },
      );
      return { outcome: "claimed", id: created.id, previous: null, attempts: 1 };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      existing = await readWriteup(pb, key);
      if (!existing) throw error;
    }
  }

  const sameInput = existing.input_hash === input.inputHash;
  if (!input.force) {
    if (existing.status === "ready" && sameInput) return { outcome: "unchanged", id: existing.id };
    if (isFreshClaim(existing, input.now)) return { outcome: "busy", id: existing.id };
    if (existing.status === "failed" && sameInput && (existing.attempts ?? 0) >= MAX_ATTEMPTS) {
      return { outcome: "exhausted", id: existing.id };
    }
  }

  const attempts = sameInput ? (existing.attempts ?? 0) + 1 : 1;
  await pb.collection("ai_writeups").update(existing.id, { ...fields, attempts }, { requestKey: null });
  return { outcome: "claimed", id: existing.id, previous: existing.status, attempts };
}

/** Another run is writing this row now; a claim older than `STALE_AFTER_MS` is presumed dead. */
export function isFreshClaim(row: Pick<WriteupRecord, "status" | "claimed_at">, now: number): boolean {
  const claimedAt = instant(row.claimed_at);
  return row.status === "pending" && Number.isFinite(claimedAt) && now - claimedAt < STALE_AFTER_MS;
}

/** Nothing for a pass to ask, and no sheet worth building: another run is writing it, or its attempts are spent. */
export function notDue(row: Pick<WriteupRecord, "status" | "claimed_at" | "attempts">, now: number): boolean {
  return isFreshClaim(row, now) || (row.status === "failed" && (row.attempts ?? 0) >= MAX_ATTEMPTS);
}

/**
 * A dead writer's stale `pending` row goes back to what a reader can use:
 * prose stays written (the re-guard checks it again), a row with none is
 * failed and retried. Left pending, no pass would ever look at it again.
 */
export async function releaseStaleClaims(pb: PocketBase, now: number): Promise<void> {
  const rows = await pb
    .collection("ai_writeups")
    .getFullList<WriteupRecord>({ filter: `status = 'pending'`, fields: "id,status,claimed_at,output", requestKey: null });
  for (const row of rows) {
    if (isFreshClaim(row, now)) continue;
    await pb.collection("ai_writeups").update(row.id, { status: row.output ? "ready" : "failed" }, { requestKey: null });
  }
}

/**
 * Every member's row of one kind for one round, or for the whole season with
 * no round: the scout's reasons (7.2 G), the briefs (7.3 B, re-guarded in 7.3 E).
 */
export async function readMemberWriteups(
  pb: PocketBase,
  { leagueId, season, round, kind }: { leagueId: string; season: string; round?: number; kind: WriteupKind },
): Promise<(WriteupRecord & { readonly member: string; readonly round: number })[]> {
  if (!ID.test(leagueId) || !/^E\d{4}$/.test(season) || (round !== undefined && !Number.isInteger(round))) {
    throw new Error("ai_writeups: refusing a malformed key");
  }
  const rows = await pb.collection("ai_writeups").getFullList<WriteupRecord & { member: string; round: number }>({
    filter: `league = '${leagueId}' && season = "${season}"${round === undefined ? "" : ` && round = ${round}`} && kind = '${kind}'`,
    requestKey: null,
  });
  return rows.filter((row) => row.member);
}

/** Every league-wide write-up of one kind for a league's season. */
export async function readLeagueWriteups(
  pb: PocketBase,
  leagueId: string,
  season: string,
  kind: WriteupKind,
): Promise<(WriteupRecord & { readonly round: number })[]> {
  if (!ID.test(leagueId) || !/^E\d{4}$/.test(season)) throw new Error("ai_writeups: refusing a malformed key");
  const rows = await pb.collection("ai_writeups").getFullList<WriteupRecord & { round: number; member: string }>({
    filter: `league = '${leagueId}' && season = "${season}" && kind = '${kind}'`,
    requestKey: null,
  });
  return rows.filter((row) => !row.member);
}

/** Rows a commissioner has asked to rewrite. */
export async function readRewriteRequests(
  pb: PocketBase,
): Promise<(WriteupRecord & { league: string; season: string; round: number; kind: WriteupKind; member: string })[]> {
  return pb.collection("ai_writeups").getFullList({ filter: `rewrite_requested_at != ''`, requestKey: null });
}

export async function requestRewrite(pb: PocketBase, id: string, now: number): Promise<void> {
  await pb.collection("ai_writeups").update(id, { rewrite_requested_at: stamp(now) }, { requestKey: null });
}

/** The stored prose still holds against a fresh sheet: note when, and nothing else. */
export async function markGuarded(pb: PocketBase, id: string, now: number): Promise<void> {
  await pb.collection("ai_writeups").update(id, { last_guarded_at: stamp(now) }, { requestKey: null });
}

export async function completeWriteup(
  pb: PocketBase,
  id: string,
  result: {
    /** A round's write-up, a member's scout reasons (7.2 G) or a member's brief (7.3 B). */
    readonly writeup: RoundWriteup | { readonly reasons: Readonly<Record<string, string>> } | BriefLines;
    readonly refs: Readonly<Record<string, TokenRef>>;
    readonly usage: GeminiUsage;
    readonly model: string;
    readonly now: number;
  },
): Promise<void> {
  await pb.collection("ai_writeups").update(
    id,
    {
      status: "ready",
      output: result.writeup,
      refs: result.refs,
      model: result.model,
      tokens_in: result.usage.inputTokens,
      tokens_out: result.usage.outputTokens,
      tokens_thinking: result.usage.thinkingTokens,
      generated_at: stamp(result.now),
      error: "",
      // Finishing answers a commissioner's request; a claim alone does not,
      // so a worker that dies mid-write leaves the request for the next one.
      rewrite_requested_at: "",
    },
    { requestKey: null },
  );
}

/**
 * The model answered and the answer was refused. The previous prose stays: a
 * failed rewrite must not take a good write-up down with it. A refusal
 * answers a request too: asked again every minute, a sheet the model cannot
 * write would only spend the quota.
 */
export async function failWriteup(pb: PocketBase, id: string, reason: string, usage?: GeminiUsage): Promise<void> {
  await pb.collection("ai_writeups").update(
    id,
    {
      status: "failed",
      error: reason.slice(0, ERROR_LIMIT),
      rewrite_requested_at: "",
      ...(usage
        ? { tokens_in: usage.inputTokens, tokens_out: usage.outputTokens, tokens_thinking: usage.thinkingTokens }
        : {}),
    },
    { requestKey: null },
  );
}

/**
 * The model call threw. The row goes back to what it was — a written row
 * stays written, so a member's brief does not vanish over an outage — and a
 * commissioner's request stands, so the next check asks again. When Google
 * did not answer at all (the quota, the key, an outage) there was no verdict
 * on the sheet, so the attempt is given back: a day of quota errors must not
 * use up a round's three.
 */
export async function abandonClaim(pb: PocketBase, claim: Extract<Claim, { outcome: "claimed" }>, reason: string, outage: boolean): Promise<void> {
  const back = { status: claim.previous === "ready" ? "ready" : "failed", error: reason.slice(0, ERROR_LIMIT) };
  await pb.collection("ai_writeups").update(claim.id, outage ? { ...back, attempts: claim.attempts - 1 } : back, { requestKey: null });
}
