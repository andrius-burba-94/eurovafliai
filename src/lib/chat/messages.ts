import { formatSignedTenths } from "@/lib/stats/scoring";

/**
 * What the app says in chat, and nothing about how it is stored.
 *
 * Pure, and one exported function per event — which is the point rather than a
 * style. #54's copy defects all came from strings assembled inside JSX out of
 * conditional fragments: a sentence spliced from three pieces rendered "and so
 * does rank,tier,name", a confirmation branched on the wrong number, and a list
 * joined with " and " so three items read "A and B and C". None of it was
 * visible to a test, because none of it was a function.
 *
 * These are functions, so `messages.test.ts` reads every sentence the app can
 * utter as text — including the singular/plural and zero branches, which is
 * where that family of bug lives.
 *
 * ## House style for a system line
 *
 * - **A whole sentence, ending in a full stop.** These sit in a run with
 *   people's own messages and a verbless fragment reads like a broken one.
 * - **Names as written**, never truncated here; the surface truncates.
 * - **No "you".** The same row is read by twelve people, and a line that says
 *   "you" is wrong for eleven of them. `announcePick` therefore names the team,
 *   not the reader.
 * - **Nothing a screen reader has to see to understand.** The line is the whole
 *   message; the rail-blue colour and the missing author are decoration on top.
 */

/** Pick numbers read as "#7" everywhere in this app. One format, not three. */
const at = (overallNo: number) => `#${overallNo}`;

export function announcePick(input: {
  readonly teamName: string;
  readonly playerName: string;
  readonly overallNo: number;
  readonly round: number;
  readonly isAuto: boolean;
}): string {
  // "drafted" for a person's own pick, "autodrafted" when the worker did it.
  // The distinction is the ticker's one editorial contribution and it is worth
  // keeping: a member coming back to their phone wants to know whether the app
  // picked for them.
  const verb = input.isAuto ? "autodrafted" : "drafted";
  return `${input.teamName} ${verb} ${input.playerName} at ${at(input.overallNo)}, round ${input.round}.`;
}

export function announcePause(paused: boolean): string {
  return paused
    ? "The draft is paused. Nobody is on the clock."
    : "The draft is running again.";
}

/**
 * A rollback — the line this whole slice exists for.
 *
 * It names the count *and* the pick it rewound to, because "the draft was rolled
 * back" tells somebody who was away nothing about whether their pick survived.
 */
export function announceRollback(input: {
  readonly discarded: number;
  readonly toPick: number;
  readonly byTeamName: string;
}): string {
  const picks = input.discarded === 1 ? "pick" : "picks";
  return `${input.byTeamName} rolled the draft back to ${at(input.toPick)}, discarding ${input.discarded} ${picks}. The draft is paused.`;
}

export function announceRoll(input: {
  readonly order: readonly string[];
  readonly reshuffle: boolean;
}): string {
  const verb = input.reshuffle ? "reshuffled" : "rolled";
  // The whole order, in order. It is the one announcement people will scroll
  // back to, and a first-and-last summary would be the fact they least want.
  const list = input.order.map((team, index) => `${index + 1}. ${team}`).join(" · ");
  return input.order.length === 0
    ? `The draft order was ${verb}.`
    : `The draft order was ${verb}: ${list}.`;
}

export function announceStartOver(byTeamName: string): string {
  return `${byTeamName} started the draft over. Every pick was discarded and the draft order was kept.`;
}

export function announceComplete(rounds: number): string {
  return `The draft is complete after ${rounds} ${rounds === 1 ? "round" : "rounds"}. Rosters are set.`;
}

