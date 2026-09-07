"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Bank } from "@/components/board";
import { browserPb, onConnectionLost } from "@/lib/pb/browser";
import {
  retractChatMessage,
  sendChatMessage,
} from "@/lib/chat/actions";
import { toMessage, type ChatMessage, type ChatRecord } from "@/lib/chat/store";

/**
 * League chat — slice 3.5.
 *
 * ## Why this one holds its own state, when the room deliberately does not
 *
 * `LiveDraft` subscribes and then asks the *server* to render the route again,
 * and its own doc comment argues that at length: whose turn it is and which
 * players are legal are decided by the engine, and a browser that recomputed
 * any of it would be a second authority that can disagree.
 *
 * Chat is the one surface where that argument does not apply, so it does the
 * opposite: it holds the message list and **appends straight from the realtime
 * payload**. A chat message has *no derived state* — the event payload is the
 * message, and nothing is being decided here. Applying the room's pattern would
 * mean a full server render per line of text, which is the slowest possible way
 * to show one, and the whole point of this slice is that a message lands on
 * everybody's phone at once.
 *
 * The divergence is deliberate and narrow. If a future message ever carries
 * something the server has to interpret, it stops being true and this component
 * should go back to `router.refresh()`.
 *
 * ## Collapsed, but never silent
 *
 * The panel is closed by default, because the room already has a board, a
 * radar, a pool and a clock, and 3.4b's critique measured what happens when a
 * surface takes half a phone. But collapsed chat would hide the rollback
 * announcement, which is the one thing this slice exists to surface — so the
 * closed header carries the **latest line and an unread count**. The
 * announcement is readable without opening anything.
 *
 * Unread is per viewer and lives in `localStorage`: a server-side read receipt
 * would be a new collection for a cosmetic number.
 */

/** How long the panel is when open. Bounded so the board stays reachable. */
const OPEN_HEIGHT = "max-h-[40vh]";

const seenKey = (leagueId: string) => `eurovafliai:chat-seen:${leagueId}`;

/**
 * The last message this viewer has seen, kept in `localStorage`.
 *
 * Read through `useSyncExternalStore` rather than copied into state by an
 * effect, which is the primitive React provides for exactly this: it takes a
 * *server* snapshot (`null`, since a server has no storage), so the unread
 * count hydrates without a mismatch, and it is not a `setState` inside an
 * effect — which this repo's lint rule refuses, correctly.
 *
 * Writing needs its own notifier because the `storage` event does not fire in
 * the tab that did the writing. Subscribing to both means a member reading
 * chat in one tab clears the badge in the other, which is right and free.
 */
/**
 * Union two lists of messages by id, oldest first.
 *
 * The server's copy wins on a collision, because it is the one that has been
 * through `readMessages` and carries the expanded author; a locally appended
 * copy is a good-enough echo waiting to be corrected.
 */
function mergeById(
  mine: readonly ChatMessage[],
  theirs: readonly ChatMessage[],
): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const message of mine) byId.set(message.id, message);
  for (const message of theirs) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.created.localeCompare(b.created));
}

const seenListeners = new Set<() => void>();

