"use client";

import { useActionState, useState } from "react";

import {
  Bank,
  CardName,
  Correction,
  Field,
  PositionPatch,
  Slot,
  Slots,
  inputStyles,
  selectStyles,
} from "@/components/board";
import { SubmitButton } from "@/components/submit-button";
import {
  submitCheatSheet,
  type PlanRow,
  type SheetResult,
} from "@/lib/sheets/actions";

/**
 * The cheat sheet's front door — paste, read the plan, confirm, apply.
 *
 * Two steps, like the roster CSV, plus one that surface does not need: a
 * **confirm step for ambiguous names**. A roster CSV is matched on a club code
 * and a person code; a cheat sheet is matched on whatever a person typed at
 * eleven at night. Nothing is written until the second button, and the apply
 * re-parses from the text rather than trusting the plan — the pool moves
 * nightly, between the day somebody writes a sheet and the night they draft
 * from it.
 *
 * ## The box is an edit box, not just an in-tray
 *
 * It is seeded with the sheet you already have, written back out as
 * `rank,tier,name`. Before 3.4a's critique the only way to change a ranking was
 * to compose a whole new one somewhere else and paste it, which made
 * "this replaces the sheet you have now, whole" a cliff: there was no way to
 * *get* the current sheet as text, so a replace — or a delete — threw away the
 * only copy of an hour's thinking. Reading it back turns whole-replace into a
 * round trip, and it is most of what a drag-to-reorder would buy, for none of
 * the machinery.
 *
 * ## One action, three intents
 *
 * Not three `useActionState`s. See `submitCheatSheet` for why: the obvious
 * shape makes the component arbitrate between three results, and the natural
 * way to do that strands the surface on the last applied plan and feeds the
 * user their own stale text back. One result, no arbitration.
 */

const START: SheetResult = { error: null };

/** How much of the plan to list. Past this it is a wall, not a check. */
const SAMPLE = 8;

const STATUS_NOTE: Record<PlanRow["status"], string> = {
  matched: "",
  ambiguous: "Which one?",
  unmatched:
    "Nobody in the pool is close — fix the spelling and read it again.",
  duplicate: "Already on the list higher up. This line is ignored.",
};

/**
 * The line, as it was typed.
 *
 * `flex-wrap` and no `shrink-0` on the note beside it, which is not a detail.
 * The note used to be `shrink-0` in a `flex-nowrap` row, so a 65-character
 * sentence took 502px inside a 350px row: the page overflowed by **161px** at
 * 390px — clipped, not scrollable — and the name span was crushed to **0px**.
 * The row telling you to fix a line did not show you the line. Measured in a
 * browser by 3.4a's critique.
 */
function PlanLine({ row }: { row: PlanRow }) {
  return (
    <span className="flex min-w-0 items-baseline gap-x-3">
      <span className="slot-label shrink-0 tabular-nums text-ink-soft">
        L{row.lineNo}
      </span>
      <span className="min-w-0 truncate" title={row.typed}>
        <CardName scale="slot">{row.typed}</CardName>
      </span>
    </span>
  );
}

/**
 * Did the writer type something the matched name does not already contain?
 *
 * The old guard was `typed !== player.name`, which is true for essentially
 * every row: the pool stores "Surname, Firstname" and nobody types the comma.
 * So every resolved row carried a `was "…"` annotation, and on a phone that
 * annotation truncated the *matched* player's name to make room for repeating
 * the input. The point of the note is to flag a match that changed something —
 * a correction, a fuzzy hit — so a typed string that is already a run of tokens
 * inside the matched name is not worth saying.
 */
function isPlainAbbreviation(typed: string, matched: string): boolean {
  const words = (value: string) =>
    value
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean);
  const inName = new Set(words(matched));
  return words(typed).every((word) => inName.has(word));
}

