"use client";

import { useActionState, useState } from "react";

import { Correction, Field, inputStyles } from "@/components/board";
import { SubmitButton } from "@/components/submit-button";
import { deleteLeague, type LobbyResult } from "@/lib/leagues/actions";

/**
 * Deleting the league.
 *
 * The commissioner's last resort, and the only control in this app that
 * destroys something belonging to everybody. So it is folded away at the foot
 * of the lobby, it names what it will take before you can reach the field, and
 * it asks for the league's own name rather than a fixed word — a commissioner
 * with three leagues open should have to look at which one they are deleting.
 *
 * Ink-toned like every other control here. Creating a league carries the
 * marker; ending one does not get to shout louder than that (DESIGN.md, the
 * Two Jobs Rule).
 *
 * Not shown to a deputy, and `deleteLeague` refuses one regardless — the
 * rendering is the courtesy, the refusal is the rule.
 */
const START: LobbyResult = { error: null };

export function DeleteLeague({
  leagueId,
  leagueName,
  memberCount,
  hasDrafted,
}: {
  leagueId: string;
  leagueName: string;
  memberCount: number;
  /** The league has a draft to lose as well as a lobby. */
  hasDrafted: boolean;
}) {
  const [result, action] = useActionState(deleteLeague, START);
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3 border-t border-rule pt-4">
      {result.error ? (
        <Correction testId="delete-league-error">{result.error}</Correction>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        data-testid="delete-league-toggle"
        className="slot-label self-start underline underline-offset-4 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
      >
        {open ? "Never mind" : "Delete this league"}
      </button>

      {open ? (
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="leagueId" value={leagueId} />
          <p className="text-sm text-ink-soft">
            This deletes {leagueName},{" "}
            {memberCount === 1 ? "its one member" : `all ${memberCount} members`}
            {hasDrafted ? ", and every pick on its board" : ""}. The invite code
            stops working and nobody can get back in. Nothing brings it back.
          </p>
          <Field label="Type the league's name to confirm">
            <input
              name="confirm"
              autoComplete="off"
              placeholder={leagueName}
              data-testid="delete-league-confirm"
              className={inputStyles}
            />
          </Field>
          <SubmitButton testId="delete-league" pendingLabel="Deleting…">
            Delete the league
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
