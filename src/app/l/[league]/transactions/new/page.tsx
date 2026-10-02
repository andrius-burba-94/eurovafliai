import { notFound, redirect } from "next/navigation";

import {
  resolveSeason,
  SeasonControl,
} from "@/components/season-control";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/broadcast";
import { getSession } from "@/lib/auth/session";
import { serverConfig } from "@/lib/config/server";
import { getLeagueWithMembers } from "@/lib/leagues/queries";
import { navLeagueFrom } from "@/lib/nav/items";
import { readTransactionBoard } from "@/lib/memberships/queries";

import { TransactionBuilder } from "./transaction-builder";
import { leagueHref } from "@/lib/nav/urls";

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
}: PageProps<"/l/[league]/transactions/new">) {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");

  const { league: leagueRef } = await params;
  const query = await searchParams;
  const currentSeason = serverConfig().EUROLEAGUE_SEASON;
  const season = resolveSeason(query.season, currentSeason);
  const data = await getLeagueWithMembers(leagueRef);
  if (!data) notFound();
  const id = data.league.id;
  const base = leagueHref(data.league);

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
      <PageHeader
        eyebrow={`${data.league.name} · Trades`}
        title="Record a trade"
        lead="Choose each side, the round it counts from, and read the announcement before it goes to the league."
      />
      <SeasonControl
        action={`${base}/transactions/new`}
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
