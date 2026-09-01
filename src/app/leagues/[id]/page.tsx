import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  BackArrow,
  Bank,
  BoardPlan,
  PositionPatch,
  Sheet,
  TopRail,
} from "@/components/board";
import { getSession } from "@/lib/auth/session";
import { getLeagueWithMembers } from "@/lib/leagues/queries";
import { rosterSize } from "@/lib/leagues/settings";
import { LiveLobby } from "./live-lobby";

/**
 * The lobby: who is in, and the code that lets the rest in.
 *
 * This is the board before any pick exists, so it shows the board's own shape —
 * one slot per member, taken slots ruled solid and the free places still
 * dashed, which is the same grid the draft fills in Phase 3.
 *
 * `?arrived=1` is set by the create and join actions, and it is what fires the
 * card-landing motion on the one row that genuinely just arrived. Without a
 * signal like that the motion would either never play or play on every load,
 * and the second is decoration.
 *
 * The member list itself is live — `./live-lobby.tsx` subscribes to
 * `league_members` over PocketBase SSE using the viewer's own token. This page
 * still renders the list once on the server, so the lobby is correct before any
 * JavaScript runs and remains readable if the subscription never establishes.
 */
export default async function LobbyPage({
  params,
  searchParams,
}: PageProps<"/leagues/[id]">) {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");

  const { id } = await params;
  const { arrived } = await searchParams;
  const justArrived = arrived === "1";
  const data = await getLeagueWithMembers(id);

  // Not found and not-yours are the same answer on purpose: telling them apart
  // would let anyone probe which leagues exist.
  if (!data) notFound();

  // The repair for createLeague's lost second write happens inside the query,
  // before it reads the members — see the comment there for why the order
  // matters.
  const { league, settings, members, isCommissioner } = data;
  const slotsLeft = settings.max_members - members.length;
  const template = settings.roster_template;

  return (
    <>
      <TopRail
        action={
          <Link
            href="/"
            className="slot-label inline-flex items-center gap-1.5 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
          >
            <BackArrow />
            Leagues
          </Link>
        }
      />
      <Sheet testId="lobby">
        {league.status === "drafting" ? (
          <Link
            href={`/leagues/${league.id}/draft`}
            data-testid="enter-draft"
            className="slot-live flex items-baseline justify-between gap-4 px-3 py-4 transition-colors hover:bg-live/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
          >
            <span className="text-lg font-semibold uppercase tracking-[0.04em]">
              The draft is live
            </span>
            <span className="slot-label text-live">Enter the room &rarr;</span>
          </Link>
        ) : null}
        <div className="flex flex-col gap-4">
          <h1 className="text-3xl font-semibold uppercase tracking-[0.04em] sm:text-4xl">
            {league.name}
          </h1>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="slot-label">
              {league.season} &middot; {league.status}
            </span>
            <span className="slot-label">{rosterSize(template)} players</span>
            <span className="flex items-center gap-1.5">
              <PositionPatch position="G" count={template.G} />
              <PositionPatch position="F" count={template.F} />
              <PositionPatch position="C" count={template.C} />
            </span>
          </div>
        </div>

        {league.status === "setup" ? (
          <Bank
            label="Invite code"
            aside={
              slotsLeft > 0
                ? `${slotsLeft} of ${settings.max_members} free`
                : `full · ${settings.max_members}`
            }
          >
            {/* Ruled, not struck. The marker means one thing on this board —
                who is on the clock — so the code is written in it rather than
                sitting in its field. */}
            <div className="slot-filled border-b border-rule-strong px-3 py-5">
              <p
                data-testid="invite-code"
                className="text-3xl font-semibold uppercase tracking-[0.36em] text-live sm:text-4xl"
              >
                {league.invite_code}
              </p>
              <p className="mt-2 text-sm text-ink-soft">
                {slotsLeft > 0
                  ? "Read it out. Anyone with the code takes the next slot."
                  : "Every slot is taken."}
              </p>
            </div>
          </Bank>
        ) : null}

        {/* From here down the surface is live. The server render above is what
            makes the page correct before any JavaScript runs; the subscription
            keeps it correct afterwards. */}
        <LiveLobby
          leagueId={league.id}
          authToken={session.token}
          commissionerUserId={league.commissioner}
          viewerUserId={session.user.id}
          leagueStatus={league.status}
          maxMembers={settings.max_members}
          initialMembers={members}
          justArrived={justArrived}
          isCommissioner={isCommissioner}
          settings={settings}
        />

        {isCommissioner ? (
          <p className="text-sm text-ink-soft">
            You run this league. Open <em>Manage</em> on any row to rename or
            remove a member. The draft roll arrives in Phase 2.
          </p>
        ) : null}

        {/* The board this lobby is filling, at its real width: one column per
            place in this league, thirteen rounds deep.

            Desktop only. On a phone it added a third to the scroll of the
            mobile-first surface to restate the slot run immediately above it —
            and this page already shows the board's shape in that run. The
            login page, which has no run to restate, keeps it at every size. */}
        <div className="hidden sm:block">
          <BoardPlan
            slots={settings.max_members}
            caption={`13 rounds × ${settings.max_members} slots`}
          />
        </div>
      </Sheet>
    </>
  );
}
