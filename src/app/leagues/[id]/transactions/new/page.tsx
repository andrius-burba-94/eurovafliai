import { notFound, redirect } from "next/navigation";

import { BackLink, Sheet, TopRail } from "@/components/board";
import { getSession } from "@/lib/auth/session";
import { getLeagueWithMembers } from "@/lib/leagues/queries";
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
}: PageProps<"/leagues/[id]/transactions/new">) {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");

  const { id } = await params;
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
    <>
      <TopRail
        action={<BackLink href={`/leagues/${id}`}>The lobby</BackLink>}
      />
      <Sheet testId="transaction-builder">
        <div className="flex flex-col gap-4">
          <h1 className="text-3xl font-semibold uppercase tracking-[0.04em] sm:text-4xl">
            Record a transaction
          </h1>
          <p className="text-ink-soft">
            {data.league.name}. The room already agreed. This writes it down.
          </p>
        </div>
        <TransactionBuilder
          leagueId={id}
          members={people}
          seats={board.seats}
          freeAgents={board.freeAgents}
        />
      </Sheet>
    </>
  );
}
