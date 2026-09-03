import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  BackArrow,
  Bank,
  CardName,
  PositionPatch,
  Sheet,
  Slot,
  Slots,
  TopRail,
} from "@/components/board";
import { getSession } from "@/lib/auth/session";
import { getDraftView } from "@/lib/drafts/queries";

import { AutodraftToggle } from "./autodraft-toggle";
import { DraftControls } from "./draft-controls";
import { LiveDraft } from "./live-draft";
import { PickClock } from "./pick-clock";
import { PickForm } from "./pick-form";

/**
 * The draft room — slices 2.4/2.6, live since 3.2a.
 *
 * On the clock, the board so far, and a way to pick. The flagship version is
 * the rest of Phase 3: the rounds-by-teams grid, the live roster radar, fuzzy
 * search, cheat sheets. This one exists to prove the pipeline runs, and it
 * renders server-side so the state is correct before any JavaScript does
 * anything.
 *
 * `LiveDraft` is what keeps it correct *after* that: it subscribes to this
 * draft over SSE and asks this page to render again. Every fact on screen is
 * still decided here, on the server — the client's whole job is to notice that
 * something changed.
 */
export default async function DraftPage({
  params,
}: PageProps<"/leagues/[id]/draft">) {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");

  const { id } = await params;
  const view = await getDraftView(id);
  if (!view) notFound();

  const { draft, picks, onClock, isYourTurn, yourNeeds } = view;
  // Three states, not two. The engine says nobody is on the clock while a
  // draft is paused, which is right — but reading that as "finished" told a
  // paused room every slot was filled.
  const isPaused = draft.status === "paused";
  const needs = (["G", "F", "C"] as const).filter(
    (position) => yourNeeds[position] > 0,
  );

  return (
    <>
      <TopRail
        action={
          <Link
            href={`/leagues/${id}`}
            className="slot-label inline-flex items-center gap-1.5 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
          >
            <BackArrow />
            Lobby
          </Link>
        }
      />
      <Sheet testId="draft-room">
        {/* On the clock owns the top of the phone viewport, sharing it with
            nothing — the raise the direction contract took from the vertical
            feed. */}
        <div
          data-testid="on-the-clock"
          className={
            isPaused || onClock
              ? "slot-live px-3 py-5"
              : "slot-filled px-3 py-5"
          }
        >
          {isPaused ? (
            <>
              <p className="slot-label">
                Paused &middot; pick {draft.current_pick}
              </p>
              <p className="mt-1 text-2xl font-semibold uppercase tracking-[0.04em] sm:text-3xl">
                The draft is paused
              </p>
            </>
          ) : onClock ? (
            <>
              <p className="slot-label">
                Pick {onClock.overallNo} &middot; round {onClock.round}
              </p>
              <p className="mt-1 text-2xl font-semibold uppercase tracking-[0.04em] sm:text-3xl">
                {isYourTurn
                  ? "You are on the clock"
                  : `${onClock.memberName} is on the clock`}
              </p>
              {/* The clock is the room's, not the picker's: everybody watches
                  the same number run down. It only renders while a draft is
                  live, which is the only state `onClock` is non-null in. */}
              <PickClock deadline={draft.deadline} />
            </>
          ) : (
            <>
              <p className="slot-label">Complete</p>
              <p className="mt-1 text-2xl font-semibold uppercase tracking-[0.04em]">
                Every slot is filled
              </p>
            </>
          )}
        </div>

        {/* Renders nothing while the subscription is healthy. It is mounted
            here, high in the room, because "this board may be behind" is only
            useful next to the board it is about. */}
        <LiveDraft
          draftId={draft.id}
          leagueId={id}
          authToken={session.token}
        />

        {needs.length > 0 ? (
          <p className="flex flex-wrap items-center gap-2">
            <span className="slot-label">You still need</span>
            {needs.map((position) => (
              <PositionPatch
                key={position}
                position={position}
                count={yourNeeds[position]}
              />
            ))}
          </p>
        ) : null}

        {/* Your own switch, above the commissioner's controls: the common
            case is a member handing their own picks over, not a manager
            intervening. */}
        {view.you && draft.status !== "complete" ? (
          <AutodraftToggle
            leagueId={id}
            enabled={view.you.autodraftEnabled}
            pickSeconds={draft.pick_seconds}
          />
        ) : null}

        <DraftControls
          leagueId={id}
          status={draft.status}
          canManage={view.canManage}
          picksMade={picks.length}
        />

        {/* The pool stays readable while paused — you just cannot pick from
            it. Offering a button the server is about to refuse would be worse
            than not offering one. */}
        {draft.status !== "complete" ? (
          <Bank
            label={
              isPaused
                ? "The pool"
                : isYourTurn
                  ? "Make your pick"
                  : onClock && view.canManage
                    ? `Pick for ${onClock.memberName}`
                    : "The pool"
            }
            aside={`${view.available.length} available`}
          >
            {isPaused ? (
              <p className="slot-waiting px-3 py-4 text-sm text-ink-soft">
                Picking is paused. The pool is still here to look through.
              </p>
            ) : null}
            <PickForm
              leagueId={id}
              view={{ available: view.available, isYourTurn }}
              canPick={(isYourTurn || view.canManage) && !isPaused && !!onClock}
            />
          </Bank>
        ) : null}

        <Bank
          label="The board"
          aside={`${picks.length} of ${draft.order.length * draft.rounds}`}
        >
          {picks.length === 0 ? (
            <div className="slot-waiting px-3 py-5">
              <p className="text-sm text-ink-soft">No picks yet.</p>
            </div>
          ) : (
            <Slots testId="pick-list">
              {[...picks].reverse().map((pick) => (
                <Slot key={pick.id} testId="board-pick">
                  <span className="flex flex-wrap items-baseline gap-x-3">
                    <span className="slot-label tabular-nums text-live">
                      {String(pick.overallNo).padStart(2, "0")}
                    </span>
                    <CardName>{pick.playerName}</CardName>
                    <PositionPatch position={pick.position} />
                    <span className="slot-label">{pick.playerClub}</span>
                  </span>
                  <span className="slot-label">
                    {pick.memberName}
                    {pick.isAuto ? " · auto" : ""}
                  </span>
                </Slot>
              ))}
            </Slots>
          )}
        </Bank>
      </Sheet>
    </>
  );
}
