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
import Link from "next/link";
import type { ReactNode } from "react";

type SlotState = "waiting" | "filled" | "live" | "correction" | "transit";

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
  // A row in your hand, on its way somewhere — 3.4b's cheat-sheet reorder.
  //
  // It is a *state* rather than a class the caller composes on, and that is a
  // correctness point rather than a tidiness one. The first version passed
  // `slot-filled` and added `slot-transit` through `className`, which requires
  // one `border-top` shorthand to reliably beat another at equal specificity —
  // and in the dev server's split stylesheets it does not. The computed style
  // came back **1px dashed**: the width from one rule and the style from the
  // other, a material that exists in neither. Two rules for one border is the
  // bug; one state is the fix.
  transit: "slot-transit",
};

/**
 * The board's top rail. Carries the wordmark and the season, and takes one
 * slot on the right for whatever action the surface owns.
 *
 * It carried the ground switch for eight days (9.5, 9.5a). Phase 10 removed it
 * with the second ground — there is one ground now, so there is nothing to
 * switch. See ADR-0006 for what that costs.
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
        <div className="flex shrink-0 items-baseline gap-1">{action}</div>
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
      id="main"
      data-testid={testId}
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-5 py-8 sm:gap-slot sm:px-8 sm:py-12"
    >
      {children}
    </main>
  );
}

/**
 * The route-level loading fallback: a sheet with one label and one waiting
 * slot, so a navigation shows the board's own shape rather than a spinner.
 *
 * Deliberately **not** a `Sheet`/`<main>`: the App Router streams this beside
 * the resolving page, and two `<main id="main">` would break the skip link
 * (slice 8.4). Same column measure, no landmark.
 */
export function LoadingSheet({ label }: { label: string }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-5 py-8 sm:gap-slot sm:px-8 sm:py-12">
      <p className="text-sm text-ink-soft" role="status">
        {label}
      </p>
      <div className="slot-waiting min-h-16" aria-hidden="true" />
    </div>
  );
}

/**
 * Marker-struck recovery control for `error.tsx` / `global-error.tsx`.
 * `SubmitButton` needs a form; these pages retry in place.
 */
export const retryButtonStyles =
  "min-h-11 min-w-11 w-full border-2 border-live px-4 py-3 text-slot font-semibold uppercase tracking-[0.14em] text-live focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live sm:w-auto";

/**
 * First-use / no-data copy inside a Bank. Test ids stay on this `<p>` so E2E
 * parent selectors still land on the framed Bank rather than a nested wrapper.
 */
