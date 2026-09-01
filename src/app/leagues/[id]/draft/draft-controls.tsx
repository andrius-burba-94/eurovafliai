"use client";

import { useActionState, useState } from "react";

import { Correction, Field, inputStyles } from "@/components/board";
import { SubmitButton } from "@/components/submit-button";
import {
  rollbackDraft,
  setDraftPaused,
  type DraftResult,
} from "@/lib/drafts/actions";

/**
 * Pause and resume.
 *
 * Shown to everyone and refused server-side for anyone who is not the
 * commissioner or a deputy — the same rule as the rest of the league's
 * controls. Rendering it conditionally would be a nicety; refusing it is the
 * part that matters.
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
  const [showUndo, setShowUndo] = useState(false);
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
    </div>
  );
}