export function SheetForm({
  leagueId,
  hasSheet,
  poolSize,
  initialText,
}: {
  leagueId: string;
  hasSheet: boolean;
  poolSize: number;
  /** Your current sheet, written back out as `rank,tier,name`. */
  initialText: string;
}) {
  const [result, action] = useActionState(submitCheatSheet, START);
  /**
   * Controlled, and that is load-bearing rather than stylistic. React 19 clears
   * uncontrolled inputs across a server-action transition (AGENTS.md records
   * it), so a `defaultValue` textarea hands the user back whatever the *last
   * result* carried — which after a save is the text they had already replaced.
   */
  const [text, setText] = useState(initialText);
  /** The delete has been pressed once and is waiting to be meant. */
  const [armed, setArmed] = useState(false);

  const plan = result.plan;
  const needsAnswer =
    plan?.rows.filter(
      (row) => row.status === "ambiguous" && row.candidates.length > 0,
    ) ?? [];
  const unresolved =
    plan?.rows.filter(
      (row) => row.status === "unmatched" || row.status === "duplicate",
    ) ?? [];
  const resolved = plan?.rows.filter((row) => row.rank !== null) ?? [];

  return (
    <>
      <Bank label="Paste a list">
        {result.error ? (
          <Correction testId="sheet-error">{result.error}</Correction>
        ) : null}

        <form action={action} className="flex flex-col gap-5">
          <input type="hidden" name="leagueId" value={leagueId} />
          <input type="hidden" name="intent" value="preview" />
          <Field label="One player per line — rank and tier optional">
            <textarea
              name="csv"
              rows={8}
              value={text}
              onChange={(event) => setText(event.target.value)}
              data-testid="sheet-input"
              placeholder={"1,1,Nunn\n2,1,Sloukas\n3,2,Valanciunas"}
              // The one input on this surface that exists to receive surnames a
              // phone keyboard has never seen — the same reason the pool's
              // search box turns these off.
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              // Vertical only. The native two-axis grabber is exactly the
              // "chrome arriving without anybody choosing it" that `selectStyles`
              // added `appearance-none` to refuse.
              className={`${inputStyles} resize-y font-normal`}
            />
          </Field>
          {/* `max-w-prose`: these ran 81 characters a line at 1440px, caught by
              the in-page detector. The `h1` block above has `max-w-xl` and
              these had no measure at all. */}
          <p className="max-w-prose text-sm text-ink-soft">
            {hasSheet
              ? "This is your sheet as it stands — edit it and read it again. "
              : "A bare list of names works, and so does "}
            {hasSheet ? null : (
              <span className="whitespace-nowrap">rank,tier,name</span>
            )}
            {hasSheet ? null : ". "}
            Spelling is forgiven and diacritics are not needed —{" "}
            <span className="whitespace-nowrap">valanciunas</span> finds
            Valančiūnas. A tier break is recorded wherever the tier column
            changes. {poolSize} players are in the pool to match against.
          </p>
          <SubmitButton testId="sheet-preview" pendingLabel="Reading…">
            Read the list
          </SubmitButton>
        </form>
      </Bank>

      {plan ? (
        <Bank
          label="What it would save"
          aside={
            `${plan.matched} of ${plan.rows.length} lines matched` +
            // Shown here rather than only after the fact: the tier count is the
            // half of the outcome the row list cannot depict, and it was
            // computed and then thrown away.
            (plan.tiers > 0
              ? ` · ${plan.tiers} tier ${plan.tiers === 1 ? "break" : "breaks"}`
              : "")
          }
        >
          <form action={action} className="flex flex-col gap-5">
            <input type="hidden" name="leagueId" value={leagueId} />
            <input type="hidden" name="intent" value="apply" />
            {/* The text, not the plan. The apply re-reads it. */}
            <input type="hidden" name="csv" value={text} />

            {needsAnswer.length > 0 ? (
              <div className="flex flex-col gap-3">
                <p className="max-w-prose text-sm text-ink-soft">
                  {needsAnswer.length}{" "}
                  {needsAnswer.length === 1 ? "line names" : "lines name"}{" "}
                  somebody the pool cannot tell apart. Choose, or leave{" "}
                  {needsAnswer.length === 1 ? "it" : "them"} out — the rest of
                  the sheet saves either way.
                </p>
                <Slots
                  testId="sheet-ambiguous"
                  label="Lines that need an answer"
                >
                  {needsAnswer.map((row) => (
                    // `waiting`, not `correction`. A dashed rule is this
                    // system's word for a place not yet filled, which is
                    // exactly what an unanswered question is. `correction` is
                    // 2px solid ink and means an *error* — and the row's own
                    // note says "Which one?", not "you got this wrong".
                    <Slot
                      key={row.lineNo}
                      state="waiting"
                      testId="sheet-choice"
                    >
                      <span className="flex w-full flex-col gap-2">
                        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <PlanLine row={row} />
                          <span className="slot-label">
                            {STATUS_NOTE.ambiguous}
                          </span>
                        </span>
                        <label className="flex flex-col gap-1">
                          <span className="sr-only">
                            Who line {row.lineNo}, {row.typed}, means
                          </span>
                          <select
                            name={`choice-${row.lineNo}`}
                            defaultValue=""
                            data-testid={`sheet-choice-${row.lineNo}`}
                            className={selectStyles}
                          >
                            <option value="">Leave this line out</option>
                            {row.candidates.map((candidate) => (
                              <option key={candidate.id} value={candidate.id}>
                                {candidate.name} · {candidate.club} ·{" "}
                                {candidate.position}
                              </option>
                            ))}
                          </select>
                        </label>
                      </span>
                    </Slot>
                  ))}
                </Slots>
              </div>
            ) : null}

            {unresolved.length > 0 ? (
              <Slots
                testId="sheet-unresolved"
                label="Lines that will be left out"
              >
                {unresolved.slice(0, SAMPLE).map((row) => (
                  // Wrapping, not `nowrap`. The note is a whole sentence and it
                  // must be allowed to take its own line rather than pushing
                  // the line number and the typed name out of the row.
                  <Slot key={row.lineNo} state="waiting">
                    <span className="flex w-full flex-col gap-1">
                      <PlanLine row={row} />
                      {/* A sentence, set as a sentence. `slot-label` is
                          11px caps at 0.14em tracking — right for "L3" or
                          "Which one?", wrong for 65 characters of prose, which
                          the in-page detector flagged as `all-caps-body` and
                          which wrapped to two shouting lines on a phone. */}
                      <span className="max-w-prose text-sm text-ink-soft">
                        {STATUS_NOTE[row.status]}
                      </span>
                    </span>
                  </Slot>
                ))}
                {unresolved.length > SAMPLE ? (
                  <Slot state="waiting">
                    <span className="text-sm text-ink-soft">
                      …and {unresolved.length - SAMPLE} more lines left out.
                    </span>
                  </Slot>
                ) : null}
              </Slots>
            ) : null}

            {resolved.length > 0 ? (
              <Slots
                testId="sheet-resolved"
                label="The ranking this would save"
              >
                {resolved.slice(0, SAMPLE).map((row) => (
                  <Slot key={row.lineNo} nowrap>
                    <span className="flex min-w-0 flex-1 items-baseline gap-x-3 overflow-hidden">
                      <span className="slot-label w-8 shrink-0 text-right tabular-nums text-ink-soft">
                        #{row.rank}
                      </span>
                      <span
                        className="min-w-0 truncate"
                        title={row.player?.name}
                      >
                        <CardName scale="slot">{row.player?.name}</CardName>
                      </span>
                      <span className="slot-label">{row.player?.club}</span>
                      {row.player ? (
                        <PositionPatch position={row.player.position} />
                      ) : null}
                    </span>
                    {/* Only when the match changed something. A surname typed
                        against "Surname, Firstname" is not a change, and
                        annotating it truncated the matched name to print the
                        input — on every row. */}
                    {row.player &&
                    !isPlainAbbreviation(row.typed, row.player.name) ? (
                      <span className="slot-label shrink-0 text-ink-faint">
                        was “{row.typed}”
                      </span>
                    ) : null}
                  </Slot>
                ))}
                {resolved.length > SAMPLE ? (
                  <Slot>
                    <span className="text-sm text-ink-soft">
                      …and {resolved.length - SAMPLE} more, in the order you
                      wrote them.
                    </span>
                  </Slot>
                ) : null}
              </Slots>
            ) : null}

            {plan.problems.length > 0 ? (
              <Correction testId="sheet-problems">
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

            {/* The outcome, where the thumb is.
                
                It used to render in the *Paste a list* bank above — measured at
                133px above the viewport on a phone, with nothing scrolling to
                it and no live region anywhere on the surface. Pressing the red
                button did nothing you could see or hear. It sits directly over
                the button now, and it is `slot-filled`: `slot-live` is the
                2px marker and DESIGN.md gives it one meaning, which is that a
                slot is on the clock — a meaning this page must not borrow while
                a draft is running on the same phone. */}
            {result.saved ? (
              <div
                data-testid="sheet-saved"
                role="status"
                className="slot-filled px-3 py-3"
              >
                <p className="slot-label">Saved</p>
                <p className="mt-1 text-sm">
                  {result.saved.ranked} ranked
                  {result.saved.tiers > 0
                    ? ` · ${result.saved.tiers} tier ${result.saved.tiers === 1 ? "break" : "breaks"}`
                    : ""}
                  {result.saved.skipped > 0
                    ? ` · ${result.saved.skipped} left out`
                    : ""}
                  . Autodraft uses this from now on.
                </p>
              </div>
            ) : (
              <p className="max-w-prose text-sm text-ink-soft">
                {hasSheet
                  ? "This replaces the sheet you have now, whole."
                  : "This becomes your sheet."}
              </p>
            )}
            <SubmitButton
              testId="sheet-apply"
              tone="live"
              pendingLabel="Saving…"
            >
              Save this sheet
            </SubmitButton>
          </form>
        </Bank>
      ) : null}

      {hasSheet ? (
        <Bank label="Start again">
          {/* Armed, then meant. The only control on this surface that destroys
              work, and it had been a single tap with no undo — while the sheet
              itself could not be read back out, so there was no copy of it
              anywhere. Reading it back into the box above is the real fix; this
              is the guard rail beside it. The pool's Enter-to-arm is the
              precedent, and `slot-correction` is the material 1.4 shipped for a
              row that needs looking at twice. */}
          <form action={action} className="flex flex-col gap-4">
            <input type="hidden" name="leagueId" value={leagueId} />
            <input type="hidden" name="intent" value="clear" />
            <p className="max-w-prose text-sm text-ink-soft">
              Throwing the sheet away leaves autodraft with nothing of yours to
              go on. It is not a pick and nothing on the board changes. The list
              is in the box above if you want to keep a copy first.
            </p>
            {armed ? (
              <div className="slot-correction flex flex-col gap-3 px-3 py-3">
                <p className="text-sm">
                  Delete your ranking of{" "}
                  {poolSize > 0 ? "these players" : "players"}? This cannot be
                  undone.
                </p>
                <div className="flex flex-wrap gap-3">
                  <SubmitButton
                    testId="sheet-clear-confirm"
                    compact
                    pendingLabel="Deleting…"
                  >
                    Yes, delete it
                  </SubmitButton>
                  <button
                    type="button"
                    onClick={() => setArmed(false)}
                    data-testid="sheet-clear-cancel"
                    className="slot-label min-h-11 min-w-11 px-4 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
                  >
                    Keep it
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setArmed(true)}
                data-testid="sheet-clear"
                className="min-h-11 w-full border border-ink/50 px-4 py-3 text-slot font-semibold uppercase tracking-[0.14em] transition-colors hover:border-ink/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live sm:w-auto"
              >
                Delete my sheet
              </button>
            )}
          </form>
        </Bank>
      ) : null}

      {result.cleared ? (
        <p
          role="status"
          data-testid="sheet-cleared"
          className="slot-filled max-w-prose px-3 py-3 text-sm"
        >
          Your sheet is gone. Autodraft has nothing of yours to go on until you
          write another one.
        </p>
      ) : null}
    </>
  );
}
