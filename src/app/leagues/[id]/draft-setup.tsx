"use client";

import { useActionState } from "react";

import {
  Bank,
  Correction,
  Field,
  Slot,
  Slots,
  inputStyles,
} from "@/components/board";
import { SubmitButton } from "@/components/submit-button";
import { startDraft, type DraftResult } from "@/lib/drafts/actions";
import {
  reshuffleDraftOrder,
  rollDraftOrder,
  setManualOrder,
  updateDraftSettings,
  type SetupResult,
} from "@/lib/leagues/draft-setup";
import {
  DRAFT_FORMATS,
  MAX_PICK_SECONDS,
  MIN_PICK_SECONDS,
  type LeagueSettings,
} from "@/lib/leagues/settings";
import type { Member } from "@/lib/leagues/types";

/**
 * The commissioner's draft setup — slice 2.3a.
 *
 * Two decisions and one act: how the order repeats across rounds, how long each
 * pick gets, and then fixing the order. Only the commissioner sees this, and the
 * server checks that again rather than trusting the render.
 *
 * The live animated reveal — the order arriving one slot at a time — is 2.3b.
 * Today the roll lands and the list re-renders with the numbers on it, which the
 * realtime subscription already propagates to everyone in the lobby.
 */

const START: SetupResult = { error: null };
const DRAFT_START: DraftResult = { error: null };

const FORMAT_LABELS: Record<(typeof DRAFT_FORMATS)[number], string> = {
  linear: "Linear — same order every round",
  snake: "Snake — reverses each round",
  snake3rr: "Snake + third-round reversal",
};

