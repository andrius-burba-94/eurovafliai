import Link from "next/link";
import { redirect } from "next/navigation";

import {
  BackLink,
  Bank,
  PositionPatch,
  Sheet,
  TopRail,
} from "@/components/board";
import { DraftBoard, type BoardEntry } from "@/components/draft-board";
import { LeagueChat } from "@/components/league-chat";
import { RosterRadar } from "@/components/roster-radar";
import { getSession } from "@/lib/auth/session";
import { getDraftView } from "@/lib/drafts/queries";
import { buildBoardShape } from "@/lib/engine";

import { AutodraftToggle } from "./autodraft-toggle";
import { DraftControls } from "./draft-controls";
import { LiveDraft } from "./live-draft";
import { PickClock } from "./pick-clock";
import { PickForm } from "./pick-form";


/**
 * The draft room — slices 2.4/2.6, live since 3.2a, with the board since 3.1.
 *
 * On the clock, a way to pick, the pool to pick from ranked by your own cheat
 * sheet, the radar of what every roster still needs, and the board itself.
 * Still to come in Phase 3: chat (3.5) and the rest of the commissioner
 * console (3.6). It renders server-side so the state is correct before any
 * JavaScript does anything.
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
  // No draft to show: either there has never been one, or the commissioner has
  // just reset it — in which case every other room in the league gets a delete
  // event and lands here a moment later. The lobby is the honest destination
  // for all of those; a 404 would be the app telling the league its own league
  // does not exist. (If the *league* is gone, the lobby says so properly.)
  if (!view) redirect(`/leagues/${id}`);

  const { draft, picks, onClock, isYourTurn, yourNeeds } = view;
  // Three states, not two. The engine says nobody is on the clock while a
  // draft is paused, which is right — but reading that as "finished" told a
  // paused room every slot was filled.
  const isPaused = draft.status === "paused";

  // The board's shape is the engine's, derived from the same order the clock is
  // driven by — see the note on `buildBoardShape`. The page's only job is to
  // put the picks it read into the places the engine named.
  const shape = buildBoardShape(draft.format, draft.order, draft.rounds);
  const nameOf = new Map(view.members.map((member) => [member.id, member]));
  const columns = draft.order.map((memberId) => ({
    memberId,
    name: nameOf.get(memberId)?.name ?? "Unknown member",
    isYou: Boolean(nameOf.get(memberId)?.isYou),
  }));
  const entries = new Map<number, BoardEntry>(
    picks.map((pick) => [
      pick.overallNo,
      {
        playerName: pick.playerName,
        position: pick.position,
        isAuto: pick.isAuto,
      },
    ]),
  );
  const needs = (["G", "F", "C"] as const).filter(
    (position) => yourNeeds[position] > 0,
  );

  return (
    <>
      <TopRail action={<BackLink href={`/leagues/${id}`}>Lobby</BackLink>} />
      <Sheet testId="draft-room">
        {/* On the clock owns the top of the phone viewport, sharing it with
            nothing — the raise the direction contract took from the vertical
            feed. And it **stays** there: `sticky top-0`.
            
            Without it the countdown and the search box could not both be on a
            390px screen once you had scrolled into the pool, so "under a minute
            to find a player and commit" was an instruction you could not follow
            while watching the clock. The precedent is in this app already — the
            board's round gutter is `sticky left-0` on stock — and it needs no
            new material: `slot-live` and `slot-filled` are both opaque, and
            `bg-stock` covers the case where neither applies so rows cannot show
            through. `py-3` on a phone rather than `py-5`, because a band that
            never leaves should cost the viewport less. */}
        <div
          data-testid="on-the-clock"
          // `bg-stock` only where the state does not bring its own opaque
          // field. `slot-live` carries the blush, and adding `bg-stock`
          // alongside it painted straight over that — the banner lost the
          // live tint it has had since 1.4, because both set `background-color`
          // and the plain utility wins. A finished draft is `slot-filled`,
          // which is a border and nothing else, so that one does need a field
          // or the board would scroll through it.
          className={`sticky top-0 z-20 px-3 py-3 sm:py-5 ${
            isPaused || onClock ? "slot-live" : "slot-filled bg-stock"
          }`}
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
        <LiveDraft draftId={draft.id} leagueId={id} authToken={session.token} />

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

        {/* The way to a sheet for somebody who has not written one — the pool
            pins a link for everybody who has. Shown to a member only: a
            commissioner with no membership row has no roster to rank for. */}
        {view.you && view.sheet.length === 0 ? (
          <Link
            href={`/leagues/${id}/sheet`}
            data-testid="write-a-sheet"
            className="slot-waiting flex min-h-11 items-baseline justify-between gap-4 px-3 py-3 transition-colors hover:bg-ink/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
          >
            <span className="text-sm text-ink-soft">
              You have no cheat sheet. Autodraft has nothing of yours to go on.
            </span>
            <span className="slot-label shrink-0">Write one &rarr;</span>
          </Link>
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
            aside={`${view.availableCount} available`}
          >
            {isPaused ? (
              <p className="slot-waiting px-3 py-4 text-sm text-ink-soft">
                Picking is paused. The pool is still here to look through.
              </p>
            ) : null}
            <PickForm
              leagueId={id}
              view={{
                pool: view.pool,
                isYourTurn,
                clockNeeds: view.clockNeeds,
                yourNeeds,
                clockMemberName: onClock?.memberName ?? null,
                sheet: view.sheet,
                bestFromSheet: view.bestFromSheet,
              }}
              canPick={(isYourTurn || view.canManage) && !isPaused && !!onClock}
            />
          </Bank>
        ) : null}

        {/* Between the pool and the board on purpose. The pick path owns the
            top of the room — clock, then a way to pick — and the radar is the
            first thing you meet when you scroll to *study* the draft rather
            than to act in it. It also pairs with the board: the radar is
            sorted by what a roster is missing, the board by when a pick
            happened, and the two answer different questions. */}
        <Bank
          label="The radar"
          aside={`${draft.order.length} rosters × ${view.rosterTotal}`}
        >
          <RosterRadar
            rows={view.radar}
            columns={columns}
            total={view.rosterTotal}
            onClockMemberId={onClock?.memberId ?? null}
          />
        </Bank>

        {/* The board proper. No empty state: an empty board is still a board,
            which is the whole of the Board-Shows-Its-Shape rule. */}
        <Bank
          label="The board"
          aside={`${picks.length} of ${draft.order.length * draft.rounds}`}
        >
          <DraftBoard
            shape={shape}
            columns={columns}
            entries={entries}
            markedOverallNo={view.markedOverallNo}
            isPaused={isPaused}
          />
        </Bank>

        {/* Where the ticker was.

            3.1's argument for a ticker was that "the board holds the history
            and the run is better at the sentence". Chat is now the thing that
            is better at the sentence: it carries the same chronological run of
            who took whom — every pick announces itself — plus the rolls,
            pauses and rollbacks the ticker never knew about, plus what people
            are actually saying. Keeping both would put the same fact on screen
            twice, 200px apart, which is a duplication this project's critiques
            have caught twice already.

            The trade, stated: collapsed, the room shows one line of recent
            activity where the ticker showed eight. The board above it still
            holds every pick, and one tap gives the full transcript. */}
        <LeagueChat
          leagueId={id}
          authToken={session.token}
          initial={view.chat}
          myMemberId={view.you?.memberId ?? null}
        />
      </Sheet>
    </>
  );
}
