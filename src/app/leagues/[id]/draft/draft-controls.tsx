"use client";

import { useActionState, useState } from "react";

import { Correction, Field, inputStyles } from "@/components/board";
import { SubmitButton } from "@/components/submit-button";
import {
  resetDraft,
  rollbackDraft,
  setDraftPaused,
  type DraftResult,
} from "@/lib/drafts/actions";
import { RESET_CONFIRMATION } from "@/lib/drafts/types";

/**
 * The commissioner's controls: pause, undo, reset.
 *
 * Three degrees of intervention, and they are ordered by how much they cost.
 * Pause is free and reversible. Undo takes the board back to a pick and can be
 * walked forward again by picking. Reset throws the draft away, which is the
 * one thing here that cannot be undone — so it is folded away, states what it
 * will discard, and asks for a typed word rather than a tap.
 *
 * Shown to managers and refused server-side for anyone else — the same rule as
 * the rest of the league's controls. Rendering them conditionally is a nicety;
 * refusing them is the part that matters.
 */
const START: DraftResult = { error: null };

export function DraftControls({
  leagueId,
  status,
  canManage,
  picksMade,
}: {
  leagueId: string;
  status: string;
  /** Only a manager sees these. The actions refuse anyone else regardless. */
  canManage: boolean;
  /** How far the board has got — the undo has nothing to do before pick 1. */
  picksMade: number;
}) {
  const [result, action] = useActionState(setDraftPaused, START);
  const [undone, undoAction] = useActionState(rollbackDraft, START);
  const [reset, resetAction] = useActionState(resetDraft, START);
  const [showUndo, setShowUndo] = useState(false);
  const [showReset, setShowReset] = useState(false);
  if (!canManage) return null;

  const paused = status === "paused";
  const complete = status === "complete";

  return (
    <div className="flex flex-col gap-3">
      {result.error ? (
        <Correction testId="draft-control-error">{result.error}</Correction>
      ) : null}
      {complete ? null : (
        <form action={action}>
          <input type="hidden" name="leagueId" value={leagueId} />
          <input
            type="hidden"
            name="paused"
            value={paused ? "false" : "true"}
          />
          <SubmitButton
            testId="draft-pause"
            pendingLabel={paused ? "Resuming…" : "Pausing…"}
          >
            {paused ? "Resume the draft" : "Pause the draft"}
          </SubmitButton>
        </form>
      )}
      {paused ? (
        <p className="slot-label text-live">
          Paused &middot; the clock restarts when you resume
        </p>
      ) : null}

      {/* Undo. Folded away behind a toggle, because a control that discards
          picks should take a deliberate act to reach — and unfolded it states
          what it will do before you can press it. */}
      {picksMade > 0 ? (
        <div className="flex flex-col gap-3">
          {undone.error ? (
            <Correction testId="draft-undo-error">{undone.error}</Correction>
          ) : null}
          <button
            type="button"
            onClick={() => setShowUndo((open) => !open)}
            data-testid="draft-undo-toggle"
            className="slot-label self-start underline underline-offset-4 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
          >
            {showUndo ? "Never mind" : "Undo a pick"}
          </button>
          {showUndo ? (
            <form action={undoAction} className="flex flex-col gap-3">
              <input type="hidden" name="leagueId" value={leagueId} />
              <Field label="Undo back to pick number">
                <input
                  name="targetPickNo"
                  type="number"
                  min={1}
                  // No `max`: `picksMade` is already stale if anyone picked
                  // while this was open, and a browser bubble refusing a number
                  // the server would have explained is a worse answer than the
                  // server's own. The engine bounds it either way.
                  defaultValue={picksMade}
                  data-testid="draft-undo-target"
                  className={inputStyles}
                />
              </Field>
              <p className="text-sm text-ink-soft">
                That pick and everything after it is discarded.{" "}
                {picksMade === 1 ? "One pick has" : `${picksMade} picks have`}{" "}
                been made.
              </p>
              <SubmitButton testId="draft-undo" pendingLabel="Undoing…">
                Undo and pause
              </SubmitButton>
            </form>
          ) : null}
        </div>
      ) : null}

      {/* Reset. Last, folded, and the only control here that destroys work.
          Not marker-toned: the pick is this room's one act, and spending the
          marker on a destructive control would be spending it twice
          (DESIGN.md, the Two Jobs Rule). */}
      <div className="flex flex-col gap-3 border-t border-rule pt-3">
        {reset.error ? (
          <Correction testId="draft-reset-error">{reset.error}</Correction>
        ) : null}
        <button
          type="button"
          onClick={() => setShowReset((open) => !open)}
          data-testid="draft-reset-toggle"
          className="slot-label self-start underline underline-offset-4 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
        >
          {showReset ? "Never mind" : "Start over"}
        </button>
        {showReset ? (
          <form action={resetAction} className="flex flex-col gap-3">
            <input type="hidden" name="leagueId" value={leagueId} />
            <p className="text-sm text-ink-soft">
              This deletes the draft and{" "}
              {picksMade === 0
                ? "returns the league to the lobby"
                : picksMade === 1
                  ? "the one pick made so far, and returns the league to the lobby"
                  : `all ${picksMade} picks made so far, and returns the league to the lobby`}
              . The draft order is kept, so you can start again or re-roll it.
              Nothing brings the board back.
            </p>
            <Field label={`Type ${RESET_CONFIRMATION} to confirm`}>
              <input
                name="confirm"
                autoComplete="off"
                autoCapitalize="characters"
                data-testid="draft-reset-confirm"
                className={inputStyles}
              />
            </Field>
            <SubmitButton testId="draft-reset" pendingLabel="Starting over…">
              Delete the draft
            </SubmitButton>
          </form>
        ) : null}
      </div>
    </div>
  );
}
