"use client";

import { useEffect, useRef, useState } from "react";

import { Bank, CardName, Door, Slot, Slots } from "@/components/board";
import {
  COUNTDOWN_MS,
  isDrawn,
  rollCeremony,
  type RollCeremony as Ceremony,
} from "@/lib/roll/ceremony";

type Seat = {
  readonly id: string;
  readonly position: number;
  readonly name: string;
  readonly isYou: boolean;
};

/**
 * The draw, as the room watches it.
 *
 * ## The composition
 *
 * One focal block — the announcer — over the order it is filling in. The
 * announcer's largest element is always a figure in the mono face: the seconds
 * remaining, then the slot being drawn, then `01`. So the page has exactly one
 * thing to look at and it never moves, while what it *says* changes three
 * times. The list below is the record; the announcer is the broadcast.
 *
 * ## The board fills upward
 *
 * The order reads `01` at the top, as it does everywhere else in the app, and
 * the draw walks from the **last** slot to the first — so the places still
 * empty are always the ones above, and the last name to land is the one that
 * picks first. A draw that revealed the first pick in its opening second would
 * have no reason to take its time.
 *
 * Every empty place is drawn (DESIGN.md's Board-Shows-Its-Shape Rule), with its
 * number already on it. The numbers were never the secret — `01` to `12` are
 * known before anyone presses anything. The secret is *who*, so a slot not yet
 * drawn shows its number and no name.
 *
 * ## Ticking
 *
 * A 250ms interval, not 1000ms: a clock driven at exactly its display interval
 * shows some seconds for two frames and others for a whole second, because the
 * interval is never phase-aligned with the instant it is measuring. Ticking
 * faster than the smallest thing that changes is what keeps the count even.
 * Nothing is computed here — every tick just re-asks the pure function.
 */
