import { notFound, redirect } from "next/navigation";

import Link from "next/link";

import {
  Bank,
  BoardPlan,
  Correction,
  Door,
  PositionPatch,
  Slots,
} from "@/components/board";
import { AppShell } from "@/components/app-shell";
import { ContextPanel } from "@/components/context-panel";
import { getSession } from "@/lib/auth/session";
import { LeagueChat } from "@/components/league-chat";
import { readMessages } from "@/lib/chat/store";
import { countMappingQueue } from "@/lib/mapping/queries";
import { EMPTY_QUEUE, queueSentence } from "@/lib/mapping/queue";
import { createUserClient } from "@/lib/pb/server";
import { getLeagueWithMembers } from "@/lib/leagues/queries";
import { navLeagueFrom } from "@/lib/nav/items";
import { readPanel } from "@/lib/panel/queries";
import {
  readMemberRoster,
  readRecentTransactions,
} from "@/lib/memberships/queries";
import { serverConfig } from "@/lib/config/server";
import { readLeagueRecap, readStandingsSnapshots } from "@/lib/stats/queries";
import { SeasonDashboard } from "./season-dashboard";
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
  const chat = await readMessages(createUserClient(session.token), id).catch(
    () => [],
  );
  const template = settings.roster_template;
  // A cheat sheet belongs to a *membership*. A commissioner who has not taken a
  // slot has no roster to rank for, so they are not offered one.
  const viewerIsMember = members.some((member) => member.isYou);
  const viewerIsManager =
    isCommissioner ||
    members.some((member) => member.isYou && member.canManage);
  // The mapping queue is app-global and `/players/mapping` gates on
  // `canManageRosters()`, which anybody who manages *this* league already
  // satisfies — so this gate cannot dangle a door that would 404, and it costs
  // no extra query to decide. Everyone else pays nothing for the read.
  const mappingQueue = viewerIsManager
    ? await countMappingQueue().catch(() => EMPTY_QUEUE)
    : EMPTY_QUEUE;
  const mappingSentence = queueSentence(mappingQueue);

  const youMemberId = members.find((member) => member.isYou)?.id ?? null;
  const teamNames = Object.fromEntries(
    members.map((member) => [member.id, member.teamName || member.name]),
  );

  /**
   * The dashboard replaces the lobby's own body once the season is on, and only
   * for somebody with a seat in the league: a commissioner who never took one
   * has no roster to be shown and no rank to be in.
   */
  const isSeasonDashboard = league.status === "season" && viewerIsMember;
  const season = serverConfig().EUROLEAGUE_SEASON;

  // Four reads, and only on the surface that uses them — every one of them is a
  // query that already existed for the page the dashboard is replacing a door
  // to (4.5, 5.4, 5.1, 5.2). In parallel because they are independent, and at
  // ~10 users the cost that matters is the round trip rather than the work.
  const [snapshots, recap, roster, transactions, panel] = isSeasonDashboard
    ? await Promise.all([
        readStandingsSnapshots(id, season).catch(() => []),
        readLeagueRecap(id, season, null).catch(() => null),
        youMemberId
          ? readMemberRoster(id, youMemberId, season).catch(() => [])
          : Promise.resolve([]),
        readRecentTransactions(id, teamNames).catch(() => []),
        readPanel({ leagueId: id, season, teamNames }),
      ])
    : [[], null, [], [], null];

  return (
    <AppShell
      current="league-home"
      league={navLeagueFrom(data)}
      testId="lobby"
      measure={isSeasonDashboard ? "wide" : "column"}
      panel={panel ? <ContextPanel data={panel} /> : undefined}
    >
      {/* One display headline per surface (DESIGN.md). On the dashboard that
          one belongs to the season, so the league's name steps down to a
          slot label above it and the `h1` lives in `SeasonDashboard`. Two
          elements at display size, one of them the same size as the other,
          is the hierarchy 10.9 spent a whole slice fixing. */}
      <div className="flex flex-col gap-4">
        {isSeasonDashboard ? (
          <span className="slot-label text-ink">{league.name}</span>
        ) : (
          <h1 className="text-3xl font-semibold tracking-[0.04em] uppercase sm:text-4xl">
            {league.name}
          </h1>
        )}
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

      {isSeasonDashboard ? (
        <SeasonDashboard
          leagueId={league.id}
          season={season}
          snapshots={snapshots}
          recap={recap?.recap ?? null}
          playerNames={recap?.playerNames ?? {}}
          roster={roster}
          rosterTemplate={template}
          transactions={transactions}
          teamNames={teamNames}
          youMemberId={youMemberId}
          viewerIsManager={viewerIsManager}
          chat={
            <LeagueChat
              leagueId={id}
              authToken={session.token}
              initial={chat}
              myMemberId={youMemberId}
              initiallyOpen
              authorNames={teamNames}
            />
          }
        />
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
          same thread the room shows.

          Not on the dashboard: that surface renders the same conversation in
          its own top-right panel, and two transcripts of one thread on one
          page is two unread counts for the same messages. */}
      {isSeasonDashboard ? null : (
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
      )}

      {/* Take the draft away with you. Gated on membership alone, so it is
          reachable in *season* as well as from the lobby — a league wants
          the spreadsheet after the draft, not only before it, and the
          dashboard replaces the lobby's body without replacing this run. */}
      {viewerIsMember ? (
        <Slots>
          <Door
            href={`/leagues/${league.id}/export`}
            testId="lobby-export"
            title="Export the draft"
            description={
              league.status === "setup"
                ? "Results, rosters, order and pool — as CSV or JSON, once you have drafted."
                : "Results, rosters, order and pool — as CSV or JSON."
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
    </AppShell>
  );
}
