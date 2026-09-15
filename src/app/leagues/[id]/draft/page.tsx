import Link from "next/link";
import { redirect } from "next/navigation";

import {
  BackLink,
  Bank,
  Correction,
  PositionPatch,
  Sheet,
  TopRail,
} from "@/components/board";
import { DraftBoard, type BoardEntry } from "@/components/draft-board";
import { LeagueChat } from "@/components/league-chat";
import { RosterRadar } from "@/components/roster-radar";
import { getSession } from "@/lib/auth/session";
import { getDraftView } from "@/lib/drafts/queries";
import { isStuckReason, stuckSentence } from "@/lib/drafts/stuck";
import { buildBoardShape } from "@/lib/engine";

import { ArmedPickProvider } from "./armed-pick";
import { AutodraftToggle } from "./autodraft-toggle";
import { ClockCue } from "./clock-cue";
import { ConfirmPick } from "./confirm-pick";
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
  const needsLine =
    needs.length > 0 ? (
      <span
        data-testid="draft-needs"
        className="flex flex-wrap items-center gap-2"
      >
        <span className="slot-label">You still need</span>
        {needs.map((position) => (
          <PositionPatch
            key={position}
            position={position}
            count={yourNeeds[position]}
            label={`${yourNeeds[position]} ${
              position === "G"
                ? "guards"
                : position === "F"
                  ? "forwards"
                  : "centers"
            } still needed`}
          />
        ))}
      </span>
    ) : null;

  return (
    <>
      {/* The room is the app's one wide surface — 10.9, and the exception that
          re-answers DESIGN.md's open question 4. Everywhere else is 48rem; here
          the pool you are picking from and the board it lands on have to be
          seen at the same time, and that is a fact about draft night rather
          than a preference about laptops. The rail widens with it so the
          wordmark still aligns with the first slot under it. */}
      <TopRail
        action={<BackLink href={`/leagues/${id}`}>Lobby</BackLink>}
        measure="wide"
      />
      <Sheet testId="draft-room" measure="wide">
        {/* One piece of shared state: the row you have armed. The band's
            confirm and the pool's rows are in different components — and, for
            the band, a different render environment — so a small client
            provider wraps the region containing both. It holds an id and
            nothing else; whose turn it is and whether a pick may land are
            still the engine's, on the server. */}
        <ArmedPickProvider>
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
              <h1 className="mt-1 text-2xl font-semibold uppercase tracking-[0.04em] sm:text-3xl">
                The draft is paused
              </h1>
              {needsLine ? <div className="mt-2">{needsLine}</div> : null}
            </>
          ) : onClock ? (
            <>
              <p className="slot-label">
                Pick {onClock.overallNo} &middot; round {onClock.round}
              </p>
              {/* One step down from the other two headlines, and only this one.
                  
                  A paused draft and a finished one have nothing else to say, so
                  their headline is the band. A live one has a clock, and the
                  clock is what changes: this sentence is identical for the
                  whole of somebody's two minutes. Ranking them the same way
                  made the constant fact the loudest one. It stays `h1` — this
                  is still the room's heading — and the step it gives up is
                  most of what the countdown takes: measured on the real band,
                  the whole thing grows 4px on a Pixel 7 and 12px at 1440,
                  which is the budget a band that never leaves the viewport
                  gets to spend. */}
              <h1 className="mt-1 text-xl font-semibold uppercase tracking-[0.04em] sm:text-2xl">
                {isYourTurn
                  ? "You are on the clock"
                  : `${onClock.memberName} is on the clock`}
              </h1>
              {/* The clock is the room's, not the picker's: everybody watches
                  the same number run down. It only renders while a draft is
                  live, which is the only state `onClock` is non-null in. */}
              {/* Grouped, not spread. `justify-between` put the countdown at
                  one end of the band and what you still need at the other —
                  fine at 48rem, and a metre apart once 10.9 took the room to
                  80rem. They are two halves of one fact: this is your pick, and
                  this is what it has to be. On a phone they still wrap onto
                  their own lines, which is what they did before. */}
              <div className="mt-2 flex flex-wrap items-end gap-x-8 gap-y-3">
                <PickClock deadline={draft.deadline} className="" />
                {needsLine}
              </div>
            </>
          ) : (
            <>
              <p className="slot-label">Complete</p>
              <h1 className="mt-1 text-2xl font-semibold uppercase tracking-[0.04em]">
                Every slot is filled
              </h1>
              {view.you ? (
                <Link
                  href={`/leagues/${id}/standings`}
                  data-testid="enter-standings"
                  className="mt-3 inline-flex border-b border-ink/50 text-sm hover:border-ink/80"
                >
                  Open the standings
                </Link>
              ) : null}
            </>
          )}
          {/* Where a pick actually lands since 3.7. A tap on a pool row arms
              it; this is the tap that drafts, deliberately out of reach of a
              double-tap on the row's own button. Renders nothing at all until
              something is armed, so the band keeps its shape for the eleven
              people who are not picking.
              
              **Outside the paused/on-the-clock/complete branch on purpose.**
              Every refusal revalidates the room, so a stale tab's refused pick
              arrives together with a re-render that flips this band to
              `paused` — and inside the branch, that unmounted the very
              correction the refusal had just produced. */}
          <ConfirmPick
            leagueId={id}
            live={!isPaused && !!onClock}
          />
        </div>

        {/* Renders nothing while the subscription is healthy. It is mounted
            here, high in the room, because "this board may be behind" is only
            useful next to the board it is about. */}
        <LiveDraft draftId={draft.id} authToken={session.token} />

        {/* Full width, above both columns, and first after the band: a draft
            that cannot advance is the room's most important sentence, and the
            commissioner panel it used to sit inside now lives in the watching
            column beside the board. */}
        {view.canManage &&
        draft.stuck_reason &&
        isStuckReason(draft.stuck_reason) ? (
          <Correction testId="draft-stuck">
            {stuckSentence({
              reason: draft.stuck_reason,
              pickNo: draft.current_pick,
            })}
          </Correction>
        ) : null}

        {/* Two columns from `lg` up, one below it — the room's whole layout
            decision, and it is about what a person does rather than about
            screen size. The left column is where you ACT: the sheet nudge, your
            own autodraft switch, and the pool. The right column is what you
            WATCH: the radar, the board, the commissioner's panel and the
            transcript.
            
            On a phone this is one flow in the order it has always been, with
            one change: the commissioner console moves from above the pool to
            below the board. On draft night a commissioner is a picker first —
            they meet the pool every turn and the pause button once a night —
            and the console was 300px of intervention controls between the clock
            and the pick for the one person who cannot avoid it.
            
            `items-start` so the shorter column does not stretch to the taller
            one's height and leave a framed Bank with a metre of empty stock
            under its last row. */}
        <div className="flex flex-col gap-8 sm:gap-slot lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start lg:gap-8">
          <div className="flex flex-col gap-8 sm:gap-slot">
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
              <>
                <AutodraftToggle
                  leagueId={id}
                  enabled={view.you.autodraftEnabled}
                  pickSeconds={draft.pick_seconds}
                />
                {/* Beside "Draft for me": the two controls that are about *you* on
                    draft night, in one place. This one also carries the live
                    region that finally closes PRODUCT.md's promise — being on the
                    clock "announced to assistive tech", open since 2.6. */}
                {/* Rendered only for a member — a commissioner with no membership
                    row has no turn to be told about, so there is nothing for a
                    live region to say. */}
                <ClockCue
                  isYourTurn={isYourTurn}
                  overallNo={onClock?.overallNo ?? null}
                  round={onClock?.round ?? null}
                />
              </>
            ) : null}

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
                framed
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
                    yourNeeds,
                    clockMemberName: onClock?.memberName ?? null,
                    sheet: view.sheet,
                    bestFromSheet: view.bestFromSheet,
                  }}
                  canPick={(isYourTurn || view.canManage) && !isPaused && !!onClock}
                />
              </Bank>
            ) : null}
          </div>
          <div className="flex flex-col gap-8 sm:gap-slot">
            {/* Before the board on purpose. On a phone the pick path owns the top
                of the room — clock, then a way to pick — and the radar is the first
                thing you meet when you scroll to *study* the draft rather than to
                act in it. Beside it at `lg`, it is the head of the watching column
                for the same reason. It also pairs with the board: the radar is
                sorted by what a roster is missing, the board by when a pick
                happened, and the two answer different questions. */}
            <Bank
              label="The radar"
              aside={`${draft.order.length} rosters × ${view.rosterTotal}`}
              framed
            >
              <RosterRadar
                rows={view.radar}
                columns={columns}
                total={view.rosterTotal}
                onClockMemberId={onClock?.memberId ?? null}
                linkToBoard
              />
            </Bank>

            {/* The board proper. No empty state: an empty board is still a board,
                which is the whole of the Board-Shows-Its-Shape rule. */}
            <Bank
              label="The board"
              aside={`${picks.length} of ${draft.order.length * draft.rounds}`}
              framed
            >
              <DraftBoard
                shape={shape}
                columns={columns}
                entries={entries}
                markedOverallNo={view.markedOverallNo}
                isPaused={isPaused}
              />
            </Bank>

            {/* The manager's panel, a sibling framed Bank, and below the board
                since 10.9 — see the column note above. Its member list is in draft
                order — the order the board reads across and the radar reads down —
                so the three surfaces name the same league in the same sequence. */}
            <DraftControls
              leagueId={id}
              status={draft.status}
              canManage={view.canManage}
              picksMade={picks.length}
              pickSeconds={draft.pick_seconds}
              members={draft.order.map((memberId) => ({
                id: memberId,
                name: nameOf.get(memberId)?.name ?? "Unknown member",
                isYou: Boolean(nameOf.get(memberId)?.isYou),
                autodraftEnabled: Boolean(
                  nameOf.get(memberId)?.autodraftEnabled,
                ),
              }))}
              onClockMemberId={onClock?.memberId ?? null}
              onClockMemberName={onClock?.memberName ?? null}
            />

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
              authorNames={Object.fromEntries(
                view.members.map((member) => [member.id, member.name]),
              )}
            />
          </div>
        </div>
        </ArmedPickProvider>
      </Sheet>
    </>
  );
}