export function RollCeremony({
  leagueId,
  leagueName,
  order,
  rolledAt,
  initial,
}: {
  leagueId: string;
  leagueName: string;
  order: readonly Seat[];
  rolledAt: number;
  /** The phase the server computed for this request — the first paint. */
  initial: Ceremony;
}) {
  const slots = order.length;

  const [ceremony, setCeremony] = useState<Ceremony>(initial);
  const [skipped, setSkipped] = useState(false);
  /** The server's clock minus this device's, in milliseconds. */
  const offset = useRef(0);

  // The draft room's own correction, for the same invariant (§4) and by the
  // same method: ask the server once, halve the round trip, count against
  // `Date.now() + offset`. A failed fetch leaves the offset at zero and the
  // ceremony runs on the local clock — less exact, still shared, and unable to
  // decide anything, because this page only ever displays.
  useEffect(() => {
    let cancelled = false;
    const sentAt = Date.now();
    fetch("/api/time", { cache: "no-store" })
      .then((response) => response.json())
      .then((body: { now?: number }) => {
        if (cancelled || typeof body.now !== "number") return;
        const roundTrip = Date.now() - sentAt;
        offset.current = body.now + roundTrip / 2 - Date.now();
      })
      .catch(() => {
        // Offset zero. The countdown still counts.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (skipped) return;

    const tick = () => {
      const next = rollCeremony({
        rolledAt,
        now: Date.now() + offset.current,
        slots,
      });
      setCeremony(next);
      if (!next.live) clearInterval(timer);
    };

    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [rolledAt, slots, skipped]);

  const done = skipped || ceremony.phase === "complete";
  const revealedCount = done ? slots : ceremony.revealedCount;
  const first = order.find((seat) => seat.position === 1);
  const landedSeat = order.find((seat) => seat.position === ceremony.landed);

  return (
    <>
      {/* The page's name is small on purpose, and it is the one place in this
          app where that is true. Display size is the app's loudest voice and
          there is exactly one per surface (DESIGN.md); on this surface it
          belongs to the name being drawn, not to the word "roll". Rendered at
          display size, the title was the loudest thing on screen and the answer
          to the whole ceremony was 16px underneath it, the hierarchy exactly
          inverted. It stays an `h1`: heading level is document structure, not a
          type size. */}
      <div className="flex flex-col gap-1">
        <h1 className="slot-label text-ink">The roll</h1>
        <span className="slot-label text-ink-soft">
          {leagueName} &middot; {slots} {slots === 1 ? "team" : "teams"}
        </span>
      </div>

      {/* The announcer. `role="status"` rather than `alert`: it is the running
          state of the page, not an interruption — and PRODUCT.md asks for the
          clock to be perceivable without looking at the screen. Polite, so a
          screen reader finishes the name it is on before taking the next. */}
      <div
        data-testid="roll-announcer"
        role="status"
        aria-live="polite"
        className="flex flex-col items-center gap-3 py-4 text-center sm:py-8"
      >
        {done ? (
          <>
            <span className="slot-label text-ink-soft">First pick</span>
            {/* No figure here, and that is the phase difference rather than an
                omission. The numeral's two jobs were counting and locating, and
                at the end there is nothing left to count: the answer is a name.
                The same template three times would have made the climax read as
                one more step. `01` is on the row below, where it belongs. */}
            <p
              data-testid="roll-name"
              className="text-3xl font-semibold tracking-[0.04em] break-words text-balance uppercase sm:text-4xl"
            >
              {first?.name ?? "—"}
            </p>
            <p className="text-sm text-ink-soft">
              The order is set. Every slot below is final.
            </p>
          </>
        ) : ceremony.phase === "countdown" ? (
          <>
            <span className="slot-label text-ink-soft">Drawing in</span>
            <span data-testid="roll-figure" className="roll-clock text-live">
              {ceremony.secondsLeft}
            </span>
            {/* The countdown, drawn as the board's own material: one rule,
                shortening. Stepped rather than eased — it is a clock, and a
                clock that slides between seconds is harder to read than one
                that ticks. No progress-bar component and nothing rounded. */}
            <span
              aria-hidden="true"
              className="flex h-0.5 w-full max-w-64 bg-rule/40"
            >
              <span
                data-testid="roll-ruler"
                className="h-0.5 bg-live"
                style={{
                  width: `${(ceremony.secondsLeft / (COUNTDOWN_MS / 1000)) * 100}%`,
                }}
              />
            </span>
            <p className="text-sm text-ink-soft">
              Everyone in the league is watching this same count.
            </p>
          </>
        ) : (
          <>
            <span className="slot-label text-ink-soft">
              Slot {String(ceremony.landed).padStart(2, "0")}
            </span>
            <span data-testid="roll-figure" className="roll-clock text-live">
              {String(ceremony.landed).padStart(2, "0")}
            </span>
            <p
              data-testid="roll-name"
              className="text-3xl font-semibold tracking-[0.04em] break-words text-balance uppercase sm:text-4xl"
            >
              {landedSeat?.name ?? "—"}
            </p>
            <p className="text-sm text-ink-soft">
              {ceremony.landed === 1
                ? "And that is the first pick."
                : `${ceremony.landed - 1} ${ceremony.landed - 1 === 1 ? "slot" : "slots"} still to draw.`}
            </p>
          </>
        )}
      </div>

      <Bank
        label="The order"
        aside={
          <span data-testid="roll-drawn-tally">
            {revealedCount} of {slots} drawn
          </span>
        }
        framed
      >
        <Slots testId="roll-order">
          {order.map((seat) => {
            const drawn = isDrawn(seat.position, { slots, revealedCount });
            return (
              <Slot
                key={seat.id}
                testId="roll-slot"
                state={drawn ? "filled" : "waiting"}
              >
                <span
                  className={`stat ${drawn ? "text-ink" : "text-ink-faint"}`}
                >
                  {String(seat.position).padStart(2, "0")}
                </span>
                {drawn ? (
                  // Keyed on the position so React mounts a new element when a
                  // slot is drawn, which is what starts the animation. Without
                  // the key the row would already exist and the utility would
                  // have nothing to play on.
                  <span
                    key={`drawn-${seat.position}`}
                    className="slot-drawn flex flex-wrap items-baseline gap-x-3"
                  >
                    <CardName>{seat.name}</CardName>
                    {seat.isYou ? (
                      <span className="slot-label text-ink-soft">you</span>
                    ) : null}
                  </span>
                ) : (
                  <span className="slot-label text-ink-faint">Not drawn</span>
                )}
              </Slot>
            );
          })}
        </Slots>
      </Bank>

      {done ? (
        <Slots>
          <Door
            href={`/leagues/${leagueId}`}
            testId="roll-to-lobby"
            title="Back to the lobby"
            description="Mark yourself ready, write a cheat sheet, or start the draft."
            action="Open the lobby"
            actionTone="live"
          />
        </Slots>
      ) : (
        /* Ink, not marker: skipping is a way out, not the act this page is
           for. Anyone on a slow phone, or rejoining an order they have already
           seen, should not be held here — and `prefers-reduced-motion` is
           honoured by the animation itself rather than by this control. */
        <button
          type="button"
          data-testid="roll-skip"
          onClick={() => setSkipped(true)}
          className="slot-label inline-flex min-h-11 items-center self-start px-3 text-ink-soft transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
        >
          Skip to the order
        </button>
      )}
    </>
  );
}
