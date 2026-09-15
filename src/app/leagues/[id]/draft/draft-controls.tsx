"use client";

import { useActionState, useState } from "react";

import {
  Bank,
  CardName,
  Correction,
  Field,
  Slot,
  Slots,
  inputStyles,
} from "@/components/board";
import { SubmitButton } from "@/components/submit-button";
import {
  resetDraft,
  rollbackDraft,
  setAutodraft,
  setDraftPaused,
  setPickClock,
  type DraftResult,
} from "@/lib/drafts/actions";
import { RESET_CONFIRMATION } from "@/lib/drafts/types";
import { MAX_PICK_SECONDS, MIN_PICK_SECONDS } from "@/lib/leagues/settings";

/**
 * The commissioner's panel — slice 9.2, and the part of blueprint D13 that was
 * cut and has been asked for back.
 *
 * Until now this was a bare `<div className="flex flex-col gap-3">` holding
 * pause, undo and start-over: no heading, no frame, no name in the accessibility
 * tree — an anonymous region between "Draft for me" and the pool, on the one
 * surface where the person running the night needs to find a control in a
 * hurry. It is a framed `Bank` now, a sibling of the pool, the radar and the
 * board (D17 allows one frame per task and forbids nesting).
 *
 * Six controls, ordered by how much they cost:
 *
 * - **Pause** is free and reversible.
 * - **Pick for them** is where a manager goes when a phone dies. It costs
 *   nothing: it takes them to the pool, which is the only place a pick lands.
 * - **The clock** changes a rule of the room, and restarts from now.
 * - **Autodraft, per member** hands somebody's turns to the engine until it is
 *   handed back.
 * - **Undo** takes the board back to a pick and can be walked forward again.
 * - **Start over** throws the draft away, which is the one thing here that
 *   cannot be undone — so it is folded away, states what it will discard, and
 *   asks for a typed word rather than a tap.
 *
 * Shown to managers and refused server-side for anyone else — the same rule as
 * the rest of the league's controls. Rendering them conditionally is a nicety;
 * refusing them is the part that matters.
 */
const START: DraftResult = { error: null };

/** A member of this league, as this panel needs them. */
type PanelMember = {
  id: string;
  name: string;
  isYou: boolean;
  autodraftEnabled: boolean;
};

/**
 * Take the manager to the pool, with the search box focused.
 *
 * "Pick for them" has existed since 2.4 and has never had a control: it is the
 * pool's Bank heading, so a manager whose teammate's phone died had to scroll
 * past the radar's worth of screen, notice the heading had changed, and infer
 * that the pool in front of them was now somebody else's. The act itself is
 * unchanged — the pick is still a tap on a row and still re-decided by the
 * server — this only shortens the walk to it.
 *
 * The same shape the radar uses to reveal a board column: an `href` that works
 * with no JavaScript, and a handler that does the better thing when there is
 * some. Focus goes to the search box rather than the first row, because a
 * manager picking for somebody else is looking for a name they have been told
 * out loud, and on a phone focusing the input also opens the keyboard.
 */
function revealPool(event: { preventDefault: () => void }): void {
  const search = document.querySelector<HTMLInputElement>(
    '[data-testid="pool-search"]',
  );
  if (!search) return;

  event.preventDefault();
  search.focus({ preventScroll: true });
  search.scrollIntoView({ block: "start" });

  // The band is `sticky top-0` and would otherwise sit over the box we have
  // just focused. Measured rather than guessed at, exactly as the radar does.
  const band = document.querySelector<HTMLElement>(
    '[data-testid="on-the-clock"]',
  );
  if (!band) return;
  const clearance =
    search.getBoundingClientRect().top - band.getBoundingClientRect().bottom - 8;
  window.scrollBy({ top: clearance });
}

/**
 * One member's autodraft switch.
 *
 * `setAutodraft` has accepted a `memberId` and permitted a manager to set it
 * for anybody since 2.5 — the flag simply never reached a surface, because
 * `getDraftView` did not ship anyone else's. This is that surface.
 *
 * Its own `useActionState`, so a refusal lands on the row it belongs to rather
 * than at the top of a panel of twelve identical rows.
 */
function MemberAutodraft({
  leagueId,
  member,
  onClock,
}: {
  leagueId: string;
  member: PanelMember;
  onClock: boolean;
}) {
  const [result, action] = useActionState(setAutodraft, START);

  return (
    <Slot state={onClock ? "live" : "filled"} testId="autodraft-member">
      <span className="flex min-w-0 flex-col gap-1">
        <CardName scale="slot">
          {member.name}
          {member.isYou ? " · you" : ""}
        </CardName>
        <span className="text-sm text-ink-soft">
          {member.autodraftEnabled
            ? "The engine picks for them, the moment their turn comes"
            : onClock
              ? "On the clock now"
              : "They pick for themselves"}
        </span>
      </span>
      <form action={action} className="flex shrink-0 flex-col gap-2">
        <input type="hidden" name="leagueId" value={leagueId} />
        <input type="hidden" name="memberId" value={member.id} />
        <input
          type="hidden"
          name="enabled"
          value={member.autodraftEnabled ? "false" : "true"}
        />
        <SubmitButton
          compact
          testId={`autodraft-for-${member.id}`}
          ariaLabel={
            member.autodraftEnabled
              ? `Stop autodrafting for ${member.name}`
              : `Autodraft for ${member.name}`
          }
          pendingLabel={member.autodraftEnabled ? "Handing back…" : "Arming…"}
        >
          {member.autodraftEnabled ? "Hand it back" : "Draft for them"}
        </SubmitButton>
        {result.error ? (
          <Correction testId="autodraft-member-error">{result.error}</Correction>
        ) : null}
      </form>
    </Slot>
  );
}

