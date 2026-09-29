import { notFound, redirect } from "next/navigation";

import {
  resolveSeason,
  SeasonControl,
} from "@/components/season-control";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/auth/session";
import { serverConfig } from "@/lib/config/server";
import { getLeagueWithMembers } from "@/lib/leagues/queries";
import { navLeagueFrom } from "@/lib/nav/items";
import { readTransactionBoard } from "@/lib/memberships/queries";

import { TransactionBuilder } from "./transaction-builder";

/**
 * Record a trade, add or drop — slice 5.2.
 *
 * The room negotiates out loud. This page stores the result. Only the
 * commissioner or a deputy reaches it; everyone else gets the same not-found
 * as a stranger, so the URL does not confirm the league exists.
 */
export default async function NewTransactionPage({
  params,
  searchParams,
}: PageProps<"/leagues/[id]/transactions/new">) {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");

  const { id } = await params;
  const query = await searchParams;
  const currentSeason = serverConfig().EUROLEAGUE_SEASON;
  const season = resolveSeason(query.season, currentSeason);
  const data = await getLeagueWithMembers(id);
  if (!data) notFound();

  const viewerCanManage =
    data.isCommissioner ||
    data.members.some((member) => member.isYou && member.canManage);
  if (!viewerCanManage || data.league.status !== "season") notFound();

  const board = await readTransactionBoard(id);
  if (!board) notFound();

  const people = data.members.map((member) => ({
    id: member.id,
    name: member.teamName.trim() ? member.teamName : member.name,
  }));

  return (
    <AppShell
      current="trades"
      league={navLeagueFrom(data)}
      measure="wide"
      testId="transaction-builder"
    >
      <div className="flex flex-col gap-2">
        <p className="slot-label text-live">{data.league.name} / Trades</p>
        <h1 className="display text-4xl sm:text-5xl">Record a trade</h1>
        <p className="text-sm text-ink-soft">Review who sends each player and the effective round before recording the agreement.</p>
      </div>
      <SeasonControl
        action={`/leagues/${id}/transactions/new`}
        season={season}
        currentSeason={currentSeason}
      />
      <TransactionBuilder
        leagueId={id}
        members={people}
        seats={board.seats}
        freeAgents={board.freeAgents}
      />
    </AppShell>
  );
}
