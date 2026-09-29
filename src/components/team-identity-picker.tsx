"use client";

import { useActionState, useState } from "react";

import { TeamCrest } from "@/components/broadcast";
import { Correction } from "@/components/board";
import { SubmitButton } from "@/components/submit-button";
import { setTeamIdentity, type LobbyResult } from "@/lib/leagues/actions";
import { CREST_SHAPES, TEAM_COLORS, type CrestShape, type TeamColor } from "@/lib/teams/identity";

const START: LobbyResult = { error: null };

const SHAPE_WORD: Record<CrestShape, string> = {
  waffle: "Waffle",
  shield: "Shield",
  roundel: "Roundel",
  hex: "Hex",
};

/**
 * A member's crest: pick a colour and a shape, see it before saving. The
 * choice is a server action; the preview is local and never written until
 * Save, so leaving the page leaves the stored crest alone.
 */
export function TeamIdentityPicker({
  leagueId,
  memberId,
  name,
  color,
  crest,
}: {
  leagueId: string;
  memberId: string;
  name: string;
  color: TeamColor;
  crest: CrestShape;
}) {
  const [state, action] = useActionState(setTeamIdentity, START);
  const [picked, setPicked] = useState({ color, crest });
  const dirty = picked.color !== color || picked.crest !== crest;

  return (
    <form action={action} data-testid="team-identity" className="flex flex-col gap-4">
      <input type="hidden" name="leagueId" value={leagueId} />
      <input type="hidden" name="memberId" value={memberId} />
      <div className="flex items-center gap-4">
        <TeamCrest name={name} color={picked.color} shape={picked.crest} size={64} />
        <p className="text-sm text-ink-soft">
          Your crest shows beside <span className="font-semibold text-ink">{name}</span> in every table, board and chat.
        </p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium text-ink-soft">Colour</legend>
        <div className="flex flex-wrap gap-1.5">
          {TEAM_COLORS.map((option) => (
            <label
              key={option}
              className="relative grid size-11 cursor-pointer place-items-center rounded-full has-[:checked]:outline-2 has-[:checked]:outline-offset-1 has-[:checked]:outline-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-live"
            >
              <input
                type="radio"
                name="color"
                value={option}
                checked={picked.color === option}
                onChange={() => setPicked((current) => ({ ...current, color: option }))}
                data-testid={`team-color-${option}`}
                className="sr-only"
              />
              <span aria-hidden="true" className="size-8 rounded-full" style={{ background: `var(--color-team-${option})` }} />
              <span className="sr-only">{option}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium text-ink-soft">Shape</legend>
        <div className="flex flex-wrap gap-2">
          {CREST_SHAPES.map((option) => (
            <label
              key={option}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-rule px-3 text-sm font-semibold text-ink-soft has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-stock has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-live"
            >
              <input
                type="radio"
                name="crest"
                value={option}
                checked={picked.crest === option}
                onChange={() => setPicked((current) => ({ ...current, crest: option }))}
                data-testid={`team-crest-${option}`}
                className="sr-only"
              />
              <TeamCrest name={name} color={picked.color} shape={option} size={24} />
              {SHAPE_WORD[option]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton testId="save-team-identity" tone={dirty ? "live" : "ink"} pendingLabel="Saving…" disabled={!dirty}>
          Save crest
        </SubmitButton>
        {state.error ? null : !dirty && state !== START ? (
          <span role="status" className="text-sm text-gain">
            Saved
          </span>
        ) : null}
      </div>
      {state.error ? <Correction testId="team-identity-error">{state.error}</Correction> : null}
    </form>
  );
}
