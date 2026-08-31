/**
 * The board's own components — the shared vocabulary every surface is built
 * from. See DESIGN.md and the direction contract in `src/app/layout.tsx`.
 *
 * The world is the physical draft board: card stock ruled into slots. A slot is
 * `waiting` (thin dashed rule), `filled` (solid, darker) or `live` (struck in
 * the commissioner's marker at double weight). That is the entire state
 * language, and it is carried by the row's own material — never by a coloured
 * pill parked beside an otherwise normal row.
 *
 * The words are CONTEXT.md's: a **slot** is a position on the **board**. An
 * earlier draft of this file invented "bay" and put it in a page headline,
 * which is exactly the drift CONTEXT.md exists to prevent.
 */
import type { ReactNode } from "react";

type SlotState = "waiting" | "filled" | "live";

const SLOT_RULE: Record<SlotState, string> = {
  waiting: "slot-waiting",
  filled: "slot-filled",
  live: "slot-live",
};

/**
 * The board's top rail. Carries the wordmark and the season, and takes one
 * slot on the right for whatever action the surface owns.
 */
export function TopRail({ action }: { action?: ReactNode }) {
  return (
    <header className="border-b border-rail/40">
      <div className="mx-auto flex w-full max-w-3xl items-baseline justify-between gap-3 px-5 py-4 sm:px-8">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
          <span className="whitespace-nowrap text-base font-semibold uppercase tracking-[0.16em]">
            Eurovafliai
          </span>
          {/* The season stays on the phone. It is the first clause of the
              contracted rail, it fits, and hiding it made the primary device
              the one place the rail was incomplete. */}
          <span className="slot-label whitespace-nowrap">
            Euroleague 2026&ndash;27
          </span>
        </div>
        {action}
      </div>
    </header>
  );
}

/** The page's own column. One measure, so every surface lines up with the next. */
export function Sheet({
  children,
  testId,
}: {
  children: ReactNode;
  testId?: string;
}) {
  return (
    <main
      data-testid={testId}
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-5 py-8 sm:gap-slot sm:px-8 sm:py-12"
    >
      {children}
    </main>
  );
}

/**
 * A section of the board. The heading is a slot label, so a section reads as a
 * column head on the wall rather than as a card in a stack of cards.
 */
