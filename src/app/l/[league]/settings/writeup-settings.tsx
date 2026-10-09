"use client";

import { useActionState, useState } from "react";

import { Bank, Correction, Field, selectStyles } from "@/components/board";
import { SubmitButton } from "@/components/submit-button";
import { setWriteupSettings, type WriteupSettingsResult } from "@/lib/leagues/actions";
import type { WriteupSettings } from "@/lib/leagues/settings";

const START: WriteupSettingsResult = { error: null };

const VOICE_WORDS = {
  analyst: "Analyst: straight, measured",
  pundit: "Pundit: banter about the teams",
} as const;

/**
 * Round write-ups on or off, and their voice — 7.1. The commissioner edits;
 * a deputy reads the same two facts as a sentence. `setWriteupSettings`
 * checks again, so this render is the courtesy, not the rule.
 */
export function WriteupSettingsBank({
  leagueId,
  settings,
  canEdit,
}: {
  leagueId: string;
  settings: WriteupSettings;
  canEdit: boolean;
}) {
  const [result, action] = useActionState(setWriteupSettings, START);
  const current = result.saved ?? settings;
  // Controlled: React 19 resets uncontrolled fields after the action returns.
  const [enabled, setEnabled] = useState(current.enabled ? "on" : "off");
  const [voice, setVoice] = useState<string>(current.voice);

  return (
    <Bank label="Round write-ups" aside={current.enabled ? `on · ${current.voice}` : "off"}>
      <p className="text-sm text-ink-soft">
        After each round is final, a headline, a few lines and an analyst&rsquo;s read of the night appear on Recap.
        Every number in them is checked against the league&rsquo;s own figures first.
      </p>
      {canEdit ? (
        <form action={action} className="mt-4 flex flex-col gap-5" data-testid="writeup-settings">
          <input type="hidden" name="leagueId" value={leagueId} />
          <Field label="Write-ups">
            <select
              name="enabled"
              value={enabled}
              onChange={(event) => setEnabled(event.target.value)}
              data-testid="writeup-enabled"
              className={selectStyles}
            >
              <option value="on">On</option>
              <option value="off">Off: hidden, and none written</option>
            </select>
          </Field>
          <Field label="Voice">
            <select
              name="voice"
              value={voice}
              onChange={(event) => setVoice(event.target.value)}
              data-testid="writeup-voice"
              className={selectStyles}
            >
              <option value="analyst">{VOICE_WORDS.analyst}</option>
              <option value="pundit">{VOICE_WORDS.pundit}</option>
            </select>
          </Field>
          <p className="text-sm text-ink-soft">A new voice applies from the next round written; earlier rounds keep theirs.</p>
          <SubmitButton testId="writeup-settings-save" pendingLabel="Saving…">
            Save write-ups
          </SubmitButton>
          {result.error ? <Correction testId="writeup-settings-error">{result.error}</Correction> : null}
        </form>
      ) : (
        <p className="mt-3 text-sm text-ink" data-testid="writeup-settings-readonly">
          {current.enabled ? `On, in the ${current.voice}'s voice.` : "Off."} Only the commissioner can change this.
        </p>
      )}
    </Bank>
  );
}
