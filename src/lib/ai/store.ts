import type PocketBase from "pocketbase";

import { isUniqueViolation } from "@/lib/drafts/unique";

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
 * `STALE_AFTER_MS` the next run takes it over. Two runs at once share one row
 * because of the unique index, so the worst case is one duplicate model call.
 * Three failures on the same input stop asking: a free quota is not a thing
 * to burn on a sheet the model cannot write.
 */

export type WriteupKind = "round_summary";

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
};

export type Claim =
  | { readonly outcome: "claimed"; readonly id: string }
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
      return { outcome: "claimed", id: created.id };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      existing = await readWriteup(pb, key);
      if (!existing) throw error;
    }
  }

  const sameInput = existing.input_hash === input.inputHash;
  if (!input.force) {
    if (existing.status === "ready" && sameInput) return { outcome: "unchanged", id: existing.id };
    const claimedAt = Date.parse((existing.claimed_at ?? "").replace(" ", "T"));
    if (existing.status === "pending" && Number.isFinite(claimedAt) && input.now - claimedAt < STALE_AFTER_MS) {
      return { outcome: "busy", id: existing.id };
    }
    if (existing.status === "failed" && sameInput && (existing.attempts ?? 0) >= MAX_ATTEMPTS) {
      return { outcome: "exhausted", id: existing.id };
    }
  }

  await pb.collection("ai_writeups").update(
    existing.id,
    { ...fields, attempts: sameInput ? (existing.attempts ?? 0) + 1 : 1 },
    { requestKey: null },
  );
  return { outcome: "claimed", id: existing.id };
}

export async function completeWriteup(
  pb: PocketBase,
  id: string,
  result: {
    readonly writeup: RoundWriteup;
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
    },
    { requestKey: null },
  );
}

/** The previous prose stays: a failed rewrite must not take a good write-up down with it. */
export async function failWriteup(pb: PocketBase, id: string, reason: string, usage?: GeminiUsage): Promise<void> {
  await pb.collection("ai_writeups").update(
    id,
    {
      status: "failed",
      error: reason.slice(0, ERROR_LIMIT),
      ...(usage
        ? { tokens_in: usage.inputTokens, tokens_out: usage.outputTokens, tokens_thinking: usage.thinkingTokens }
        : {}),
    },
    { requestKey: null },
  );
}
