"use client";

import { useActionState, useState } from "react";

import {
  Bank,
  Correction,
  Field,
  Slot,
  Slots,
  inputStyles,
} from "@/components/board";
import { SubmitButton } from "@/components/submit-button";
import {
  applyRosterCsv,
  previewRosterCsv,
  setRosterAuthority,
  type AuthorityResult,
  type ImportResult,
} from "@/lib/rosters/actions";
import type { RosterAuthority } from "@/lib/rosters/types";

/**
 * The CSV front door — slice 2.1b.
 *
 * Preview first, apply second, and the apply re-parses rather than trusting the
 * preview: a plan that sat in a tab for an hour must not write itself against a
 * table that moved underneath it.
 */

const START: ImportResult = { error: null };
const AUTH_START: AuthorityResult = { error: null };

/**
 * Two blocks of pasted text, compared as text.
 *
 * Newlines are normalised because **a `<textarea>` submits CRLF**: the HTML
 * form-serialisation spec says so, so `formData.get("csv")` comes back with
 * `\r\n` where React state holds `\n`, and a raw `===` between the echoed
 * value and the state is false for every multi-line paste. Which is every
 * paste. Caught by `roster-import.spec.ts` the moment this comparison was
 * introduced, and it fails in exactly the direction that looks like the feature
 * silently not working.
 */
const sameText = (a: string, b: string) =>
  a.replace(/\r\n/g, "\n") === b.replace(/\r\n/g, "\n");

const KIND_LABEL: Record<"add" | "change" | "leaving", string> = {
  add: "new",
  change: "changed",
  leaving: "leaving",
};

