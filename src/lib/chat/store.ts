import type PocketBase from "pocketbase";
import { z } from "zod";

/**
 * Reading and writing chat — the PocketBase half, and nothing else.
 *
 * **Framework-free on purpose**, like `src/lib/drafts/pipeline.ts` and
 * `src/lib/sheets/store.ts`. The worker announces autodrafted picks and it
 * cannot import a `"use server"` module: that would drag in `next/cache` and
 * `server-only` and throw on the first line. So this takes a client and does as
 * it is told, and the request-facing half lives in `actions.ts`.
 *
 * ## `announce` never throws, and that is the design
 *
 * A pick is already two writes — the pick, then the advance — against a database
 * with no transactions. A system message makes three, so it is deliberately the
 * least important of them: written last, and its failure swallowed. A dropped
 * chat line costs a sentence; a pick that failed because its *announcement*
 * failed would cost the draft, and the pipeline's pick-then-advance invariant
 * would have to grow a fourth repair to cover it.
 *
 * The accepted consequence, stated where somebody will read it: the transcript
 * can have a hole in it. It is a record, not *the* record — `picks` is the
 * record, and the board is drawn from that.
 */

/**
 * The row as PocketBase sends it. Loose on purpose: a realtime payload is
 * whatever the server emitted, and a missing optional field must not drop a
 * message — `toMessage` supplies the defaults.
 */
const chatRecordSchema = z.looseObject({
  id: z.string().min(1),
  league: z.string(),
  author: z.string().optional(),
  body: z.string().optional(),
  kind: z.string().optional(),
  deleted: z.boolean().optional(),
  created: z.string().optional(),
  expand: z
    .object({
      author: z
        .object({ id: z.string(), team_name: z.string().optional() })
        .optional(),
    })
    .optional(),
});

export type ChatRecord = z.infer<typeof chatRecordSchema>;

/** A realtime event's record, or null when it is not a chat row at all. */
export function parseChatRecord(value: unknown): ChatRecord | null {
  const parsed = chatRecordSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** One message, in the shape a surface renders. */
export type ChatMessage = {
  readonly id: string;
  /** Null for a system line — the app speaking rather than a person. */
  readonly authorId: string | null;
  readonly teamName: string | null;
  readonly body: string;
  readonly system: boolean;
  readonly deleted: boolean;
  readonly created: string;
};

/**
 * A stored row, validated on the way out rather than trusted.
 *
 * `kind` and a null `author` say the same thing twice, and they can disagree —
 * a hand-edited row, or a future writer that sets one and forgets the other. So
 * **`kind` decides**, and it is the field the migration marks required; `author`
 * is only read for the name. Getting this backwards would turn a departed
 * member's messages into system announcements, which is also why `author` does
 * not cascade-delete.
 */
export function toMessage(record: ChatRecord): ChatMessage {
  const system = record.kind === "system";
  const author = record.expand?.author;
  return {
    id: record.id,
    authorId: system ? null : (record.author ?? null),
    teamName: system ? null : (author?.team_name ?? null),
    body: typeof record.body === "string" ? record.body : "",
    system,
    deleted: record.deleted === true,
    created: record.created ?? "",
  };
}

/**
 * Every message in the league, oldest first.
 *
 * No pagination, which is a decision rather than an omission: this is twelve
 * people and a season might reach a few thousand rows. The ceiling is recorded
 * in STATUS; the index on `(league, created)` is what keeps the read cheap
 * until somebody hits it.
 */
export async function readMessages(
  pb: PocketBase,
  leagueId: string,
): Promise<ChatMessage[]> {
  const records = await pb.collection("chat_messages").getFullList<ChatRecord>({
    filter: `league = '${leagueId}'`,
    sort: "created",
    expand: "author",
    requestKey: null,
  });
  return records.map(toMessage);
}

/** When this member last said something, as epoch millis, or null. */
export async function lastMessageAt(
  pb: PocketBase,
  memberId: string,
): Promise<number | null> {
  const records = await pb.collection("chat_messages").getList<ChatRecord>(1, 1, {
    filter: `author = '${memberId}'`,
    sort: "-created",
    requestKey: null,
  });
  const created = records.items[0]?.created;
  if (!created) return null;
  const at = Date.parse(created);
  return Number.isNaN(at) ? null : at;
}

/** A member's own message. Throws — the sender is waiting and wants to know. */
export async function postMessage(
  pb: PocketBase,
  input: { leagueId: string; memberId: string; body: string },
): Promise<ChatMessage> {
  const record = await pb.collection("chat_messages").create<ChatRecord>(
    {
      league: input.leagueId,
      author: input.memberId,
      body: input.body,
      kind: "user",
      deleted: false,
    },
    { expand: "author", requestKey: null },
  );
  return toMessage(record);
}

/**
 * The app speaking. **Never throws.**
 *
 * Called from the pick pipeline, the sweep and the draft actions, all of which
 * have already done the thing being announced. See the note at the top of this
 * file: the announcement is the least important write in the sequence and is
 * treated as such.
 */
export async function announce(
  pb: PocketBase,
  leagueId: string,
  body: string,
): Promise<void> {
  try {
    await pb.collection("chat_messages").create(
      {
        league: leagueId,
        body,
        kind: "system",
        deleted: false,
      },
      { requestKey: null },
    );
  } catch (error) {
    // Logged once and left. There is nothing to repair: the event itself
    // landed, and a missing line is not a corrupt board.
    console.error(
      `[chat] could not announce in league ${leagueId}:`,
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * Retract a member's own message, leaving a tombstone.
 *
 * `body` is **cleared** rather than kept and hidden, so the text is genuinely
 * gone from the database — hiding it client-side would leave it readable to
 * anyone with the viewer's token, which is every member of the league.
 *
 * Returns false when the message is not this member's, or is a system line.
 * Ownership is checked against the stored row rather than against anything the
 * caller passed, because the caller is a request.
 */
export async function retractMessage(
  pb: PocketBase,
  input: { messageId: string; memberId: string },
): Promise<boolean> {
  let record: ChatRecord;
  try {
    record = await pb
      .collection("chat_messages")
      .getOne<ChatRecord>(input.messageId, { requestKey: null });
  } catch {
    return false;
  }
  // A system line belongs to nobody and is never deletable: a rollback
  // announcement that could be removed would be worse than none at all.
  if (record.kind === "system") return false;
  if (record.author !== input.memberId) return false;
  if (record.deleted === true) return true;

  await pb
    .collection("chat_messages")
    .update(input.messageId, { body: "", deleted: true }, { requestKey: null });
  return true;
}