function subscribeSeen(listener: () => void): () => void {
  seenListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    seenListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readSeen(leagueId: string): string | null {
  try {
    return window.localStorage.getItem(seenKey(leagueId));
  } catch {
    // Storage denied. Chat still works; the viewer simply always reads as
    // caught up, which is the harmless direction to fail in.
    return null;
  }
}

function writeSeen(leagueId: string, id: string): void {
  try {
    window.localStorage.setItem(seenKey(leagueId), id);
  } catch {
    // See `readSeen`.
  }
  for (const listener of seenListeners) listener();
}

export function LeagueChat({
  leagueId,
  authToken,
  initial,
  myMemberId,
}: {
  leagueId: string;
  /** The viewer's own token, so PB's read rules scope the stream. */
  authToken: string;
  /** Server-rendered on first load; realtime keeps it current after that. */
  initial: readonly ChatMessage[];
  /** Null for somebody with no membership — they can read, not write. */
  myMemberId: string | null;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([...initial]);
  /**
   * Follow the server's transcript, do not freeze it.
   *
   * `useState(initial)` initialises **once**, and that was a real defect rather
   * than an inefficiency: the subscription connects asynchronously, so anything
   * announced in the window between this component mounting and `PB_CONNECT`
   * arriving is never delivered — realtime does not replay — and with the list
   * frozen at mount it was never recovered either. A pick made immediately
   * after entering the room, and every announcement of a pause or a rollback
   * that followed, simply never appeared.
   *
   * Every write here calls `revalidatePath`, so the server re-renders with the
   * whole transcript; merging that in makes the component self-healing and
   * closes the connect window without any special case for it. Merged rather
   * than replaced so a locally appended echo is corrected, not duplicated, and
   * never lost while the server render is in flight.
   *
   * Adjusting state during render is React's documented answer for this, and
   * deliberately not a `key` on the component: remounting would re-seed the
   * list and throw away the live subscription with it — which is the mistake
   * 3.4b made one slice ago with `useActionState`.
   */
  const [seededFrom, setSeededFrom] = useState(initial);
  if (seededFrom !== initial) {
    setSeededFrom(initial);
    setMessages((current) => mergeById(current, initial));
  }
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(true);
  const lastSeen = useSyncExternalStore(
    subscribeSeen,
    () => readSeen(leagueId),
    () => null,
  );

  const listRef = useRef<HTMLDivElement>(null);
  /** Was the reader at the bottom *before* this message arrived? */
  const wasAtBottom = useRef(true);

  // ── the subscription ──────────────────────────────────────────────────────
  useEffect(() => {
    // The page's one shared client. See `src/lib/pb/browser.ts`: a second
    // client here is what made the draft room go deaf.
    const pb = browserPb(authToken);
    let active = true;
    const unsubscribes: (() => void)[] = [];

    unsubscribes.push(
      onConnectionLost(() => {
        if (active) setConnected(false);
      }),
    );

    void (async () => {
      try {
        unsubscribes.push(
          await pb.realtime.subscribe("PB_CONNECT", () => {
            if (active) setConnected(true);
          }),
        );
        unsubscribes.push(
          await pb.collection("chat_messages").subscribe(
            "*",
            (event) => {
              if (!active) return;
              const message = toMessage(event.record as unknown as ChatRecord);
              setMessages((current) => {
                // Deletes are `delete` actions; a retract is an *update* that
                // clears the body, so both arrive here and both are handled by
                // replacing the row rather than removing it.
                if (event.action === "delete") {
                  return current.filter((each) => each.id !== message.id);
                }
                const at = current.findIndex((each) => each.id === message.id);
                if (at >= 0) {
                  const next = [...current];
                  next[at] = message;
                  return next;
                }
                return mergeById(current, [message]);
              });
            },
            {
              // Single quotes: PocketBase rejects double-quoted filter values.
              filter: `league = '${leagueId}'`,
              // **`expand` matters here.** Without it the realtime payload
              // carries `author` as a bare id and no team name, so every
              // message that *arrived* rather than being server-rendered
              // showed up as "A member" — including your own the moment you
              // sent it, and every message on everybody else's device. The
              // first-load list had the name because `readMessages` expands;
              // the stream did not, so the two disagreed. Caught by the
              // two-device spec, which is the only place they could be
              // compared.
              expand: "author",
            },
          ),
        );
      } catch {
        if (active) setConnected(false);
      }
    })();

    return () => {
      active = false;
      // Only our own topics. `pb.realtime.unsubscribe()` would close the
      // shared connection and deafen every other surface on the page.
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [leagueId, authToken]);

  const newest = messages.at(-1) ?? null;

  // Reading it *is* seeing it. Not a `setState` — it writes the external store
  // and notifies, so the lint rule that refuses state changes in effects has
  // nothing to object to and the badge clears in every open tab.
  useEffect(() => {
    if (open && newest) writeSeen(leagueId, newest.id);
  }, [open, newest, leagueId]);

  const unread = (() => {
    if (!lastSeen) return open ? 0 : messages.length;
    const at = messages.findIndex((each) => each.id === lastSeen);
    // A `lastSeen` we can no longer find means the row was retracted out from
    // under it. Counting nothing is better than counting everything.
    if (at < 0) return 0;
    return messages.length - at - 1;
  })();

  // ── scrolling ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const list = listRef.current;
    if (!list || !open) return;
    // Only follow the newest message when the reader was already at the
    // bottom. Yanking somebody out of the transcript they are reading is worse
    // than leaving them to scroll down themselves — and scrolling is not
    // animation, which DESIGN.md exempts by name, so this spends nothing from
    // the motion budget.
    if (wasAtBottom.current) list.scrollTop = list.scrollHeight;
  }, [messages, open]);

  useEffect(() => {
    // Opening lands on the newest, always.
    const list = listRef.current;
    if (open && list) list.scrollTop = list.scrollHeight;
  }, [open]);

  const onScroll = () => {
    const list = listRef.current;
    if (!list) return;
    wasAtBottom.current =
      list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  };

  // ── sending ───────────────────────────────────────────────────────────────
  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    // Cleared immediately: React 19 resets an uncontrolled input across a
    // server-action transition anyway (AGENTS.md), and a controlled box that
    // keeps the text through a send makes a double-send the natural next tap.
    setDraft("");
    const result = await sendChatMessage(leagueId, body);
    setSending(false);
    if (result.error) {
      setError(result.error);
      // Handed back, so a refusal never costs somebody their sentence.
      setDraft(body);
      return;
    }
    // The realtime event usually beats this, and `setMessages` de-duplicates by
    // id, so adding it here only matters when the stream is down.
    if (result.message) {
      const message = result.message;
      setMessages((current) => mergeById(current, [message]));
    }
  };

  const retract = async (messageId: string) => {
    setError(null);
    const result = await retractChatMessage(leagueId, messageId);
    if (result.error) setError(result.error);
  };

  const summary = newest
    ? newest.deleted
      ? "Message deleted"
      : newest.body
    : "Nothing said yet";

  return (
    <Bank
      label="League chat"
      aside={
        unread > 0 && !open ? `${unread} new` : `${messages.length} messages`
      }
    >
      {/* The closed state is not a bare label. It carries the latest line, so a
          rollback announcement is readable without opening anything — which is
          the whole reason this slice exists, and would have been defeated by a
          panel that merely said "Chat". */}
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        data-testid="chat-toggle"
        data-open={open ? "true" : "false"}
        aria-expanded={open}
        className="slot-filled -mx-3 flex min-h-11 w-full items-baseline gap-x-3 px-3 py-3 text-left transition-colors hover:bg-ink/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-live"
      >
        <span className="slot-label shrink-0">{open ? "Hide" : "Show"}</span>
        <span
          className={`min-w-0 flex-1 truncate text-sm ${
            newest?.system ? "chat-system" : "text-ink-soft"
          }`}
          data-testid="chat-latest"
        >
          {summary}
        </span>
        {unread > 0 && !open ? (
          <span className="slot-label shrink-0 tabular-nums" data-testid="chat-unread">
            {unread} new
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <div
            ref={listRef}
            onScroll={onScroll}
            data-testid="chat-list"
            className={`${OPEN_HEIGHT} flex flex-col gap-2 overflow-y-auto`}
          >
            {messages.length === 0 ? (
              <p className="text-sm text-ink-soft">
                Nothing said yet. Picks, pauses and rollbacks are announced here
                as they happen.
              </p>
            ) : (
              messages.map((message) => (
                <p
                  key={message.id}
                  data-testid="chat-message"
                  data-kind={message.system ? "system" : "user"}
                  className="flex flex-wrap items-baseline gap-x-2 text-sm"
                >
                  {/* A member's message shows their team name; the app's shows
                      none. That absence is the second carrier of the
                      distinction, so it survives greyscale and a colour-vision
                      simulation — colour is never doing this alone. */}
                  {message.system ? (
                    <span className="sr-only">The app:</span>
                  ) : (
                    <span className="slot-label shrink-0">
                      {message.teamName ?? "A member"}
                    </span>
                  )}
                  <span
                    className={
                      message.deleted
                        ? "text-ink-faint italic"
                        : message.system
                          ? "chat-system"
                          : ""
                    }
                  >
                    {message.deleted ? "Message deleted" : message.body}
                  </span>
                  {!message.system &&
                  !message.deleted &&
                  myMemberId !== null &&
                  message.authorId === myMemberId ? (
                    <button
                      type="button"
                      onClick={() => void retract(message.id)}
                      data-testid="chat-retract"
                      className="slot-label min-h-11 min-w-11 px-2 text-ink-soft transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
                    >
                      Delete
                    </button>
                  ) : null}
                </p>
              ))
            )}
          </div>

          {error ? (
            <p role="alert" data-testid="chat-error" className="text-sm">
              {error}
            </p>
          ) : null}

          {myMemberId === null ? null : (
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="sr-only">Say something to the league</span>
                <input
                  type="text"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                  data-testid="chat-input"
                  placeholder="Say something"
                  className="min-h-11 w-full border-b border-ink/50 bg-transparent px-1 py-2 focus:border-live focus:outline-none"
                />
              </label>
              <button
                type="button"
                onClick={() => void send()}
                disabled={sending || draft.trim().length === 0}
                data-testid="chat-send"
                className="slot-label min-h-11 min-w-11 border border-ink/50 px-4 transition-colors hover:border-ink/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live disabled:opacity-40"
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          )}

          {!connected ? (
            <p
              role="status"
              data-testid="chat-reconnecting"
              className="slot-label text-ink-soft"
            >
              Reconnecting — new messages may be missing
            </p>
          ) : null}
        </>
      ) : null}
    </Bank>
  );
}
