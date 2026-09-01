"use client";

import { useActionState, useState } from "react";

import {
  Correction,
  Field,
  Slot,
  Slots,
  inputStyles,
} from "@/components/board";
import { PositionPatch } from "@/components/board";
import { SubmitButton } from "@/components/submit-button";
import { makePick, type DraftResult } from "@/lib/drafts/actions";
import type { DraftView } from "@/lib/drafts/queries";

/**
 * Making a pick — slice 2.4.
 *
 * A plain filtered list, deliberately. The flagship pool experience (fuzzy
 * search, tiers, hide-drafted, the radar) is Phase 3; what this owes is a
 * correct pick, and correctness before beauty.
 *
 * Nothing here decides anything. The button is hidden when it is not your turn
 * and the filter narrows what you can see, but the server re-checks whose turn
 * it is and whether the pick is legal on every submission — the UI's opinion is
 * not evidence.
 */
const START: DraftResult = { error: null };

export function PickForm({
  leagueId,
  view,
  canPick,
}: {
  leagueId: string;
  view: DraftView;
  /** Your turn, and the draft actually running. The server re-checks both. */
  canPick: boolean;
}) {
  const [result, action] = useActionState(makePick, START);
  const [query, setQuery] = useState("");

  // A manager entering someone else's pick is a different act from taking your
  // own turn, and the button has to say which one this is.
  const onBehalf = !view.isYourTurn;

  const needle = query.trim().toLowerCase();
  const shortlist = view.available
    .filter(
      (player) =>
        !needle ||
        player.name.toLowerCase().includes(needle) ||
        player.club.toLowerCase().includes(needle),
    )
    .slice(0, 25);

  return (
    <div className="flex flex-col gap-4">
      {result.error ? (
        <Correction testId="pick-error">{result.error}</Correction>
      ) : null}

      <Field label="Find a player">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name or club"
          data-testid="pool-search"
          className={inputStyles}
        />
      </Field>

      <Slots testId="pick-pool">
        {shortlist.map((player) => (
          <Slot key={player.id} state="waiting" testId="pool-row">
            <span className="flex flex-wrap items-baseline gap-x-3">
              <span className="text-sm font-semibold uppercase tracking-[0.04em]">
                {player.name}
              </span>
              <span className="slot-label">{player.club}</span>
              <PositionPatch position={player.position} />
            </span>
            {canPick ? (
              <form action={action}>
                <input type="hidden" name="leagueId" value={leagueId} />
                <input type="hidden" name="playerId" value={player.id} />
                <SubmitButton
                  testId={`pick-${player.id}`}
                  tone="live"
                  pendingLabel="Picking…"
                >
                  {onBehalf ? "Pick for them" : "Pick"}
                </SubmitButton>
              </form>
            ) : null}
          </Slot>
        ))}
        {shortlist.length === 0 ? (
          <Slot state="waiting">
            <span className="text-sm text-ink-soft">
              Nobody left matching that.
            </span>
          </Slot>
        ) : null}
      </Slots>

      {view.available.length > shortlist.length ? (
        <p className="slot-label text-ink-faint">
          Showing {shortlist.length} of {view.available.length} available
        </p>
      ) : null}
    </div>
  );
}
