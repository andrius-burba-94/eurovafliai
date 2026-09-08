import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  BackLink,
  Bank,
  CardName,
  BoardPlan,
  PositionPatch,
  Sheet,
  TopRail,
} from "@/components/board";
import { getSession } from "@/lib/auth/session";
import { LeagueChat } from "@/components/league-chat";
import { readMessages } from "@/lib/chat/store";
import { createUserClient } from "@/lib/pb/server";
import { getLeagueWithMembers } from "@/lib/leagues/queries";
import { rosterSize } from "@/lib/leagues/settings";
import { DeleteLeague } from "./delete-league";
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
  // The same conversation as the room's — `chat_messages` is league-scoped, so
  // the hours before a roll and the draft itself are one thread. Read with the
  // viewer's own token, so the collection's read rule is what scopes it.
  const chat = await readMessages(createUserClient(session.token), id).catch(() => []);
  const template = settings.roster_template;
  // A cheat sheet belongs to a *membership*. A commissioner who has not taken a
  // slot has no roster to rank for, so they are not offered one.
  const viewerIsMember = members.some((member) => member.isYou);

  return (
    <>
      <TopRail action={<BackLink href="/">Leagues</BackLink>} />
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
        {league.status === "season" && viewerIsMember ? (
          <Link
            href={`/leagues/${league.id}/standings`}
            data-testid="enter-standings"
            className="slot-filled flex items-baseline justify-between gap-4 px-3 py-4 transition-colors hover:bg-ink/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
          >
            <span className="flex flex-col gap-1">
              <CardName>Standings</CardName>
              <span className="text-sm text-ink-soft">
                The table, from the draft and the nights since.
              </span>
            </span>
            <span className="slot-label shrink-0">Open &rarr;</span>
          </Link>
        ) : null}
        {league.status === "season" &&
        (isCommissioner ||
          members.some((member) => member.isYou && member.canManage)) ? (
          <Link
            href={`/leagues/${league.id}/transactions/new`}
            data-testid="record-transaction"
            className="slot-filled flex items-baseline justify-between gap-4 px-3 py-4 transition-colors hover:bg-ink/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
          >
            <span className="flex flex-col gap-1">
              <CardName>Record a transaction</CardName>
              <span className="text-sm text-ink-soft">
                A trade, an add or a drop, once the room has agreed.
              </span>
            </span>
            <span className="slot-label shrink-0">Write it down &rarr;</span>
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

        {/* The lobby half of league chat. The roll announces itself here,
            which is where people are looking when it happens, and it is the
            same thread the room shows. */}
        <LeagueChat
          leagueId={id}
          authToken={session.token}
          initial={chat}
          myMemberId={members.find((member) => member.isYou)?.id ?? null}
        />

        {/* The cheat sheet, from the lobby — the hours before a draft are when
            somebody actually writes one. A member's own row only: a
            commissioner without a membership has no roster to rank for, and a
            sheet is private to the member who owns it. */}
        {viewerIsMember ? (
          <Link
            href={`/leagues/${league.id}/sheet`}
            data-testid="lobby-sheet"
            className="slot-filled flex items-baseline justify-between gap-4 px-3 py-4 transition-colors hover:bg-ink/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
          >
            <span className="flex flex-col gap-1">
              {/* `CardName`, not a one-off `text-lg` at display tracking.
                  That is the exact mistake DESIGN.md records the board making
                  and the pool's critique fixing, and it had crept back as a
                  sixth type size on this row. */}
              <CardName>Your cheat sheet</CardName>
              <span className="text-sm text-ink-soft">
                Private to you. Autodraft picks from it.
              </span>
            </span>
            <span className="slot-label shrink-0">Open &rarr;</span>
          </Link>
        ) : null}

        {isCommissioner ? (
          <>
            <p className="text-sm text-ink-soft">
              You run this league. Open <em>Manage</em> on any row to rename or
              remove a member, and roll the draft order when everyone is in.
            </p>
            {/* Last on the page, and folded: the way out of a league should be
                findable and never in the way. */}
            <DeleteLeague
              leagueId={league.id}
              leagueName={league.name}
              memberCount={members.length}
              hasDrafted={league.status !== "setup"}
            />
          </>
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