export function EmptyNotice({
  children,
  testId,
}: {
  children: ReactNode;
  testId?: string;
}) {
  return (
    <p
      data-testid={testId}
      className="min-w-0 text-sm break-words text-ink-soft"
    >
      {children}
    </p>
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
  framed = false,
  testId,
}: {
  label: string;
  children: ReactNode;
  aside?: ReactNode;
  framed?: boolean;
  testId?: string;
}) {
  // A section with a heading it is not associated with is an unnamed region:
  // a screen reader lands in it and is told nothing, while the heading it
  // belongs to sits outside as a sibling. One `id` fixes it for every bank in
  // the app, which is every section on every surface.
  const headingId = `bank-${label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  return (
    <section
      aria-labelledby={headingId}
      data-testid={testId}
      data-framed={framed ? "true" : undefined}
      className={`${framed ? "bank-framed" : ""} flex flex-col gap-3`}
    >
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
 * A run of card blocks. The list counterpart of `Slots`, and separate from it
 * on purpose: `Slots` draws a ruled board (bottom rail, rules between rows)
 * and a run of blocks is a grid of separate objects with a gap between them.
 * Composing one out of the other produced a bottom rail under a gap.
 *
 * `role="list"` is stated for the same reason `Slots` states it: Safari and
 * VoiceOver drop the list roles from a `<ul>` that has `list-style: none` and
 * is a flex container, and draft night is iPhones.
 */
export function CardBlocks({
  children,
  testId,
  label,
  columns = false,
}: {
  children: ReactNode;
  testId?: string;
  label?: string;
  /**
   * Two across from `sm` up. Off by default because the phone is the primary
   * device and a thirteen-player roster in two columns on a 390px screen gives
   * each block about 170px, which cannot hold a name like Valančiūnas beside a
   * patch and a captain control.
   */
  columns?: boolean;
}) {
  return (
    <ul
      aria-label={label}
      data-testid={testId}
      role="list"
      className={`grid gap-2 ${columns ? "sm:grid-cols-2" : ""}`}
    >
      {children}
    </ul>
  );
}

/**
 * One card block: a single subject, segmented off the board.
 *
 * Level 1 of the depth scale and the material Phase 10 added — see
 * ADR-0006 and the `card-block` utility. A block groups a *subject* (a player
 * in a roster, a member's night); a framed `Bank` groups a *task*. They are the
 * same level, so a Bank may hold a run of blocks, and a block may not hold
 * another block.
 *
 * State is carried in the block's own border, the way a row's is carried in its
 * rule — never by a badge parked inside an otherwise normal block. The
 * `position` prop tints the left edge in the position's own hue, which is the
 * colour coding D22 asks for; the G/F/C letter still has to be printed by the
 * caller, because colour never carries position alone.
 */
export function CardBlock({
  children,
  testId,
  live = false,
  position,
  landed = false,
  className = "",
}: {
  children: ReactNode;
  testId?: string;
  /** This subject is on the clock. Drawn in the marker, at double weight. */
  live?: boolean;
  /**
   * A 3px edge in the position's hue, so a roster can be scanned by colour.
   *
   * It is a *border-left* rather than a wash across the block, because a wash
   * would put every figure in the block on a tinted field and re-open the
   * pairing `tokens.test.ts` measures for slots — at which point thirteen
   * blocks in three hues need their own contrast argument. An edge changes no
   * contrast at all, and the wash is already available to a row that wants it.
   */
  position?: "G" | "F" | "C";
  /** Plays the card-landing motion once. Inert under `prefers-reduced-motion`. */
  landed?: boolean;
  className?: string;
}) {
  return (
    <li
      data-testid={testId}
      data-state={live ? "live" : "filled"}
      data-position={position}
      className={`${live ? "card-block-live" : "card-block"} ${
        landed ? "card-lands" : ""
      } ${position && !live ? `border-l-3 ${BLOCK_EDGE[position]}` : ""} ${className} flex min-w-0 flex-col gap-2`}
    >
      {children}
    </li>
  );
}

/**
 * The position edge. Full-strength hue, not an alpha: it sits on panel stock
 * rather than on the ground, and an alpha edge would take its colour from
 * whichever surface the block happens to be on — the same mistake the patch's
 * background made before 3.4a, and the reason `PATCH` below carries an opaque
 * field. A 3px edge is a non-text boundary, and these clear 8.8:1 on a panel.
 */
const BLOCK_EDGE: Record<"G" | "F" | "C", string> = {
  G: "border-l-pos-g",
  F: "border-l-pos-f",
  C: "border-l-pos-c",
};

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

/**
 * A route out of the current board, drawn as one of its slots.
 *
 * The destination gets the whole row. Keeping the title, explanation and verb
 * here stops lobby and season doors from inventing different type and targets.
 */
export function Door({
  href,
  title,
  description,
  action,
  testId,
  state = "filled",
  actionTone = "ink",
  block = false,
}: {
  href: string;
  title: string;
  description: string;
  action: string;
  testId?: string;
  state?: SlotState;
  actionTone?: "ink" | "live";
  /**
   * Draw this door as a card block rather than as a ruled row.
   *
   * A door is a *destination*, which is a subject rather than an entry in a
   * ledger — so a run of them is the clearest case in the app for the Phase 10
   * material, and the reason the port lives here rather than in a new
   * component. The two renderings share this body deliberately: a door that
   * looked different depending on which surface built it is how the lobby and
   * the season pages drifted apart before this component existed.
   *
   * The Link's negative margins work unchanged because a card block's padding
   * is 0.75rem, the same as a slot's `px-3 py-3`.
   */
  block?: boolean;
}) {
  const body = (
    <Link
      href={href}
      data-testid={testId}
      className={`-mx-3 -my-3 flex min-h-11 flex-1 ${
        block ? "flex-col gap-2" : "flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
      } px-3 py-3 transition-colors hover:bg-ink/5 active:bg-ink/10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-live`}
    >
      <span className="flex min-w-0 flex-col gap-1">
        <CardName>{title}</CardName>
        <span className="min-w-0 text-sm break-words text-ink-soft">
          {description}
        </span>
      </span>
      <span
        className={`slot-label shrink-0 ${
          actionTone === "live" ? "text-live" : "text-ink"
        }`}
      >
        {action} &rarr;
      </span>
    </Link>
  );

  // `state` maps onto the block's own material the way it maps onto a row's
  // rule: "live" is the marker at double weight, everything else is the resting
  // border. A door is never `transit` or `correction`, so those collapse here
  // rather than inventing two more block materials nothing would render.
  return block ? (
    <CardBlock live={state === "live"}>
      {body}
    </CardBlock>
  ) : (
    <Slot state={state}>{body}</Slot>
  );
}

export function Slots({
  children,
  testId,
  label,
}: {
  children: ReactNode;
  testId?: string;
  /**
   * An accessible name for the run.
   *
   * Added in 3.4a's critique, which found the cheat sheet rendering its three
   * tier runs as three *unnamed* sibling lists — "list, 4 items" three times,
   * where the tier is the entire point of the structure. The visible caption
   * was a `<p>` outside the `<ul>` with nothing wiring the two together.
   *
   * It is a prop rather than something each caller hand-rolls because this
   * component is the only place that knows it renders a `<ul>`: a caller
   * adding `aria-labelledby` from outside has to know that, and half of them
   * will not.
   */
  label?: string;
}) {
  // The frame closes the run the way a board's bottom rail does, at the heavier
  // of the two rule weights.
  return (
    <ul
      aria-label={label}
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
      className={`${scale === "slot" ? "text-sm" : "text-base"} min-w-0 break-words font-semibold uppercase tracking-[0.06em]`}
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
/**
 * The patch carries **its own field**, opaque, rather than tinting whatever is
 * behind it.
 *
 * A 10% alpha background made the letter's contrast depend on the row it
 * happened to sit in. On stock that is 4.54–4.64:1; on the live blush of an
 * armed pool row it composites to **4.10–4.18:1**, under the 4.5 floor —
 * measured in a browser by 3.4a's critique. `pick-form.tsx` reasons carefully
 * about `ink-faint` (4.37) and the Pick label (4.15) on that same blush and
 * dodges both; the patch was never considered, and it is the one element that
 * exists to be the colour-blind fallback for position.
 *
 * `color-mix(…, var(--color-stock))` pre-composites the same tint against the
 * ground once, so the patch reads identically in every state — which is what a
 * patch *is*: a thing laid on the board, not a tint of the board. The border
 * stays an alpha because it is a boundary and is measured against both sides.
 *
 * `tokens.test.ts` reads this map and fails if the alpha comes back; it cannot
 * be caught by arithmetic over `globals.css`, because the difference is here.
 */
const PATCH: Record<"G" | "F" | "C", string> = {
  G: "text-pos-g border-pos-g/80 bg-[color-mix(in_oklab,var(--color-pos-g)_10%,var(--color-stock))]",
  F: "text-pos-f border-pos-f/80 bg-[color-mix(in_oklab,var(--color-pos-f)_10%,var(--color-stock))]",
  C: "text-pos-c border-pos-c/80 bg-[color-mix(in_oklab,var(--color-pos-c)_10%,var(--color-stock))]",
};

/**
 * A twill position patch. The letter is always present: colour never carries
 * position on its own, for colour-blind readers and for a photocopied sheet.
 */
export function PositionPatch({
  position,
  count,
  label,
}: {
  position: "G" | "F" | "C";
  count?: number | string;
  label?: string;
}) {
  return (
    <span
      // A label needs a role: a bare span with aria-label is prohibited
      // (axe aria-prohibited-attr). `img` is the right fit for a badge whose
      // visible letters are decorative once the label names the need.
      role={label ? "img" : undefined}
      aria-label={label}
      className={`${PATCH[position]} inline-flex items-baseline gap-1 border px-2 py-1 text-slot font-semibold tracking-[0.1em]`}
    >
      {count === undefined ? null : (
        <span aria-hidden={label ? "true" : undefined}>{count}</span>
      )}
      <span aria-hidden={label ? "true" : undefined}>{position}</span>
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
            <span className="stat w-6 shrink-0 pt-0.5 text-right text-slot text-ink-faint">
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
/**
 * The way back, at a real tap target.
 *
 * Every surface hand-rolled this link, and every one of them was **16px tall**
 * — 32px on a phone only because the label wrapped to two lines. DESIGN.md's
 * own Do says 44px on *both* axes and records `FilterToggle` learning it the
 * hard way; the rail's back links fell straight through the same gap, and
 * 3.4a's critique measured them (`The room` 83.8×32 mobile, 90.3×16 desktop).
 *
 * `items-center` with `min-h-11` rather than padding, so the label keeps its
 * position on the rail and only the box grows. `whitespace-nowrap` because the
 * two-line wrap was the only reason the mobile number was not 16 either.
 */
export function BackLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="slot-label inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
    >
      <BackArrow />
      {children}
    </Link>
  );
}

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

/* `SunIcon` and `MoonIcon` stood here for the ground switch and went with it in
 * Phase 10. The recipe they established survives in DESIGN.md: draw on 16 units
 * and render at 18px so the stroke lands a shade over 1px, and size a set
 * against each other rather than to a shared box. 10.6's sparkline is the next
 * thing to follow it. */
