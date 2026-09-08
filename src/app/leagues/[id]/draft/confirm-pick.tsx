"use client";

import { useActionState, useEffect, useRef } from "react";

import { Correction } from "@/components/board";
import { SubmitButton } from "@/components/submit-button";
import { makePick, type DraftResult } from "@/lib/drafts/actions";

import { useArmedPick } from "./armed-pick";

/**
 * The tap that actually drafts somebody — in the sticky band, not on the row.
 *
 * A tap on a pool row **arms** it; this is where the pick lands. That
 * separation is the whole mechanism rather than a layout choice: with the
 * confirm on the row's own button, **a fast double-tap arms and picks inside
 * 200ms**, so the guard would catch a stray single tap and miss the fat-finger
 * double-tap blueprint 3.7 is actually about. Here it is out of reach of that
 * gesture, at the top of the viewport where the clock already is — and it gives
 * the pointer a `Cancel` it never had, since Escape was keyboard-only.
 *
 * Renders nothing at all until something is armed, so the band keeps its shape
 * for the eleven people who are not picking.
 */

const START: DraftResult = { error: null };

export function ConfirmPick({ leagueId }: { leagueId: string }) {
  const { armed, disarm, refuse, refused } = useArmedPick();
  const [result, action] = useActionState(makePick, START);
  const formRef = useRef<HTMLFormElement>(null);

  // A landed pick disarms; a refusal keeps the row armed so the tap can simply
  // be repeated, which is the shape 3.5's chat send uses. The refused id goes
  // back into the context so the *row* can strike itself too — 3.3's critique
  // fix, which moving the confirm here would otherwise have traded away.
  useEffect(() => {
    // **Only if this result is about the player in hand.** `useActionState`
    // keeps the last result across the next arming, so acting on `picked`
    // alone would disarm a freshly armed row the moment the effect happened to
    // re-run — the pick would silently un-choose itself. Comparing the id is
    // what makes "did *this* pick land" a decidable question.
    if (result.picked && result.playerId && result.playerId === armed?.playerId) {
      disarm();
    } else if (result.error) {
      // `playerId` is only set on refusals the pool can point at a row; a
      // refusal without one (a paused draft, a lost session) still has to be
      // said somewhere, so the band takes it either way.
      refuse({ playerId: result.playerId ?? "", reason: result.error });
    }
  }, [result, armed, disarm, refuse]);

  /**
   * Focus the confirming button as soon as it appears.
   *
   * This is what keeps the keyboard path at two keystrokes: `Enter` on a row
   * arms it, focus lands here, and `Enter` again drafts — the same two presses
   * 3.3 shipped, now through the same mechanism as a thumb rather than a second
   * one beside it. It also means a screen reader is taken to the thing it has
   * to confirm rather than left on a row that has quietly changed meaning.
   */
  useEffect(() => {
    // Through the form rather than a ref on the button: `SubmitButton` is the
    // design system's only client component and does not forward a ref, and
    // widening its API for one caller is the trade 3.4b declined to make with
    // `Slot`.
    if (armed) formRef.current?.querySelector("button")?.focus();
  }, [armed]);

  /**
   * The refusal outlives the armed row, and that is not a detail.
   *
   * Every refusal revalidates the room (2.4's decision: "a stale tab is
   * corrected by the act of being wrong"), so a tab that submits into a draft
   * that has since been paused gets its answer *and* a re-render that flips
   * this band to its paused state. Rendering the correction only alongside an
   * armed pick therefore destroyed the explanation in the same breath as
   * producing it — the tap was refused, the room corrected itself, and the
   * member was told nothing. Found by the two stale-tab specs, which is the
   * only place a refusal and a re-render arrive together.
   */
  if (!armed && !refused) return null;

  return (
    <div className="mt-3 flex flex-col gap-2" data-testid="confirm-pick">
      {refused ? (
        <Correction testId="confirm-pick-error">{refused.reason}</Correction>
      ) : null}
      {!armed ? null : (
      <>
      <p className="slot-label" data-testid="confirm-pick-who">
        {armed.forTeamName
          ? `Drafting ${armed.playerName} for ${armed.forTeamName}`
          : `Drafting ${armed.playerName}`}
      </p>
      <div className="flex flex-wrap gap-2">
        <form ref={formRef} action={action}>
          <input type="hidden" name="leagueId" value={leagueId} />
          <input type="hidden" name="playerId" value={armed.playerId} />
          {/* Marker, because this is the one act on the surface — and the band
              is `slot-live`, so the label is ink on the blush rather than
              marker on marker, which DESIGN.md forbids by name and 3.3 shipped
              anyway on the one control it matters most for. */}
          <SubmitButton
            testId="confirm-pick-go"
            tone="liveOnField"
            pendingLabel="Drafting…"
          >
            Draft {armed.playerName}
          </SubmitButton>
        </form>
        <button
          type="button"
          onClick={disarm}
          data-testid="confirm-pick-cancel"
          className="slot-label min-h-11 min-w-11 border border-ink/50 px-4 text-ink transition-colors hover:border-ink/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
        >
          Cancel
        </button>
      </div>
      </>
      )}
    </div>
  );
}
