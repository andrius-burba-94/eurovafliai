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

type SlotState = "waiting" | "filled" | "live" | "correction";

const SLOT_RULE: Record<SlotState, string> = {
  waiting: "slot-waiting",
  filled: "slot-filled",
  live: "slot-live",
  // `slot-correction` has existed in `globals.css` since 1.4 and was
  // unreachable through this component: a row that had just been refused could
  // not be struck in ink, which is exactly what this system's error material
  // is for. The pool needed it so a refusal can be shown *on the row that was
  // tapped* rather than only above the search box.
  correction: "slot-correction",
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
  // A section with a heading it is not associated with is an unnamed region:
  // a screen reader lands in it and is told nothing, while the heading it
  // belongs to sits outside as a sibling. One `id` fixes it for every bank in
  // the app, which is every section on every surface.
  const headingId = `bank-${label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id={headingId} className="slot-label">
          {label}
        </h2>
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
  current = false,
  nowrap = false,
}: {
  state?: SlotState;
  landed?: boolean;
  children: ReactNode;
  testId?: string;
  className?: string;
  /**
   * Keep the row on one line, letting its primary content truncate instead of
   * pushing the trailing action onto a second.
   *
   * A wrapping row is right for a lobby, where a slot holds a name and a
   * label. It is wrong for a thirty-row pool: the action lands right-aligned
   * when it fits and left-aligned at x=32 when it does not, so the button a
   * thumb is reaching for moves between rows depending on how long the name
   * above it is, and rows run 59–107px instead of the 44 they should.
   *
   * Swapped rather than appended, because `flex-wrap` and `flex-nowrap` set the
   * same property: which one wins would come down to the order Tailwind emits
   * them in, not the order they are written here.
   */
  nowrap?: boolean;
  /**
   * The row a keyboard cursor is on. Drawn as a 2px **ink** outline inside the
   * row — the system's own focus material, in ink because marker is the
   * clock's — and announced as `aria-current`.
   *
   * It was a 5% ink wash alone, which measures **1.10:1**: the one place in
   * this system where a state was carried by a fill and no rule at all. The
   * wash stays as an echo; the outline is what carries it.
   */
  current?: boolean;
}) {
  return (
    <li
      data-testid={testId}
      data-state={state}
      data-landed={landed ? "true" : undefined}
      data-current={current ? "true" : undefined}
      aria-current={current ? "true" : undefined}
      className={`${SLOT_RULE[state]} ${landed ? "card-lands" : ""} ${
        current ? "bg-ink/5 outline-2 -outline-offset-2 outline-ink" : ""
      } ${className} flex ${
        nowrap ? "flex-nowrap" : "flex-wrap"
      } items-baseline justify-between gap-x-4 gap-y-1 px-3 ${state === "waiting" ? "py-2" : "py-3"}`}
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
      // Stated, not inherited. Tailwind's preflight sets `list-style: none` and
      // this is a flex column, and Safari + VoiceOver drop the list/listitem
      // roles from a `<ul>` styled that way — so on an iPhone, which is what
      // draft night is, "how many are there and which one am I on" stopped
      // being answerable. Costs nothing on every other engine.
      role="list"
      className="flex flex-col border-b border-rule-strong"
    >
      {children}
    </ul>
  );
}

/**
 * The name written on a card, in marker caps.
 *
 * `scale="slot"` is one step down, for the board's 7.5rem columns — the same
 * caps and the same 0.06em card-name tracking at body-small's size, because a
 * player in a slot on the board is still a name on a card and should not be
 * a bespoke class string. It exists because a full-size card name cannot write
 * "Valančiūnas" inside a board column, and a truncated name is not a name.
 */
export function CardName({
  children,
  scale = "card",
}: {
  children: ReactNode;
  scale?: "card" | "slot";
}) {
  return (
    <span
      className={`${scale === "slot" ? "text-sm" : "text-base"} font-semibold uppercase tracking-[0.06em]`}
    >
      {children}
    </span>
  );
}

/**
 * A patch's three parts, and why the border is 80% rather than 55%.
 *
 * The border separates the 10% wash inside it from the stock outside, so it has
 * to clear the 3:1 boundary floor against **both** neighbours, and the wash side
 * is the binding one. Measured with gamma compositing: `/55` was 2.22–2.26:1
 * against stock and worse against the wash; `/80` is 3.05–3.11:1 against the
 * wash and higher against stock. Still inside the 35–80% range DESIGN.md
 * declares — this settles the border half of its open question 7 rather than
 * moving the system.
 */
const PATCH: Record<"G" | "F" | "C", string> = {
  G: "text-pos-g border-pos-g/80 bg-pos-g/10",
  F: "text-pos-f border-pos-f/80 bg-pos-f/10",
  C: "text-pos-c border-pos-c/80 bg-pos-c/10",
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
/**
 * A field on card stock: a ruled line to write on.
 *
 * `/50`, not `/30`. DESIGN.md's own words are that the ruled line **is** the
 * input — it is the entire affordance, since there is no box, no fill and no
 * radius — so it is a boundary that means something and takes the 3:1 floor.
 * Measured with gamma compositing, `ink/30` was **1.87:1**, the lowest boundary
 * in the app; `/50` is 3.10:1. The same value the buttons moved to, for the
 * same reason.
 */
export const inputStyles =
  "min-h-11 w-full border-b border-ink/50 bg-transparent px-1 py-2 text-base " +
  "placeholder:text-ink-faint focus:border-live focus:outline-none";

/**
 * A filter, in the board's own material — slice 3.3, and the answer to
 * DESIGN.md's open question 3.
 *
 * The system had two focus idioms and no rule about which a new control type
 * should follow. The rule this settles on is **the element, not the role**: a
 * `<button>` takes the 2px marker outline at `focus-visible`, an `<input>` or
 * `<select>` turns its bottom rule marker red at `focus`. Both were already
 * shipped and both pass; the only thing missing was saying which is which.
 *
 * So a filter is a **button**, never a checkbox — which also keeps its state
 * where this system always puts it: in the control's own rule. Off is the
 * dashed waiting rule, on is a 2px solid ink rule. No chip, no pill, no
 * coloured dot, because the Material-Carries-State rule forbids exactly that.
 * Ink rather than marker, because a filter is not the one act on this surface
 * and must not compete with the pick that is.
 */
export function FilterToggle({
  pressed,
  onPressedChange,
  children,
  testId,
}: {
  pressed: boolean;
  onPressedChange: (next: boolean) => void;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      // `flex items-end pb-1.5` because the state is the rule *under the
      // label*, and `min-h-11` alone centred the label in a 44px box — leaving
      // the dashed rule sitting 18px below the word it belongs to, reading as a
      // stray tick rather than as the control's state. The target stays 44px.
      //
      // `min-w-11` because the rule DESIGN.md wrote was `min-h-11`, i.e. height
      // only, and a single-letter toggle fell straight through it: G, F and C
      // measured 24.5–26.5px wide. That clears WCAG 2.2 AA's 24px and fails
      // both AAA and this project's own written 44px.
      className={`slot-label flex min-h-11 min-w-11 items-end justify-center px-2 pb-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live ${
        pressed
          ? "border-b-2 border-ink text-ink"
          : "border-b border-dashed border-rule hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * A `<select>` on card stock. The same ruled line as `inputStyles`, and
 * therefore the same focus idiom — it holds a value, and it is an input
 * element.
 *
 * `appearance-none`, because a native select's own chrome is the one place a
 * rounded corner and a gradient would arrive in this app without anybody
 * choosing them.
 */
export const selectStyles =
  "min-h-11 w-full appearance-none border-b border-ink/50 bg-transparent px-1 py-2 " +
  "text-base focus:border-live focus:outline-none";

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