function nameList(names: readonly string[]): string {
  if (names.length === 0) return "nobody";
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function announceTrade(input: {
  readonly teamA: string;
  readonly teamB: string;
  readonly sent: readonly string[];
  readonly received: readonly string[];
  readonly fromRound: number;
}): string {
  return `${input.teamA} traded ${nameList(input.sent)} to ${input.teamB} for ${nameList(input.received)}, counting from round ${input.fromRound}.`;
}

export function announceDrop(input: {
  readonly teamName: string;
  readonly players: readonly string[];
  readonly fromRound: number;
}): string {
  return `${input.teamName} dropped ${nameList(input.players)}, counting from round ${input.fromRound}.`;
}

export function announceAdd(input: {
  readonly teamName: string;
  readonly players: readonly string[];
  readonly fromRound: number;
}): string {
  return `${input.teamName} signed ${nameList(input.players)}, counting from round ${input.fromRound}.`;
}

export function announceImpact(input: {
  readonly type: "trade" | "add" | "drop";
  readonly deltaTenths: number;
}): string {
  const noun =
    input.type === "trade" ? "trade" : input.type === "add" ? "signing" : "drop";
  return `This ${noun} is ${formatSignedTenths(input.deltaTenths)} fantasy so far.`;
}

/** How long a member must wait between messages, and how long one may be. */
export const CHAT_MIN_GAP_MS = 1500;
export const CHAT_MAX_LENGTH = 2000;

export type ChatRefusal =
  | { readonly ok: true; readonly body: string }
  | { readonly ok: false; readonly error: string };

/**
 * Is this message allowed, and what exactly gets stored?
 *
 * Pure so the rate limit is testable without a clock or a database: `now` and
 * `lastAt` are arguments, which is the same discipline the engine follows for
 * every deadline it enforces.
 *
 * The gap is deliberately small. This is eight friends in one room, not a public
 * channel — the limit exists so a held-down paste key cannot fill the transcript
 * of draft night, not to police anybody. A refusal is a sentence, never a
 * silent drop.
 */
export function checkMessage(input: {
  readonly body: string;
  readonly now: number;
  readonly lastAt: number | null;
}): ChatRefusal {
  const body = input.body.trim();
  if (body.length === 0) {
    return { ok: false, error: "Write something first." };
  }
  if (body.length > CHAT_MAX_LENGTH) {
    return {
      ok: false,
      error: `That is longer than ${CHAT_MAX_LENGTH} characters. Shorten it and send again.`,
    };
  }
  if (input.lastAt !== null) {
    const waited = input.now - input.lastAt;
    if (waited < CHAT_MIN_GAP_MS) {
      return { ok: false, error: "Slow down a moment, then send it again." };
    }
  }
  return { ok: true, body };
}

/**
 * The panel's own strings.
 *
 * These lived in JSX until 3.5's critique pointed out the obvious: this file
 * exists *because* strings assembled in JSX shipped four copy defects in #54,
 * and then the component that reads it assembled five of its own — three of
 * them sentence fragments sitting in a run of full-stopped sentences. They are
 * functions now, and `messages.test.ts` reads them as prose like everything
 * else.
 */
export const CHAT_UI = {
  /** The closed panel, when there is nothing to show yet. */
  emptyLatest: "Nothing said yet.",
  /** The open panel, same case. */
  empty:
    "Nothing said yet. Picks, pauses and rollbacks are announced here as they happen.",
  /** A retracted message, in place of its body. */
  retracted: "Message deleted.",
  /** The realtime stream is down. A sentence, not a shouted label. */
  disconnected: "Reconnecting, so new messages may be missing.",
  /** The transcript region, named for a screen reader and the tab order. */
  transcriptLabel: "League chat transcript",
  /** Prefix on a system line, read instead of a team name. */
  systemPrefix: "The app: ",
} as const;

/** "45 messages" / "1 message" — the panel's total, always the total. */
export function chatTotal(count: number): string {
  return `${count} ${count === 1 ? "message" : "messages"}`;
}

/** "3 new" — unseen since this viewer last read it. */
export function chatUnread(count: number): string {
  return `${count} new`;
}

/** How close to the cap before the count is worth showing. */
export const CHAT_LENGTH_WARN_AT = CHAT_MAX_LENGTH - 200;

/** "1,847 / 2,000" — only once it starts to matter. */
export function chatRemaining(length: number): string | null {
  if (length < CHAT_LENGTH_WARN_AT) return null;
  return `${length.toLocaleString("en-GB")} / ${CHAT_MAX_LENGTH.toLocaleString("en-GB")}`;
}

/**
 * A message's time, for a `<time>` element.
 *
 * The ISO string goes in `dateTime`; this is the human half. CONTEXT.md calls
 * chat "the record of draft night" and a record read the morning after needs a
 * clock — 3.5 shipped without one, which was the critique's Recognition
 * finding.
 *
 * Hours and minutes only, 24-hour, no seconds and no date: draft night is one
 * sitting, and a date on every row of a hundred-and-fifty-line transcript is
 * noise. A day separator is the answer if this ever spans one, and it is not
 * this slice's job.
 */
export function chatTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return at.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