/**
 * The pick clock, changeable mid-draft.
 *
 * D13 cut this with the argument that a sensibly-set timer never needs
 * changing and pause covers the rest. A real draft night disagrees in one
 * direction reliably: the room that set 120 seconds in the lobby and then
 * spends an hour on round three wants 45. The correctness question it also
 * named — what happens to a deadline already running — is answered in
 * `setPickClock`, not here: the new clock starts from now.
 */
function PickClockForm({
  leagueId,
  pickSeconds,
  paused,
}: {
  leagueId: string;
  pickSeconds: number;
  paused: boolean;
}) {
  const [result, action] = useActionState(setPickClock, START);
  const [seconds, setSeconds] = useState(String(pickSeconds));

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="leagueId" value={leagueId} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-40">
          {/* The bounds are in the label and on the input, the way the lobby's
              setup form states them: a browser bubble arrives before a round
              trip, and the server checks them again for a crafted post. */}
          <Field label={`Seconds a pick (${MIN_PICK_SECONDS}–${MAX_PICK_SECONDS})`}>
            <input
              name="pickSeconds"
              type="number"
              inputMode="numeric"
              min={MIN_PICK_SECONDS}
              max={MAX_PICK_SECONDS}
              value={seconds}
              onChange={(event) => setSeconds(event.target.value)}
              data-testid="draft-clock-seconds"
              className={inputStyles}
            />
          </Field>
        </div>
        <SubmitButton testId="draft-clock" pendingLabel="Setting…">
          Set the clock
        </SubmitButton>
      </div>
      {/* Said before the button, because the restart is the surprising half:
          everybody in the room is watching a countdown that will jump. */}
      <p className="text-sm text-ink-soft" data-testid="draft-clock-note">
        {paused
          ? "The new clock starts when you resume."
          : "The clock on the current pick restarts from now, so shortening it never expires somebody mid-turn."}
      </p>
      {result.error ? (
        <Correction testId="draft-clock-error">{result.error}</Correction>
      ) : null}
    </form>
  );
}