export function Bank({
  label,
  children,
  aside,
}: {
  label: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="slot-label">{label}</h2>
        {aside ? <span className="slot-label">{aside}</span> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * One slot. `landed` plays the card-landing motion once — reserved for the row
 * that has genuinely just arrived, and inert under `prefers-reduced-motion`.
 */
export function Slot({
  state = "filled",
  landed = false,
  children,
  testId,
  className = "",
}: {
  state?: SlotState;
  landed?: boolean;
  children: ReactNode;
  testId?: string;
  className?: string;
}) {
  return (
    <li
      data-testid={testId}
      data-state={state}
      data-landed={landed ? "true" : undefined}
      className={`${SLOT_RULE[state]} ${landed ? "card-lands" : ""} ${className} flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 ${state === "waiting" ? "py-2" : "py-3"}`}
    >
      {children}
    </li>
  );
}

export function Slots({
  children,
  testId,
}: {
  children: ReactNode;
  testId?: string;
}) {
  // The frame closes the run the way a board's bottom rail does, at the heavier
  // of the two rule weights.
  return (
    <ul
      data-testid={testId}
      className="flex flex-col border-b border-rule-strong"
    >
      {children}
    </ul>
  );
}

/** The name written on a card, in marker caps. */
export function CardName({ children }: { children: ReactNode }) {
  return (
    <span className="text-base font-semibold uppercase tracking-[0.06em] sm:text-[1.0625rem]">
      {children}
    </span>
  );
}

const PATCH: Record<"G" | "F" | "C", string> = {
  G: "text-pos-g border-pos-g/55 bg-pos-g/10",
  F: "text-pos-f border-pos-f/55 bg-pos-f/10",
  C: "text-pos-c border-pos-c/55 bg-pos-c/10",
};

/**
 * A twill position patch. The letter is always present: colour never carries
 * position on its own, for colour-blind readers and for a photocopied sheet.
 */
export function PositionPatch({
  position,
  count,
}: {
  position: "G" | "F" | "C";
  count?: number;
}) {
  return (
    <span
      className={`${PATCH[position]} inline-flex items-baseline gap-1 border px-2 py-1 text-slot font-semibold tracking-[0.1em]`}
    >
      {count === undefined ? null : <span>{count}</span>}
      <span>{position}</span>
    </span>
  );
}

/** A field on the sheet. Label above, rule under: a form on card stock. */
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      {/* A field label sits under a Bank label, so the two must differ — but
          downward, and never by contrast. Semibold at tight tracking made
          "LEAGUE NAME" outweigh its own heading "START A LEAGUE"; making it
          fainter (the first attempt) put it at 2.96:1. So: same ink, lighter
          weight, tighter tracking than the Bank's 0.14em. */}
      <span className="text-slot font-normal uppercase tracking-[0.06em] text-ink-soft">
        {label}
      </span>
      {children}
    </label>
  );
}

/** 44px minimum: draft night is one-handed, on a phone (PRODUCT.md). */
export const inputStyles =
  "min-h-11 w-full border-b border-ink/30 bg-transparent px-1 py-2 text-base " +
  "placeholder:text-ink-faint focus:border-live focus:outline-none";

/**
 * A correction on the board — struck in ink, not in marker.
 *
 * The marker means one thing only, who is on the clock, so an error that
 * borrowed it made a failure and an invite code render identically.
 */
export function Correction({
  children,
  testId,
}: {
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      role="alert"
      className="slot-correction flex flex-col gap-1 px-3 py-3"
    >
      <span className="slot-label">Correction</span>
      <p className="text-sm text-ink">{children}</p>
    </div>
  );
}

/**
 * The board itself, drawn at plan scale: 13 draft rounds down, one column per
 * slot across. It carries no data — it is a depiction of the board a league
 * fills, which is why it is hidden from assistive tech rather than described.
 *
 * It exists because the thesis of this app is "the app is the draft board", and
 * a surface that shows none of it is a claim without a demonstration.
 */
export function BoardPlan({
  slots = 12,
  rounds = 13,
  caption,
}: {
  slots?: number;
  rounds?: number;
  caption?: string;
}) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <p className="slot-label">The board</p>
        <p className="slot-label">
          {caption ?? `${rounds} rounds × ${slots} slots`}
        </p>
      </div>
      {/* Round numbers down the left edge: without them this is a texture, and
          the point is that it is legibly thirteen rounds deep. */}
      <div className="flex flex-col border-t border-rule-strong">
        {Array.from({ length: rounds }, (_, round) => (
          <div key={round} className="flex items-stretch gap-2">
            <span className="w-6 shrink-0 pt-0.5 text-right text-slot tabular-nums text-ink-faint">
              {round + 1}
            </span>
            <div
              className="grid flex-1 border-l border-rule-strong"
              style={{
                gridTemplateColumns: `repeat(${slots}, minmax(0, 1fr))`,
              }}
            >
              {Array.from({ length: slots }, (_, slot) => (
                <div
                  key={slot}
                  className={
                    round === rounds - 1
                      ? "h-5 border-r border-b border-dashed border-rule border-b-rule-strong [border-bottom-style:solid] sm:h-6"
                      : "h-5 border-r border-b border-dashed border-rule sm:h-6"
                  }
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A short arrow drawn in the board's own grammar: one stroke, no icon font. */
export function BackArrow() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 8"
      className="h-2 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
    >
      <path d="M11.5 4H1M4 1L1 4l3 3" />
    </svg>
  );
}
