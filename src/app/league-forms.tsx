"use client";

import { useActionState, useState } from "react";

import { Bank, Correction, Field, inputStyles } from "@/components/board";
import { SubmitButton } from "@/components/submit-button";
import {
  createLeague,
  joinLeague,
  type LeagueFormResult,
} from "@/lib/leagues/actions";

/**
 * Start a league, or join one — the two forms on the signed-in home.
 *
 * A client component for the refusals. These two actions used to redirect
 * back here with their sentence in the query string, and the page rendered
 * whatever `?error=` said into a `role="alert"` — attacker-controllable text
 * ([#16](https://github.com/andrius-burba-94/eurovafliai/issues/16)). Now the
 * refusal comes back through `useActionState`, the way every lobby control
 * already does, and the URL carries nothing.
 *
 * The invite code is a controlled input for the same reason the paste boxes
 * are: React 19 clears an uncontrolled field across a server-action
 * transition, and a refused code the user has to retype is a worse answer
 * than the one they typed still being there.
 */
const START: LeagueFormResult = { error: null };

export function LeagueForms() {
  const [created, createAction] = useActionState(createLeague, START);
  const [joined, joinAction] = useActionState(joinLeague, START);
  const [code, setCode] = useState("");
  const message = created.error ?? joined.error;

  return (
    <>
      {message ? <Correction testId="home-error">{message}</Correction> : null}

      <div className="grid gap-8 sm:grid-cols-2">
        <Bank label="Start a league">
          <form action={createAction} className="flex flex-col gap-5">
            <Field label="League name">
              <input
                name="name"
                required
                minLength={2}
                maxLength={60}
                placeholder="Vafliai 2027"
                data-testid="create-league-name"
                className={inputStyles}
              />
            </Field>
            {/* The primary: creating a league is the act this surface exists
                for, so it carries the marker and joining does not. */}
            <SubmitButton
              testId="create-league"
              tone="live"
              pendingLabel="Opening the board…"
            >
              Create as commissioner
            </SubmitButton>
          </form>
        </Bank>

        <Bank label="Join a league">
          <form action={joinAction} className="flex flex-col gap-5">
            <Field label="Invite code">
              <input
                name="code"
                required
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="ABC234"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                data-testid="join-league-code"
                className={`${inputStyles} text-lg uppercase tracking-[0.32em]`}
              />
            </Field>
            <SubmitButton testId="join-league" pendingLabel="Taking a slot…">
              Join
            </SubmitButton>
          </form>
        </Bank>
      </div>
    </>
  );
}
