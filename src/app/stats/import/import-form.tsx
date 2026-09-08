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
  type StatImportResult,
  submitStatCsv,
} from "@/lib/stats/actions";
import { CSV_TEMPLATE_HEADER } from "@/lib/stats/csv";

/**
 * The box-score paste box — slice 4.1.
 *
 * **One action with an `intent`**, not a preview action beside an apply action.
 * AGENTS.md records what the two-`useActionState` shape costs: the component
 * has to decide which result is current, and the obvious rule pins the surface
 * to the last applied result forever. The cheat sheet reached this shape in
 * 3.4a's critique; this surface starts with it.
 */

const START: StatImportResult = { error: null };

/**
 * Newlines normalised because **a `<textarea>` submits CRLF** (AGENTS.md), so
 * an echoed value compared raw against the state in the box is unequal for
 * every multi-line paste — which is every paste here, since one line is one
 * player.
 */
const sameText = (a: string, b: string) =>
  a.replace(/\r\n/g, "\n") === b.replace(/\r\n/g, "\n");

const EXAMPLE = [
  CSV_TEMPLATE_HEADER,
  "006590,1,1,RS,IST,85,78,1850,7,3,7,0,4,1,1,2,1,3,2,0,0,0,1,2,2,11,3",
].join("\n");

export function StatImportForm({ season: defaultSeason }: { season: string }) {
  const [result, action] = useActionState(submitStatCsv, START);
  /**
   * Controlled, because React 19 clears an uncontrolled input across a
   * server-action transition and `defaultValue` would then restore whatever
   * the last result carried rather than what was typed.
   */
  const [csv, setCsv] = useState("");
  const [season, setSeason] = useState(defaultSeason);
  const [showHeader, setShowHeader] = useState(false);

  /**
   * A plan belongs to the text it was computed from. If the box has moved on,
   * the plan on screen is a claim about a sheet nobody is looking at any more.
   */
  const fresh =
    result.csv !== undefined && sameText(result.csv, csv) ? result : START;
  const plan = fresh.preview;
  const applied = fresh.applied;

  return (
    <>
      <Bank label="Paste a round" aside={season}>
        {fresh.error ? (
          <Correction testId="stat-import-error">{fresh.error}</Correction>
        ) : null}

        {applied ? (
          <div
            data-testid="stat-import-applied"
            className={
              applied.created + applied.updated === 0
                ? "slot-waiting px-3 py-3"
                : "slot-live px-3 py-3"
            }
          >
            <p className="slot-label">
              {applied.created + applied.updated === 0
                ? "Already stored"
                : "Stored"}
            </p>
            <p className="mt-1 text-sm">
              {applied.created + applied.updated === 0
                ? `Every line in that sheet was already stored, all ${applied.unchanged} of them. Nothing changed.`
                : `${applied.created} new · ${applied.updated} corrected · ${applied.unchanged} already stored.`}
            </p>
          </div>
        ) : null}

        <form action={action} className="flex flex-col gap-5">
          <Field label="Season code">
            <input
              name="season"
              value={season}
              onChange={(event) => setSeason(event.target.value.toUpperCase())}
              data-testid="stat-season"
              spellCheck={false}
              autoCapitalize="characters"
              className={inputStyles}
            />
          </Field>
          <Field label="One line per player, with a header row">
            <textarea
              name="csv"
              rows={8}
              value={csv}
              onChange={(event) => setCsv(event.target.value)}
              data-testid="stat-csv-input"
              placeholder={EXAMPLE}
              className={`${inputStyles} font-normal`}
            />
          </Field>

          <div className="flex flex-col gap-2">
            <p className="text-sm text-ink-soft">
              Column order does not matter; the header names them. Include{" "}
              <code>valuation</code> — the official PIR — and every line is
              checked against what its own numbers add up to.
            </p>
            <button
              type="button"
              onClick={() => setShowHeader((open) => !open)}
              data-testid="stat-header-toggle"
              aria-expanded={showHeader}
              className="self-start border-b border-ink/50 text-sm hover:border-ink/80"
            >
              {showHeader ? "Hide the header row" : "Show the header row"}
            </button>
            {showHeader ? (
              // `break-words` because this is a 27-column unbroken token, and
              // `overflow-y-auto` makes `overflow-x` compute to `auto` — so
              // without it the panel scrolls sideways instead of wrapping
              // (AGENTS.md, measured at 526px hidden inside 350px).
              <p
                data-testid="stat-header-row"
                className="break-words border-t-2 border-ink px-3 py-2 font-mono text-xs"
              >
                {CSV_TEMPLATE_HEADER}
              </p>
            ) : null}
          </div>

          {/* A hidden field rather than a named submit button, which is how
              the cheat sheet's three intents are already spelled — and it
              keeps `SubmitButton`, the design system's signature control,
              from growing a form-serialisation concern for one route. */}
          <input type="hidden" name="intent" value="preview" />
          <SubmitButton testId="stat-csv-preview" pendingLabel="Reading…">
            Read the sheet
          </SubmitButton>
        </form>
      </Bank>

      {plan ? (
        <Bank
          label="What it would store"
          aside={`${plan.rows} line${plan.rows === 1 ? "" : "s"} read`}
        >
          <p className="text-sm" data-testid="stat-plan-sentence">
            {plan.sentence}
          </p>

          <Slots testId="stat-plan">
            <Slot state={plan.creates > 0 ? "live" : "filled"}>
              <span className="slot-label">New game lines</span>
              <span className="text-sm tabular-nums">{plan.creates}</span>
            </Slot>
            <Slot state={plan.updates > 0 ? "live" : "filled"}>
              <span className="slot-label">Corrections</span>
              <span className="text-sm tabular-nums">{plan.updates}</span>
            </Slot>
            <Slot>
              <span className="slot-label">Already stored</span>
              <span className="text-sm tabular-nums">{plan.unchanged}</span>
            </Slot>
            <Slot state={plan.checkedAgainstPir > 0 ? "filled" : "waiting"}>
              <span className="slot-label">Checked against official PIR</span>
              <span className="text-sm tabular-nums">
                {plan.checkedAgainstPir}
              </span>
            </Slot>
          </Slots>

          {plan.updates > 0 ? (
            <>
              <p className="text-sm text-ink-soft">
                A correction rewrites a game that has already been scored, so
                the standings will move. These are the lines it would change.
              </p>
              <Slots testId="stat-corrections">
                {plan.corrections.map((correction) => (
                  <Slot key={correction} state="live">
                    <span className="text-sm break-words">{correction}</span>
                  </Slot>
                ))}
                {plan.updates > plan.corrections.length ? (
                  <Slot>
                    <span className="text-sm text-ink-soft">
                      …and {plan.updates - plan.corrections.length} more.
                    </span>
                  </Slot>
                ) : null}
              </Slots>
            </>
          ) : null}

          {plan.unmatched.length > 0 ? (
            <Correction testId="stat-unmatched">
              <span className="flex flex-col gap-1">
                <span>
                  {plan.unmatched.length} person{" "}
                  {plan.unmatched.length === 1 ? "code" : "codes"} match no
                  player in the pool, so those lines will not be stored. Sync
                  the rosters first, or fix the code.
                </span>
                {plan.unmatched.slice(0, 6).map((entry) => (
                  <span key={entry.personCode} className="break-words">
                    {entry.personCode} — line
                    {entry.lines.length === 1 ? " " : "s "}
                    {entry.lines.slice(0, 8).join(", ")}
                  </span>
                ))}
              </span>
            </Correction>
          ) : null}

          {plan.ignoredColumns.length > 0 ? (
            <p className="text-sm text-ink-soft break-words">
              Columns nothing reads, so they are ignored:{" "}
              {plan.ignoredColumns.join(", ")}.
            </p>
          ) : null}

          {plan.problems.length > 0 ? (
            <Correction testId="stat-problems">
              <span className="flex flex-col gap-1">
                {plan.problems.slice(0, 10).map((problem) => (
                  <span key={problem} className="break-words">
                    {problem}
                  </span>
                ))}
                {plan.problems.length > 10 ? (
                  <span>…and {plan.problems.length - 10} more.</span>
                ) : null}
              </span>
            </Correction>
          ) : null}

          {plan.creates + plan.updates > 0 ? (
            <form action={action} className="flex flex-col gap-4">
              <input type="hidden" name="csv" value={csv} />
              <input type="hidden" name="season" value={season} />
              <p className="text-sm text-ink-soft">
                This writes to the season&apos;s record. Importing it again
                stores nothing twice.
              </p>
              <input type="hidden" name="intent" value="apply" />
              <SubmitButton
                testId="stat-csv-apply"
                tone="live"
                pendingLabel="Storing…"
              >
                Store {plan.creates + plan.updates} line
                {plan.creates + plan.updates === 1 ? "" : "s"}
              </SubmitButton>
            </form>
          ) : (
            <p className="text-sm text-ink-soft" data-testid="stat-nothing">
              Nothing to store from this sheet.
            </p>
          )}
        </Bank>
      ) : null}
    </>
  );
}