export function ImportForm({ authority }: { authority: RosterAuthority }) {
  const [preview, previewAction] = useActionState(previewRosterCsv, START);
  const [applied, applyAction] = useActionState(applyRosterCsv, START);
  const [auth, authAction] = useActionState(setRosterAuthority, AUTH_START);
  /**
   * Controlled, because React 19 clears an uncontrolled input across a
   * server-action transition (AGENTS.md) and `defaultValue` then restores
   * whatever the last *result* carried.
   */
  const [csv, setCsv] = useState("");

  /**
   * A plan is only current if it belongs to the text in the box.
   *
   * `applied.preview ? applied : preview` was the old rule and it strands the
   * surface: once anything has been applied, `applied.preview` stays truthy
   * forever, so previewing a *new* paste changed nothing on screen and the
   * textarea was refilled with the old CSV over what had just been typed. Found
   * by slice 3.4a's critique on the cheat sheet, which had copied this line;
   * it has been here since 2.1b. The cheat sheet fixed it by collapsing to one
   * action with an intent, which is the better shape — this is the small,
   * behaviour-preserving version of the same correction for a shipped surface.
   */
  const current = (candidate: ImportResult) =>
    candidate.csv !== undefined && sameText(candidate.csv, csv)
      ? candidate
      : null;
  const result = current(applied) ?? current(preview) ?? START;
  const plan = result.preview;

  return (
    <>
      <Bank label="Roster authority" aside={`${authority} may write`}>
        {auth.error ? (
          <Correction testId="authority-error">{auth.error}</Correction>
        ) : null}
        <p className="text-sm text-ink-soft">
          Only the authoritative source writes to the pool. The other still runs
          and still records what it <em>would</em> have changed, so switching is
          not switching a source off.
        </p>
        <form action={authAction} className="flex flex-col gap-4">
          <input
            type="hidden"
            name="authority"
            value={authority === "api" ? "csv" : "api"}
          />
          <SubmitButton
            testId="authority-switch"
            tone={authority === "api" ? "ink" : "live"}
            pendingLabel="Switching…"
          >
            {authority === "api"
              ? "Hand authority to the CSV"
              : "Hand authority back to the API"}
          </SubmitButton>
        </form>
      </Bank>

      <Bank label="Upload a roster">
        {result.error ? (
          <Correction testId="import-error">{result.error}</Correction>
        ) : null}

        {applied.applied ? (
          <div
            data-testid="import-applied"
            className={
              applied.applied.reportOnly
                ? "slot-waiting px-3 py-3"
                : "slot-live px-3 py-3"
            }
          >
            <p className="slot-label">
              {applied.applied.reportOnly ? "Recorded, not applied" : "Applied"}
            </p>
            <p className="mt-1 text-sm">
              {applied.applied.reportOnly
                ? `The API holds authority, so nothing was written — the batch records what would have changed.`
                : `${applied.applied.added} added · ${applied.applied.changed} changed · ${applied.applied.left} marked left.`}
            </p>
          </div>
        ) : null}

        <form action={previewAction} className="flex flex-col gap-5">
          <Field label="CSV — name, club code, position[, person code, status]">
            <textarea
              name="csv"
              rows={8}
              value={csv}
              onChange={(event) => setCsv(event.target.value)}
              data-testid="csv-input"
              placeholder={
                '"Valančiūnas, Jonas",ZAL,C\n"Cordinier, Isaia",IST,G'
              }
              className={`${inputStyles} font-normal`}
            />
          </Field>
          <p className="text-sm text-ink-soft">
            A header row is optional and column order does not matter if you
            have one. Wrap a name containing a comma in &quot;quotes&quot;.
          </p>
          <SubmitButton testId="csv-preview" pendingLabel="Reading…">
            Preview the changes
          </SubmitButton>
        </form>
      </Bank>

      {plan ? (
        <Bank label="What it would do" aside={`${plan.rows} rows read`}>
          <Slots testId="import-plan">
            <Slot>
              <span className="slot-label">New players</span>
              <span className="text-sm tabular-nums">{plan.adds}</span>
            </Slot>
            <Slot>
              <span className="slot-label">Changed</span>
              <span className="text-sm tabular-nums">{plan.changes}</span>
            </Slot>
            <Slot state={plan.leaving > 0 ? "live" : "filled"}>
              <span className="slot-label">Marked as left</span>
              <span className="text-sm tabular-nums">{plan.leaving}</span>
            </Slot>
            {plan.blocked > 0 ? (
              <Slot>
                <span className="slot-label">Locked, so untouched</span>
                <span className="text-sm tabular-nums">{plan.blocked}</span>
              </Slot>
            ) : null}
          </Slots>

          {plan.leaving > 0 ? (
            <p className="text-sm text-ink-soft">
              A partial sheet marks everyone missing from it as having left. If
              that number looks wrong, it is.
            </p>
          ) : null}

          {plan.sample.length > 0 ? (
            <Slots testId="import-sample">
              {plan.sample.map((item, index) => (
                <Slot key={`${item.kind}-${index}`}>
                  <span className="slot-label">{KIND_LABEL[item.kind]}</span>
                  <span className="text-sm">{item.text}</span>
                </Slot>
              ))}
            </Slots>
          ) : null}

          {plan.problems.length > 0 ? (
            <Correction testId="import-problems">
              <span className="flex flex-col gap-1">
                {plan.problems.slice(0, 10).map((problem) => (
                  <span key={problem}>{problem}</span>
                ))}
                {plan.problems.length > 10 ? (
                  <span>…and {plan.problems.length - 10} more.</span>
                ) : null}
              </span>
            </Correction>
          ) : null}

          <form action={applyAction} className="flex flex-col gap-4">
            <input type="hidden" name="csv" value={csv} />
            {/* Only asked for when the plan would empty a large part of the
                pool. A confirmation that appears every time is a confirmation
                nobody reads. */}
            {plan.leaving > 0 && authority === "csv" ? (
              <label className="flex items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  name="confirm_departures"
                  value="yes"
                  data-testid="confirm-departures"
                  className="mt-0.5 size-4 accent-live"
                />
                Yes, this sheet is the complete roster — mark the {plan.leaving}{" "}
                missing {plan.leaving === 1 ? "player" : "players"} as having
                left
              </label>
            ) : null}
            <p className="text-sm text-ink-soft">
              {authority === "csv"
                ? "The CSV holds authority, so this writes to the pool."
                : "The API holds authority, so this records the plan without writing. Hand authority to the CSV first if you mean to apply it."}
            </p>
            <SubmitButton
              testId="csv-apply"
              tone={authority === "csv" ? "live" : "ink"}
              pendingLabel="Applying…"
            >
              {authority === "csv" ? "Apply to the pool" : "Record it anyway"}
            </SubmitButton>
          </form>
        </Bank>
      ) : null}
    </>
  );
}
