"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import { getSuperuserClient } from "@/lib/pb/superuser";

import { checkMessage } from "./messages";
import {
  lastMessageAt,
  postMessage,
  retractMessage,
  type ChatMessage,
} from "./store";

/**
 * Chat's front door — slice 3.5.
 *
 * ## Why this is a server action and not a client-direct write
 *
 * The blueprint's §4 said `chat_messages` create "can be client-direct … for
 * latency", which contradicted CLAUDE.md's non-negotiable 4. The exception is
 * **withdrawn** in this slice, and the blueprint is amended, because its stated
 * reason does not survive inspection: both paths end in the same PocketBase
 * record create firing the same realtime event, so every *other* device sees a
 * message exactly as fast either way. Client-direct would have saved only the
 * sender's own hop to a PocketBase on `127.0.0.1` — which optimistic rendering
 * hides anyway — in exchange for a second write path, validation duplicated
 * into a rule expression, and a rate limit living in configuration on the box
 * instead of in code in git.
 *
 * Instant-ness lives on the *read* side, and that is where 3.5 spends its
 * effort: the chat component appends straight from the realtime payload rather
 * than asking the server to render the route again.
 *
 * ## Whose message
 *
 * Your own, always. The action resolves the actor's own membership in the
 * league, so no member id travels on the wire for anybody to change — the same
 * shape `submitCheatSheet` uses, and the reason a retract cannot be aimed at
 * somebody else's line.
 *
 * ## Failure recovery
 *
 * One write per call, and nothing derived from it. A send that fails leaves no
 * trace and the sender is told; a retract is idempotent (a row already
 * retracted answers "yes" without writing again). There is no repair to run,
 * because a missing message is not an inconsistent state — unlike a pick, which
 * has a board drawn from it.
 */

export type ChatResult = {
  readonly error: string | null;
  /** Echoed back so an optimistic row can be replaced by the real one. */
  readonly message?: ChatMessage;
};

const NOT_YOURS: ChatResult = {
  error: "That is not your league to write in.",
};

/** The actor's own membership in this league, or null. */
async function loadChatContext(leagueId: string) {
  const session = await requireSession();
  const pb = await getSuperuserClient();

  const members = await pb.collection("league_members").getFullList<{
    id: string;
    user: string;
  }>({
    filter: `league = '${leagueId}' && user = '${session.user.id}'`,
    requestKey: null,
  });
  const own = members[0];
  // A commissioner with no membership row has no team name to speak under.
  // Every other action here draws the same line.
  if (!own) return null;

  return { pb, memberId: own.id };
}

export async function sendChatMessage(
  leagueId: string,
  body: string,
  { restoring = false }: { restoring?: boolean } = {},
): Promise<ChatResult> {
  const context = await loadChatContext(leagueId);
  if (!context) return NOT_YOURS;

  // The rate limit reads the sender's own last message rather than keeping
  // per-process state, because there are two processes (web and worker) and a
  // web app can be reloaded between two keystrokes. The database is the only
  // thing that remembers.
  //
  // **A restore skips the gap, and that is a fix rather than a hole.** The
  // limit exists so a held-down paste key cannot fill the transcript of draft
  // night; putting back a message you just deleted is not a new message, and it
  // happens *within* the gap by definition — press Delete, change your mind,
  // and the undo was refused with "Slow down a moment". Found by the spec
  // written for the undo itself. The length cap still applies, and this is an
  // authenticated member of a private league restoring their own words.
  const lastAt = restoring
    ? null
    : await lastMessageAt(context.pb, context.memberId);
  const verdict = checkMessage({ body, now: Date.now(), lastAt });
  if (!verdict.ok) return { error: verdict.error };

  let message: ChatMessage;
  try {
    message = await postMessage(context.pb, {
      leagueId,
      memberId: context.memberId,
      body: verdict.body,
    });
  } catch {
    return { error: "That did not send. Try again." };
  }

  // The surfaces that hold chat render server-side on first load; the realtime
  // subscription is what keeps them current after that. Revalidating means a
  // reload agrees with what everyone already saw.
  revalidatePath(`/leagues/${leagueId}`);
  revalidatePath(`/leagues/${leagueId}/draft`);

  return { error: null, message };
}

export async function retractChatMessage(
  leagueId: string,
  messageId: string,
): Promise<ChatResult> {
  const context = await loadChatContext(leagueId);
  if (!context) return NOT_YOURS;

  // Ownership is checked against the stored row inside `retractMessage`, not
  // against anything this request claimed. A system line belongs to nobody and
  // is refused there — a rollback announcement that could be removed would be
  // worse than none at all.
  const done = await retractMessage(context.pb, {
    messageId,
    memberId: context.memberId,
  });
  if (!done) return { error: "That is not yours to delete." };

  revalidatePath(`/leagues/${leagueId}`);
  revalidatePath(`/leagues/${leagueId}/draft`);
  return { error: null };
}