export function DraftControls({
  leagueId,
  status,
  canManage,
  picksMade,
  pickSeconds,
  members,
  onClockMemberId,
  onClockMemberName,
}: {
  leagueId: string;
  status: string;
  /** Only a manager sees these. The actions refuse anyone else regardless. */
  canManage: boolean;
  /** How far the board has got — the undo has nothing to do before pick 1. */
  picksMade: number;
  /** The clock as the draft record holds it, which is what the worker enforces. */
  pickSeconds: number;
  /** Every member, in draft order — the order the board and the radar read. */
  members: readonly PanelMember[];
  onClockMemberId: string | null;
  onClockMemberName: string | null;
}) {
  const [result, action] = useActionState(setDraftPaused, START);
  const [undone, undoAction] = useActionState(rollbackDraft, START);
  const [reset, resetAction] = useActionState(resetDraft, START);
  const [showUndo, setShowUndo] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [target, setTarget] = useState(String(picksMade));
  if (!canManage) return null;

  const paused = status === "paused";
  const complete = status === "complete";

  // What *this* number would cost, named before the irreversible act. Read
  // off the board as rendered — the server decides the real count when the
  // form lands — so it is a preview, and worded as one.
  const targetNo = Number(target);
  const wouldDiscard =
    Number.isInteger(targetNo) && targetNo >= 1 && targetNo <= picksMade
      ? picksMade - targetNo + 1
      : null;

  const armed = members.filter((member) => member.autodraftEnabled).length;
  // On your own turn the pool below is already yours and says so in its
  // heading, so a "Pick for me" would be a second control for one act.
  const onClockIsYou = members.some(
    (member) => member.id === onClockMemberId && member.isYou,
  );

  return (
    <Bank
      label="Running the draft"
      testId="draft-controls"
      aside={complete ? "complete" : `${pickSeconds}s a pick`}
      framed
    >
      {result.error ? (
        <Correction testId="draft-control-error">{result.error}</Correction>
      ) : null}
      {complete ? null : (
        <form action={action}>
          <input type="hidden" name="leagueId" value={leagueId} />
          <input
            type="hidden"
            name="paused"
            value={paused ? "false" : "true"}
          />
          <SubmitButton
            testId="draft-pause"
            pendingLabel={paused ? "Resuming…" : "Pausing…"}
          >
            {paused ? "Resume the draft" : "Pause the draft"}
          </SubmitButton>
        </form>
      )}
      {paused ? (
        <p className="slot-label text-live">
          Paused &middot; the clock restarts when you resume
        </p>
      ) : null}

      {/* The walk to the pool, for the phone that died. Only while a pick can
          actually land, and only when the turn is somebody else's — on your
          own turn the pool below is already yours and this would be a second
          way to say so. */}
      {!paused && !complete && onClockMemberName && !onClockIsYou ? (
        <a
          href="#pool-search"
          onClick={revealPool}
          data-testid="pick-for-them"
          className="slot-label inline-flex min-h-11 items-center self-start border border-ink/50 px-4 transition-colors hover:border-ink/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
        >
          Pick for {onClockMemberName} &darr;
        </a>
      ) : null}

      {complete ? null : (
        <PickClockForm
          leagueId={leagueId}
          pickSeconds={pickSeconds}
          paused={paused}
        />
      )}

      {/* Autodraft, per member. Not folded: it is the control a manager reaches
          for while somebody's turn is running out, and a fold is a tap and a
          scroll they do not have. `Slots` names the run for a screen reader. */}
      {complete ? null : (
        <div className="flex flex-col gap-2">
          <p className="slot-label">
            Autodraft &middot;{" "}
            {armed === 0
              ? "nobody"
              : armed === members.length
                ? "everybody"
                : `${armed} of ${members.length}`}
          </p>
          <Slots testId="autodraft-members" label="Autodraft by member">
            {members.map((member) => (
              <MemberAutodraft
                key={member.id}
                leagueId={leagueId}
                member={member}
                onClock={member.id === onClockMemberId}
              />
            ))}
          </Slots>
        </div>
      )}

      {/* Undo. Folded away behind a toggle, because a control that discards
          picks should take a deliberate act to reach — and unfolded it states
          what it will do before you can press it. */}
      {picksMade > 0 ? (
        <div className="flex flex-col gap-3">
          {undone.error ? (
            <Correction testId="draft-undo-error">{undone.error}</Correction>
          ) : null}
          <button
            type="button"
            onClick={() => setShowUndo((open) => !open)}
            data-testid="draft-undo-toggle"
            className="slot-label self-start underline underline-offset-4 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
          >
            {showUndo ? "Never mind" : "Undo a pick"}
          </button>
          {showUndo ? (
            <form action={undoAction} className="flex flex-col gap-3">
              <input type="hidden" name="leagueId" value={leagueId} />
              <Field label="Undo back to pick number">
                <input
                  name="targetPickNo"
                  type="number"
                  min={1}
                  // No `max`: `picksMade` is already stale if anyone picked
                  // while this was open, and a browser bubble refusing a number
                  // the server would have explained is a worse answer than the
                  // server's own. The engine bounds it either way.
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                  data-testid="draft-undo-target"
                  className={inputStyles}
                />
              </Field>
              <p className="text-sm text-ink-soft" data-testid="draft-undo-cost">
                {wouldDiscard === null
                  ? `Nothing has been picked at ${target || "that number"} or later. `
                  : wouldDiscard === 1
                    ? `Undoing to pick ${targetNo} discards that one pick. `
                    : `Undoing to pick ${targetNo} discards ${wouldDiscard} picks — that one and everything after it. `}
                {picksMade === 1 ? "One pick has" : `${picksMade} picks have`}{" "}
                been made.
              </p>
              <SubmitButton testId="draft-undo" pendingLabel="Undoing…">
                Undo and pause
              </SubmitButton>
            </form>
          ) : null}
        </div>
      ) : null}

      {/* Reset. Last, folded, and the only control here that destroys work.
          Not marker-toned: the pick is this room's one act, and spending the
          marker on a destructive control would be spending it twice
          (DESIGN.md, the Two Jobs Rule). */}
      <div className="flex flex-col gap-3 border-t border-rule pt-3">
        {reset.error ? (
          <Correction testId="draft-reset-error">{reset.error}</Correction>
        ) : null}
        <button
          type="button"
          onClick={() => setShowReset((open) => !open)}
          data-testid="draft-reset-toggle"
          className="slot-label self-start underline underline-offset-4 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
        >
          {showReset ? "Never mind" : "Start over"}
        </button>
        {showReset ? (
          <form action={resetAction} className="flex flex-col gap-3">
            <input type="hidden" name="leagueId" value={leagueId} />
            <p className="text-sm text-ink-soft">
              This deletes the draft and{" "}
              {picksMade === 0
                ? "returns the league to the lobby"
                : picksMade === 1
                  ? "the one pick made so far, and returns the league to the lobby"
                  : `all ${picksMade} picks made so far, and returns the league to the lobby`}
              . The draft order is kept, so you can start again or re-roll it.
              Nothing brings the board back.
            </p>
            <Field label={`Type ${RESET_CONFIRMATION} to confirm`}>
              <input
                name="confirm"
                autoComplete="off"
                autoCapitalize="characters"
                data-testid="draft-reset-confirm"
                className={inputStyles}
              />
            </Field>
            <SubmitButton testId="draft-reset" pendingLabel="Starting over…">
              Delete the draft
            </SubmitButton>
          </form>
        ) : null}
      </div>
    </Bank>
  );
}
