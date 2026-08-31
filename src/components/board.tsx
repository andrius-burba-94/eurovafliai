/**
 * The board's own components — the shared vocabulary every surface is built
 * from. See DESIGN.md and the direction contract in `src/app/layout.tsx`.
 *
 * The world is the physical draft board: ruled bays on card stock. A bay is
 * `waiting` (dashed rule) or `filled` (solid rule) or `live` (struck in the
 * commissioner's marker). That is the entire state language, and it is carried
 * by the row's own material — never by a coloured pill parked beside a
 * normal-looking row.
 */
import type { ReactNode } from "react";

type BayState = "waiting" | "filled" | "live";

const BAY_RULE: Record<BayState, string> = {
  waiting: "bay-waiting",
  filled: "bay-filled",
  live: "bay-live",
};

/**
 * The board's top rail. Carries the wordmark and the season, and takes one
 * slot on the right for whatever action the surface owns.
 */
export function TopRail({ action }: { action?: ReactNode }) {
  return (
    <header className="border-b border-rail/25">
      <div className="mx-auto flex w-full max-w-3xl items-baseline justify-between gap-4 px-5 py-4 sm:px-8">
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="whitespace-nowrap text-base font-semibold uppercase tracking-[0.16em]">
            Eurovafliai
          </span>
          {/* The season is orientation, not identity: on a phone the rail has
              room for the wordmark and the action, and nothing else. */}
          <span className="slot-label hidden whitespace-nowrap sm:inline">
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
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-5 py-8 sm:gap-bay sm:px-8 sm:py-12"
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
 * One bay. `landed` plays the card-landing motion once — reserved for a row
 * that has just arrived, and inert under `prefers-reduced-motion`.
 */
export function Bay({
  state = "filled",
  landed = false,
  children,
  testId,
}: {
  state?: BayState;
  landed?: boolean;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <li
      data-testid={testId}
      data-state={state}
      className={`${BAY_RULE[state]} ${landed ? "card-lands" : ""} flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 ${state === "waiting" ? "py-2" : "py-3"}`}
    >
      {children}
    </li>
  );
}

export function Bays({
  children,
  testId,
}: {
  children: ReactNode;
  testId?: string;
}) {
  // The last rule closes the run of bays, the way the bottom rail closes a board.
  return (
    <ul
      data-testid={testId}
      className="flex flex-col border-b border-rule [&>li:last-child]:border-b-0"
    >
      {children}
    </ul>
  );
}

/** The name written on a card, in marker caps. */
export function CardName({ children }: { children: ReactNode }) {
  return (
    <span className="text-[0.9375rem] font-semibold uppercase tracking-[0.06em]">
      {children}
    </span>
  );
}

const PATCH: Record<"G" | "F" | "C", string> = {
  G: "text-pos-g",
  F: "text-pos-f",
  C: "text-pos-c",
};

/**
 * A twill position patch. The letter is always present: colour never carries
 * position on its own, for colour-blind readers and for photocopied clarity.
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
      className={`${PATCH[position]} inline-flex items-baseline gap-1 border border-current/35 px-1.5 py-0.5 text-slot font-semibold tracking-[0.1em]`}
    >
      {count === undefined ? null : <span>{count}</span>}
      <span>{position}</span>
    </span>
  );
}

/**
 * The board's action. A bay you can press: full width on a phone, because the
 * primary action belongs in the first empty bay rather than in a floating
 * button.
 */
export function BoardButton({
  children,
  testId,
  tone = "ink",
}: {
  children: ReactNode;
  testId?: string;
  tone?: "ink" | "live";
}) {
  const tones = {
    ink: "border-ink/30 hover:border-ink/70",
    live: "border-live/45 text-live hover:border-live",
  };
  return (
    <button
      type="submit"
      data-testid={testId}
      className={`${tones[tone]} w-full border px-4 py-3 text-slot font-semibold uppercase tracking-[0.14em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live sm:w-auto`}
    >
      {children}
    </button>
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
      {/* Fainter than a Bank label on purpose: the two stack, and two identical
          small-caps labels read as one confused heading. */}
      <span className="slot-label text-ink-faint">{label}</span>
      {children}
    </label>
  );
}

export const inputStyles =
  "w-full border-b border-ink/25 bg-transparent px-1 py-2 text-base " +
  "placeholder:text-ink-faint focus:border-live focus:outline-none";

/** Something went wrong, struck in marker like a correction on the board. */
export function Correction({
  children,
  testId,
}: {
  children: ReactNode;
  testId?: string;
}) {
  return (
    <p
      data-testid={testId}
      role="alert"
      className="bay-live px-3 py-3 text-sm text-ink"
    >
      {children}
    </p>
  );
}

/**
 * The empty wall, drawn at plan scale: 13 draft rounds down, one column per
 * bay across. It carries no data — it is a depiction of the board a league is
 * about to fill, which is why it is hidden from assistive tech rather than
 * described. It exists because the thesis of this surface is "the app is the
 * draft board wall", and a sign-in page that shows none of it is a claim
 * without a demonstration.
 */
export function BoardPlan({ bays = 8, rounds = 13 }: { bays?: number; rounds?: number }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <p className="slot-label">The wall</p>
        <p className="slot-label text-ink-faint">
          {rounds} rounds &times; {bays} bays
        </p>
      </div>
      {/* Round numbers down the left edge: without them this is a texture, and
          the point is that it is legibly thirteen rounds deep. */}
      <div className="flex flex-col">
        {Array.from({ length: rounds }, (_, round) => (
          <div key={round} className="flex items-stretch gap-2">
            <span className="w-6 shrink-0 pt-1 text-right text-slot tabular-nums text-ink-faint">
              {round + 1}
            </span>
            <div
              className="grid flex-1 border-t border-l border-rule"
              style={{ gridTemplateColumns: `repeat(${bays}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: bays }, (_, bay) => (
                <div
                  key={bay}
                  className={`h-5 border-r border-b border-dashed border-rule sm:h-6 ${
                    round === rounds - 1 ? "border-b-solid" : ""
                  }`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
