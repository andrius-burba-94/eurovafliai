"use client";

import { useActionState } from "react";

import { Correction } from "@/components/board";
import { SubmitButton } from "@/components/submit-button";
import { setAutodraft, type DraftResult } from "@/lib/drafts/actions";

/**
 * "Draft for me."
 *
 * The member's own switch, and deliberately theirs: leaving the table is not a
 * decision the commissioner should have to make on somebody's behalf, which is
 * the same reasoning that makes `is_ready` self-declared. With it on, the
 * worker's sweep takes each of their turns as it comes round instead of waiting
 * the clock out.
 *
 * It is not the primary action on this surface — the pick is — so it carries
 * the ink tone rather than the marker (DESIGN.md, the Two Jobs Rule).
 *
 * The commissioner's per-member version, for the phone that died mid-round, is
 * Phase 3.6; `setAutodraft` already permits it.
 */
const START: DraftResult = { error: null };

export function AutodraftToggle({
  leagueId,
  enabled,
  pickSeconds,
}: {
  leagueId: string;
  enabled: boolean;
  /** How long a turn lasts, so the "off" state can say what happens instead. */
  pickSeconds: number;
}) {
  const [result, action] = useActionState(setAutodraft, START);

  return (
    <div className="flex flex-col gap-2">
      {result.error ? (
        <Correction testId="autodraft-error">{result.error}</Correction>
      ) : null}
      <form action={action}>
        <input type="hidden" name="leagueId" value={leagueId} />
        <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
        <SubmitButton
          testId="autodraft-toggle"
          pendingLabel={enabled ? "Taking it back…" : "Handing it over…"}
        >
          {enabled ? "Take my picks back" : "Draft for me"}
        </SubmitButton>
      </form>
      <p className="slot-label" data-testid="autodraft-state">
        {enabled
          ? "Autodraft is on · the engine picks the moment your turn comes"
          : `Autodraft is off · you get ${pickSeconds}s a turn, then the engine picks`}
      </p>
    </div>
  );
}
