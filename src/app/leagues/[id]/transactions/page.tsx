import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { Bank, EmptyNotice } from "@/components/board";
import { getSession } from "@/lib/auth/session";
import { getLeagueWithMembers } from "@/lib/leagues/queries";
import { readRecentTransactions } from "@/lib/memberships/queries";
import { navLeagueFrom } from "@/lib/nav/items";

export default async function TransactionsPage({ params }: PageProps<"/leagues/[id]/transactions">) {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");
  const { id } = await params;
  const data = await getLeagueWithMembers(id);
  if (!data) notFound();
  const you = data.members.find((member) => member.isYou);
  const canManage = data.isCommissioner || Boolean(you?.canManage);
  if ((!you && !canManage) || (data.league.status !== "season" && data.league.status !== "complete")) notFound();

  const names = Object.fromEntries(data.members.map((member) => [member.id, member.teamName.trim() || member.name]));
  const transactions = await readRecentTransactions(id, names, 100);
  return (
    <AppShell current="trades" league={navLeagueFrom(data)} measure="wide" testId="transactions">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="slot-label">League / transactions</p>
          <h1 className="text-3xl font-semibold tracking-tight">Trades</h1>
          <p className="mt-2 text-sm text-ink-soft">Recorded roster changes and their effective rounds.</p>
        </div>
        {canManage && data.league.status === "season" ? (
          <Link href={`/leagues/${id}/transactions/new`} className="inline-flex min-h-11 items-center border border-rule-strong bg-stock-panel px-4 text-sm font-semibold text-ink hover:border-ink-soft focus-visible:outline-2 focus-visible:outline-live">
            Record a trade
          </Link>
        ) : null}
      </div>
      <Bank framed label="Trade history" aside={`${transactions.length} recorded`}>
        {transactions.length === 0 ? (
          <EmptyNotice>No trades have been recorded for this league.</EmptyNotice>
        ) : (
          <ol className="divide-y divide-rule/50">
            {transactions.map((row) => (
              <li key={row.id} className="grid gap-2 py-4 sm:grid-cols-[6rem_minmax(0,1fr)]">
                <span className="slot-label">Round {row.fromRound}</span>
                <span className="text-sm text-ink">{row.sentence}</span>
              </li>
            ))}
          </ol>
        )}
      </Bank>
    </AppShell>
  );
}
