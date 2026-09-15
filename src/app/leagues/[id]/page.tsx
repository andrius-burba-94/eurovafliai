import { notFound, redirect } from "next/navigation";

import Link from "next/link";

import {
  BackLink,
  Bank,
  BoardPlan,
  Correction,
  Door,
  PositionPatch,
  Sheet,
  Slots,
  TopRail,
} from "@/components/board";
import { getSession } from "@/lib/auth/session";
import { LeagueChat } from "@/components/league-chat";
import { readMessages } from "@/lib/chat/store";
import { countMappingQueue } from "@/lib/mapping/queries";
import { EMPTY_QUEUE, queueSentence } from "@/lib/mapping/queue";
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
  const viewerIsManager =
    isCommissioner || members.some((member) => member.isYou && member.canManage);
  // The mapping queue is app-global and `/players/mapping` gates on
  // `canManageRosters()`, which anybody who manages *this* league already
  // satisfies — so this gate cannot dangle a door that would 404, and it costs
  // no extra query to decide. Everyone else pays nothing for the read.
  const mappingQueue = viewerIsManager
    ? await countMappingQueue().catch(() => EMPTY_QUEUE)
    : EMPTY_QUEUE;
  const mappingSentence = queueSentence(mappingQueue);

  return (
    <>
      <TopRail action={<BackLink href="/">Leagues</BackLink>} />
      <Sheet testId="lobby">
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

        {league.status === "drafting" ? (
          <Bank label="Draft room" framed>
            <Slots>
              <Door
                href={`/leagues/${league.id}/draft`}
                testId="enter-draft"
                title="The draft is live"
                description="The board, clock and player pool are in the room."
                action="Enter the room"
                actionTone="live"
              />
            </Slots>
          </Bank>
        ) : null}

        {league.status === "season" && viewerIsMember ? (
          <Bank label="League doors" framed>
            <Slots>
              <Door
                href={`/leagues/${league.id}/standings`}
                testId="enter-standings"
                title="Standings"
                description="The table, from the draft and the nights since."
                action="Open"
              />
              <Door
                href={`/leagues/${league.id}/lineup`}
                testId="enter-lineup"
                title="Your lineup"
                description="Who started, who was captain, who sat — per round."
                action="Set it"
              />
              <Door
                href={`/leagues/${league.id}/recap`}
                testId="enter-recap"
                title="This round"
                description="Each team's night, the best night and the deal that moved most."
                action="Open"
              />
              {viewerIsManager ? (
                <Door
                  href={`/leagues/${league.id}/transactions/new`}
                  testId="record-transaction"
                  title="Record a transaction"
                  description="A trade, an add or a drop, once the room has agreed."
                  action="Write it down"
                />
              ) : null}
            </Slots>
          </Bank>
        ) : null}

        {league.status === "setup" ? (
          <Bank
            label="Invite code"
            aside={
              slotsLeft > 0
                ? `${slotsLeft} of ${settings.max_members} free`
                : `full · ${settings.max_members}`
            }
            framed
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

        {/* The doorbell on 4.2's queue. Below the league's own act, because a
            live draft outranks a stale spelling, and above the member list,
            because further down is where it was already being missed. Renders
            only when something is genuinely standing — a notice that also
            appears when there is nothing to do is the one people stop reading. */}
        {mappingSentence ? (
          <Correction testId="mapping-queue">
            {mappingSentence}{" "}
            <Link
              href="/players/mapping"
              className="inline-flex min-h-11 min-w-11 items-center text-ink underline decoration-ink/40 underline-offset-4 transition-colors hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
            >
              Open player mapping
            </Link>
          </Correction>
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

        {/* Setup apparatus stays together. From chat onward the order is
            conversation, private sheet, then the folded way out. */}
        {league.status === "setup" ? (
          <div className="hidden sm:block">
            <BoardPlan
              slots={settings.max_members}
              caption={`13 rounds × ${settings.max_members} slots`}
            />
          </div>
        ) : null}

        {isCommissioner && league.status === "setup" ? (
          <p className="text-sm text-ink-soft">
            You run this league. Open <em>Manage</em> on any row to rename or
            remove a member, and roll the draft order when everyone is in.
          </p>
        ) : null}

        {/* The lobby half of league chat. The roll announces itself here,
            which is where people are looking when it happens, and it is the
            same thread the room shows. */}
        <LeagueChat
          leagueId={id}
          authToken={session.token}
          initial={chat}
          myMemberId={members.find((member) => member.isYou)?.id ?? null}
          initiallyOpen
          authorNames={Object.fromEntries(
            members.map((member) => [
              member.id,
              member.teamName || member.name,
            ]),
          )}
        />

        {/* The cheat sheet, from the lobby — the hours before a draft are when
            somebody actually writes one. A member's own row only: a
            commissioner without a membership has no roster to rank for, and a
            sheet is private to the member who owns it. */}
        {viewerIsMember ? (
          <Slots>
            <Door
              href={`/leagues/${league.id}/sheet`}
              testId="lobby-sheet"
              title="Your cheat sheet"
              description={
                league.status === "season"
                  ? "Private to you. Review the list you took into draft night."
                  : "Private to you. Autodraft picks from it."
              }
              action="Open"
            />
          </Slots>
        ) : null}

        {/* Last on the page, and folded: the way out of a league should be
            findable and never in the way. */}
        {isCommissioner ? (
          <DeleteLeague
            leagueId={league.id}
            leagueName={league.name}
            memberCount={members.length}
            hasDrafted={league.status !== "setup"}
          />
        ) : null}
      </Sheet>
    </>
  );
}
