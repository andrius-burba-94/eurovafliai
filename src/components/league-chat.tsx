"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Bank, Correction, Slot, Slots, inputStyles } from "@/components/board";
import {
  browserPb,
  onAuthenticationLost,
  onConnectionLost,
  reportRealtimeError,
} from "@/lib/pb/browser";
import { retractChatMessage, sendChatMessage } from "@/lib/chat/actions";
import {
  CHAT_MAX_LENGTH,
  CHAT_UI,
  chatRemaining,
  chatTime,
  chatTotal,
  chatUnread,
} from "@/lib/chat/messages";
import {
  parseChatRecord,
  toMessage,
  type ChatMessage,
} from "@/lib/chat/store";

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
  const router = useRouter();
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
  /**
   * Has the realtime stream ever come up?
   *
   * `connected` opens optimistically `true`, because the server render *was*
   * current a moment ago and crying "reconnecting" on every page load would
   * train the room to ignore the word — the same argument `LiveDraft` makes.
   * That makes it useless for answering "are we subscribed yet", which is a
   * different question and the one a spec has to wait on: realtime does not
   * replay, so anything written before the first `PB_CONNECT` is missed, and a
   * direct database write does not `revalidatePath` to heal it.
   *
   * Surfaced as `data-live`, with no appearance — the same trick as the board's
   * `data-advanced` and the cheat sheet's `data-pending`. Wait for a fact, not
   * for a duration.
   */
  const [live, setLive] = useState(false);
  const lastSeen = useSyncExternalStore(
    subscribeSeen,
    () => readSeen(leagueId),
    () => null,
  );

  /**
   * The message just retracted, so it can be put back.
   *
   * An undo rather than a confirm, which is the third time this project has
   * reached the same conclusion: 3.4a said it about the whole sheet, 3.4b about
   * a single row, and 3.5's critique found a delete here with **no confirm, no
   * undo, and focus dropped to `<body>`** — while the body was genuinely
   * cleared in the database, so it was unrecoverable. The body is kept in
   * component state only; putting it back re-sends it, so there is no schema
   * change and nothing to clean up if the tab closes.
   */
  const [undone, setUndone] = useState<{ body: string } | null>(null);
  /** A row to put focus on once the list has re-rendered. */
  const focusWanted = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
      onAuthenticationLost(() => {
        if (active) router.replace("/login?error=unauthorized");
      }),
    );

    void (async () => {
      try {
        unsubscribes.push(
          await pb.realtime.subscribe("PB_CONNECT", () => {
            if (!active) return;
            setConnected(true);
            setLive(true);
          }),
        );
        unsubscribes.push(
          await pb.collection("chat_messages").subscribe(
            "*",
            (event) => {
              if (!active) return;
              const record = parseChatRecord(event.record);
              if (!record) return;
              const message = toMessage(record);
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
      } catch (error) {
        if (active) reportRealtimeError(error);
      }
    })();

    return () => {
      active = false;
      // Only our own topics. `pb.realtime.unsubscribe()` would close the
      // shared connection and deafen every other surface on the page.
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [leagueId, authToken, router]);

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

  /**
   * Put focus somewhere deliberate after an edit, never on the document.
   *
   * Measured by both assessments before this existed: `document.activeElement`
   * was `<body>` after deleting a message **and** after clicking Send — the
   * latter because clearing the box disables the button that was just clicked,
   * so the browser blurs it and focus falls to the top of the page. A keyboard
   * or switch user sent one message and was teleported out of the panel.
   */
  useEffect(() => {
    const id = focusWanted.current;
    if (!id) return;
    focusWanted.current = null;
    if (id === "input") inputRef.current?.focus();
    else listRef.current?.querySelector<HTMLElement>(`[data-row="${id}"]`)?.focus();
  });

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
    // Back to the box either way. Send is disabled the moment the box empties,
    // so the browser blurs it and focus lands on `<body>` unless we say
    // otherwise — which is what it did.
    focusWanted.current = "input";
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

  const retract = async (messageId: string, body: string) => {
    setError(null);
    // Focus the row that is about to become a tombstone, not the button that
    // is about to unmount with it.
    focusWanted.current = messageId;
    const result = await retractChatMessage(leagueId, messageId);
    if (result.error) {
      setError(result.error);
      return;
    }
    setUndone({ body });
  };

  /** Put a retracted message back, by saying it again. */
  const putBack = async () => {
    if (!undone) return;
    const body = undone.body;
    setUndone(null);
    setError(null);
    focusWanted.current = "input";
    // `restoring`, so the rate limit does not refuse the undo. A put-back
    // always happens inside the gap — that is what an undo is.
    const result = await sendChatMessage(leagueId, body, { restoring: true });
    if (result.error) {
      setError(result.error);
      setUndone({ body });
    }
  };

  /**
   * The one thing this panel says out loud.
   *
   * There was **no live region on this surface at all** — measured by both
   * assessments — so the slice's central promise, that a rollback reaches
   * everybody, was silent to a screen reader whether the panel was open or
   * shut. PRODUCT.md asks for state to be "perceivable without looking at the
   * screen"; this is the same unmet commitment as the on-the-clock banner.
   *
   * **Announcements only, never chatter**, and that limit is the lesson of
   * 3.3's critique: the pool's live region narrated a rebuilt row on every
   * keystroke and every pick in the league, which queued eleven announcements
   * about players nobody had navigated to. A system line is the app telling
   * twelve people something happened to the draft; a member's message is a
   * conversation, and a conversation that interrupts whatever you were reading
   * is worse than one you go and look at.
   */
  const spoken = newest?.system && !newest.deleted ? newest.body : "";

  const summary = newest
    ? newest.deleted
      ? CHAT_UI.retracted
      : newest.body
    : CHAT_UI.emptyLatest;

  return (
    <Bank
      label="League chat"
      // The total, always. It used to be *replaced* by the unread count exactly
      // when there was unread — so the one number that gives the badge its
      // scale disappeared at the moment it was needed. The badge lives in the
      // header, once.
      aside={chatTotal(messages.length)}
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
        // No hover wash. Measured: the header's rail-blue line sits at 4.64:1
        // on stock and **4.22:1 over `ink/5`** — under AA, in what is a
        // desktop's normal reading state, because the pointer rests there. The
        // row is a whole-width control whose affordance is its rule and its
        // focus ring; it does not need a tint that costs the one line on it
        // half its contrast headroom.
        className="slot-filled -mx-3 flex min-h-11 w-full items-baseline gap-x-3 px-3 py-3 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-live"
      >
        <span className="slot-label shrink-0">{open ? "Hide" : "Show"}</span>
        {/* **Two lines, not one, and the whole point of the panel being
            collapsed.** Measured at 390px before this: the rollback line got
            212px of 350px — 43.7% of it — a six-team roll showed 36 of 142
            characters, and the draft-complete announcement 34 of 57. Worse, it
            *widened* when opened, because the badge beside it hid: more room in
            the state where the line is redundant. Three lines, measured
            rather than guessed: the rollback sentence is 78 characters over a
            ~212px line at 390px — about 26 characters a line — so two lines
            still hid 20px of it. Three fits it whole, which is the one
            announcement that must be readable without opening anything. A
            twelve-team roll still truncates and should: 142 characters, not
            urgent, and the whole order is one tap away. The old note said
            doubles it, which fits the rollback announcement whole — the one
            that has to be readable without opening anything.
            
            `break-words` because a pasted URL is one unbroken token and would
            otherwise push this row wide. */}
        <span
          className={`min-w-0 flex-1 break-words text-sm [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] overflow-hidden ${
            newest?.system ? "chat-system" : "text-ink"
          }`}
          data-testid="chat-latest"
        >
          {summary}
        </span>
        {unread > 0 ? (
          <span
            className="slot-label shrink-0 tabular-nums"
            data-testid="chat-unread"
          >
            {chatUnread(unread)}
          </span>
        ) : null}
      </button>

      {/* No appearance, purely a fact a spec can wait on. See `live`. */}
      <span data-testid="chat-live" data-live={live ? "true" : "false"} hidden />

      {/* Polite, and off-screen: it duplicates the header line rather than
          adding a second visible copy of it. */}
      <p
        role="status"
        aria-live="polite"
        className="sr-only"
        data-testid="chat-said"
      >
        {spoken}
      </p>

      {open ? (
        <>
          {/* **The board's own material, not a generic feed.** This was `<p>`
              rows in an unruled `overflow-y-auto` div with an 8px gap:
              measured `border-bottom: 0px`, no top rule, nothing closing it —
              and every other list in this app is a `Slots` run whose top
              border *is* its state and which closes with
              `border-b border-rule-strong`. The radar's critique fixed "the
              list used to just stop"; 3.5 re-introduced it, and swapping the
              strings would have dropped this panel into any app unchanged.
              
              `tabIndex`/`role`/`aria-label` are the three lines 3.1 already
              ships on the board's scrollport. Without them a scrolling region
              with no focusable children is unreachable by keyboard — measured
              at `scrollHeight 2304 / clientHeight 338` with
              `focusableDescendants: 0` for any member who had not written in
              it. WCAG 2.1.1, and the identical defect, in a second place. */}
          <div
            ref={listRef}
            onScroll={onScroll}
            tabIndex={0}
            role="region"
            aria-label={CHAT_UI.transcriptLabel}
            data-testid="chat-list"
            className={`${OPEN_HEIGHT} overflow-y-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-live`}
          >
            {messages.length === 0 ? (
              <p className="max-w-prose px-3 py-3 text-sm text-ink-soft">
                {CHAT_UI.empty}
              </p>
            ) : (
              <Slots testId="chat-run" label={CHAT_UI.transcriptLabel}>
                {messages.map((message) => (
                  <Slot
                    key={message.id}
                    testId="chat-message"
                    // A member's line is `filled`; the app's is `waiting`, whose
                    // dashed rule is this system's word for something nobody
                    // has to act on. That is a *second* non-colour carrier for
                    // the system/member distinction, on top of the absent team
                    // name and the `sr-only` prefix.
                    state={message.system ? "waiting" : "filled"}
                  >
                    <span
                      data-row={message.id}
                      data-kind={message.system ? "system" : "user"}
                      tabIndex={-1}
                      className="flex w-full flex-wrap items-baseline gap-x-2 gap-y-1 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-live"
                    >
                      {message.system ? (
                        <span className="sr-only">{CHAT_UI.systemPrefix}</span>
                      ) : (
                        <span className="slot-label shrink-0">
                          {message.teamName ?? "A member"}
                        </span>
                      )}
                      {/* A clock. CONTEXT.md calls this "the record of draft
                          night" and it shipped without one, so working out
                          whether your pick survived a rollback meant reading
                          upward through prose. `suppressHydrationWarning`
                          because the time is formatted in the viewer's own
                          locale and the server has no business guessing it. */}
                      <time
                        dateTime={message.created}
                        suppressHydrationWarning
                        className="slot-label shrink-0 tabular-nums text-ink-faint"
                      >
                        {chatTime(message.created)}
                      </time>
                      {/* `break-words` is a measured fix, not a precaution: a
                          118-character URL hid **526px** inside this panel at
                          390px, because `overflow-y-auto` makes `overflow-x`
                          compute to `auto` and an unbroken token just pushed
                          the row wide. `max-w-prose` caps the measure, which
                          ran 704px ~95ch at 1440px — 3.4a's `line-length`
                          finding, uncapped again. */}
                      <span
                        className={`min-w-0 max-w-prose flex-1 break-words text-sm ${
                          message.deleted
                            ? "italic text-ink-faint"
                            : message.system
                              ? "chat-system"
                              : ""
                        }`}
                      >
                        {message.deleted ? CHAT_UI.retracted : message.body}
                      </span>
                      {!message.system &&
                      !message.deleted &&
                      myMemberId !== null &&
                      message.authorId === myMemberId ? (
                        <button
                          type="button"
                          onClick={() => void retract(message.id, message.body)}
                          data-testid="chat-retract"
                          className="slot-label min-h-11 min-w-11 shrink-0 px-2 text-ink-soft transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
                        >
                          Delete
                        </button>
                      ) : null}
                    </span>
                  </Slot>
                ))}
              </Slots>
            )}
          </div>

          {/* `Correction` — the system's declared voice for a refusal, with
              its own material and `role="alert"`. It was a bare `<p>` with a
              measured `0px` top border, which is the one thing this design
              system asks a failure never to be. */}
          {error ? (
            <Correction testId="chat-error">{error}</Correction>
          ) : null}

          {/* The undo. Third slice in a row this project has concluded that a
              destructive action wants a way back rather than a confirmation in
              front of it. Putting it back re-sends the text, so nothing is held
              in the database and a closed tab costs nothing. */}
          {undone ? (
            <div
              data-testid="chat-undone"
              className="slot-waiting flex flex-wrap items-center gap-3 px-3 py-3"
            >
              <p className="min-w-0 flex-1 text-sm text-ink-soft">
                {CHAT_UI.retracted}
              </p>
              <button
                type="button"
                onClick={() => void putBack()}
                data-testid="chat-putback"
                className="slot-label min-h-11 min-w-11 border border-ink/50 px-3 text-ink transition-colors hover:border-ink/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
              >
                Put it back
              </button>
              <button
                type="button"
                onClick={() => setUndone(null)}
                data-testid="chat-undone-dismiss"
                className="slot-label min-h-11 min-w-11 px-2 text-ink-soft transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
              >
                Done
              </button>
            </div>
          ) : null}

          {myMemberId === null ? null : (
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="sr-only">Say something to the league</span>
                <input
                  ref={inputRef}
                  type="text"
                  value={draft}
                  // The cap the action already enforces, said *before* Send
                  // rather than after it. `CHAT_MAX_LENGTH` was exported and
                  // never imported here, so a 2,000-character paste was
                  // refused only once somebody had pressed the button.
                  maxLength={CHAT_MAX_LENGTH}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                  data-testid="chat-input"
                  placeholder="Say something"
                  // `inputStyles`, not a re-implementation of it. The
                  // hand-rolled copy dropped `placeholder:text-ink-faint`,
                  // so the placeholder rendered at ink/50 instead of the
                  // measured-4.80:1 token every other input in the app uses.
                  className={`${inputStyles} min-h-11`}
                />
              </label>
              {/* Only once it starts to matter. A counter on every keystroke
                  is noise; one that appears near the cap is a warning. */}
              {chatRemaining(draft.length) ? (
                <p
                  className="slot-label shrink-0 tabular-nums"
                  data-testid="chat-remaining"
                >
                  {chatRemaining(draft.length)}
                </p>
              ) : null}
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

          {/* A sentence, set as a sentence. It was 42 characters of 11px
              uppercase `slot-label` at wide tracking — the `all-caps-body`
              defect both previous critiques flagged, in a third place. */}
          {!connected ? (
            <p
              role="status"
              data-testid="chat-reconnecting"
              className="max-w-prose text-sm text-ink-soft"
            >
              {CHAT_UI.disconnected}
            </p>
          ) : null}
        </>
      ) : null}
    </Bank>
  );
}