export function DraftSetup({
  leagueId,
  settings,
  members,
}: {
  leagueId: string;
  settings: LeagueSettings;
  members: Member[];
}) {
  const [saved, saveAction] = useActionState(updateDraftSettings, START);
  const [rolled, rollAction] = useActionState(rollDraftOrder, START);
  const [manual, manualAction] = useActionState(setManualOrder, START);
  const [reshuffled, reshuffleAction] = useActionState(
    reshuffleDraftOrder,
    START,
  );
  const [started, startAction] = useActionState(startDraft, DRAFT_START);

  const positioned = members.filter((member) => member.draftPosition).length;
  const inOrder = [...members].sort(
    (a, b) => (a.draftPosition ?? 99) - (b.draftPosition ?? 99),
  );

  return (
    <>
      <Bank
        label="Draft setup"
        aside={
          positioned === members.length && members.length > 0
            ? "order fixed"
            : "order not set"
        }
      >
        {saved.error ? (
          <Correction testId="draft-settings-error">{saved.error}</Correction>
        ) : null}
        <form action={saveAction} className="flex flex-col gap-5">
          <input type="hidden" name="leagueId" value={leagueId} />
          <Field label="Format">
            <select
              name="format"
              defaultValue={settings.format}
              data-testid="draft-format"
              className={inputStyles}
            >
              {DRAFT_FORMATS.map((format) => (
                <option key={format} value={format}>
                  {FORMAT_LABELS[format]}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label={`Seconds per pick (${MIN_PICK_SECONDS}–${MAX_PICK_SECONDS})`}
          >
            <input
              name="pick_seconds"
              type="number"
              inputMode="numeric"
              min={MIN_PICK_SECONDS}
              max={MAX_PICK_SECONDS}
              defaultValue={settings.pick_seconds}
              data-testid="draft-pick-seconds"
              className={inputStyles}
            />
          </Field>
          <Field label="How the order is decided">
            <select
              name="order_mode"
              defaultValue={settings.order_mode}
              data-testid="draft-order-mode"
              className={inputStyles}
            >
              <option value="roll">Roll — a seeded shuffle</option>
              <option value="manual">
                By hand — whatever the league agreed
              </option>
              <option value="reverse_standings">
                Reverse standings — needs a finished season
              </option>
            </select>
          </Field>
          <SubmitButton testId="draft-settings-save" pendingLabel="Saving…">
            Save setup
          </SubmitButton>
        </form>
      </Bank>

      <Bank
        label="The order"
        aside={
          settings.roll_seed ? "rolled" : positioned ? "set by hand" : undefined
        }
      >
        {rolled.error ? (
          <Correction testId="draft-order-error">{rolled.error}</Correction>
        ) : null}
        {manual.error ? (
          <Correction testId="draft-manual-error">{manual.error}</Correction>
        ) : null}
        {reshuffled.error ? (
          <Correction testId="draft-reshuffle-error">
            {reshuffled.error}
          </Correction>
        ) : null}

        {positioned > 0 ? (
          <Slots testId="draft-order">
            {inOrder.map((member) => (
              <Slot
                key={member.id}
                state={member.draftPosition ? "filled" : "waiting"}
              >
                <span className="slot-label tabular-nums text-live">
                  {member.draftPosition
                    ? String(member.draftPosition).padStart(2, "0")
                    : "—"}
                </span>
                <span className="text-sm">
                  {member.teamName || member.name}
                </span>
              </Slot>
            ))}
          </Slots>
        ) : (
          <p className="text-sm text-ink-soft">
            Nobody has a slot yet. Rolling is repeatable: the seed is stored, so
            a roll that half-saved can be re-applied without changing who drafts
            first.
          </p>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <form action={rollAction} className="sm:flex-1">
            <input type="hidden" name="leagueId" value={leagueId} />
            <SubmitButton
              testId="draft-roll"
              tone="live"
              pendingLabel="Rolling…"
            >
              {settings.roll_seed ? "Re-apply the roll" : "Roll the order"}
            </SubmitButton>
          </form>

          {/* By hand: submit the members in the order the league agreed. The
              order of these hidden fields IS the submitted order, so the list
              above is what gets saved — no drag-and-drop until 3.4 brings
              dnd-kit for cheat sheets. */}
          <form action={manualAction} className="sm:flex-1">
            <input type="hidden" name="leagueId" value={leagueId} />
            {inOrder.map((member) => (
              <input
                key={member.id}
                type="hidden"
                name="order"
                value={member.id}
              />
            ))}
            <SubmitButton testId="draft-manual" pendingLabel="Saving…">
              Keep this order
            </SubmitButton>
          </form>
        </div>

        {/* Once everyone has a slot there is nothing left to decide, so the
            draft can start. The action re-checks the order server-side — this
            button appearing is not what makes it legal. */}
        {positioned === members.length && members.length >= 2 ? (
          <form action={startAction} className="flex flex-col gap-3">
            <input type="hidden" name="leagueId" value={leagueId} />
            {started.error ? (
              <Correction testId="start-draft-error">
                {started.error}
              </Correction>
            ) : null}
            <SubmitButton
              testId="start-draft"
              tone="live"
              pendingLabel="Opening the room…"
            >
              Start the draft
            </SubmitButton>
          </form>
        ) : null}

        {/* Reshuffling is the one action here that takes something away: it
            throws out an order the room may already have seen. So it is folded
            away, asks for a deliberate tick, and says plainly what it does —
            the opposite of "Re-apply", which is safe to press twice. */}
        {positioned > 0 ? (
          <details className="slot-waiting px-3 py-3">
            <summary className="slot-label cursor-pointer list-none hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live">
              Reshuffle&hellip;
            </summary>
            <form action={reshuffleAction} className="mt-4 flex flex-col gap-4">
              <input type="hidden" name="leagueId" value={leagueId} />
              <p className="text-sm text-ink-soft">
                Draws a completely new order and throws this one away. Everyone
                in the lobby watches it land again.
              </p>
              <label className="flex items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  name="confirm"
                  value="reshuffle"
                  data-testid="draft-reshuffle-confirm"
                  className="size-4 accent-live"
                />
                Yes, change who picks first
              </label>
              <SubmitButton
                testId="draft-reshuffle"
                tone="live"
                pendingLabel="Reshuffling…"
              >
                Reshuffle the order
              </SubmitButton>
            </form>
          </details>
        ) : null}
      </Bank>
    </>
  );
}
