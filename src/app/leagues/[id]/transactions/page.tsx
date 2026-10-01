import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { Bank, EmptyNotice, PositionPatch } from "@/components/board";
import { PageHeader, TeamCrest } from "@/components/broadcast";
import { Glyph } from "@/components/glyphs";
import { Moment } from "@/components/moment";
import { PlayerPortrait } from "@/components/official-media";
import { getSession } from "@/lib/auth/session";
import { serverConfig } from "@/lib/config/server";
import { getLeagueWithMembers } from "@/lib/leagues/queries";
import { readLeagueDeals, type DealSide, type LeagueDeal } from "@/lib/memberships/queries";
import { navLeagueFrom } from "@/lib/nav/items";
import { formatSignedTenths } from "@/lib/stats/scoring";
import { stylesById } from "@/lib/teams/identity";

const KIND_WORD: Record<LeagueDeal["kind"], string> = {
  trade: "Trade",
  exchange: "Free-agent swap",
  add: "Signing",
  drop: "Release",
};

/**
 * Trades (ADR-0011): who is winning the market, then every deal as a card —
 * faces out and in, from which round, and a running verdict stamped on it.
 * The verdict is the same live, lineup-weighted delta the team page and the
 * recap use.
 */
export default async function TransactionsPage({ params, searchParams }: PageProps<"/leagues/[id]/transactions">) {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");
  const { id } = await params;
  const query = await searchParams;
  const data = await getLeagueWithMembers(id);
  if (!data) notFound();
  const you = data.members.find((member) => member.isYou);
  const canManage = data.isCommissioner || Boolean(you?.canManage);
  if ((!you && !canManage) || (data.league.status !== "season" && data.league.status !== "complete")) notFound();

  const season = serverConfig().EUROLEAGUE_SEASON;
  const { deals, players, ledger } = await readLeagueDeals(id, season);
  const styles = stylesById(data.members);
  const name = (memberId: string) => {
    const member = data.members.find((row) => row.id === memberId);
    return member?.teamName.trim() || member?.name || "A team";
  };
  const crest = (memberId: string, size: number) =>
    styles[memberId] ? <TeamCrest name={name(memberId)} color={styles[memberId]!.color} shape={styles[memberId]!.crest} size={size} /> : null;
  const team = typeof query.team === "string" && data.members.some((row) => row.id === query.team) ? query.team : null;
  const shown = team ? deals.filter((deal) => deal.sides.some((side) => side.memberId === team)) : deals;
  const market = Object.entries(ledger).sort(([, a], [, b]) => b.netTenths - a.netTenths);
  const widest = Math.max(1, ...market.map(([, entry]) => Math.abs(entry.netTenths)));

  const faces = (ids: readonly string[]) =>
    ids.length === 0 ? (
      <p className="text-sm text-ink-faint">Nobody</p>
    ) : (
      <ul role="list" className="flex flex-col gap-2">
        {ids.map((playerId) => {
          const player = players[playerId];
          return (
            <li key={playerId} className="flex min-w-0 items-center gap-2">
              <PlayerPortrait personCode={player?.personCode} name={player?.name ?? "A player"} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold">{player?.name ?? "A player"}</span>
                <span className="flex items-center gap-1.5 text-xs text-ink-soft">
                  {player?.position ? <PositionPatch position={player.position} /> : null}
                  {player?.clubCode ?? ""}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    );

  const verdict = (deal: LeagueDeal, side: DealSide) => {
    const winning = side.deltaTenths > 0;
    const losing = side.deltaTenths < 0;
    return (
      <span className="flex items-center gap-3">
        <span className={`stat text-sm font-bold ${winning ? "text-gain" : losing ? "text-loss" : "text-ink-soft"}`} data-testid="deal-delta">
          {formatSignedTenths(side.deltaTenths)}
        </span>
        {winning || losing ? (
          <Moment
            kind="stamp"
            id={`stamp:${deal.id}:${side.memberId}:${winning ? "win" : "lose"}`}
            as="span"
            className={`verdict-stamp text-xs ${winning ? "text-gain" : "text-loss"}`}
          >
            {winning ? "Winning" : "Losing"}
          </Moment>
        ) : null}
      </span>
    );
  };

  return (
    <AppShell current="trades" league={navLeagueFrom(data)} measure="wide" testId="transactions">
      <PageHeader
        eyebrow={data.league.name}
        title="Trades"
        lead="Every recorded move, and what it has been worth since."
        action={
          canManage && data.league.status === "season" ? (
            <span className="flex flex-wrap gap-2">
              <Link
                href={`/leagues/${id}/fantasy`}
                data-testid="fantasy-sync-link"
                className="inline-flex min-h-11 items-center rounded-lg border border-rule-strong px-4 text-sm font-bold text-ink hover:border-ink-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
              >
                Fantasy sync
              </Link>
              <Link
                href={`/leagues/${id}/transactions/new`}
                data-testid="record-trade"
                className="inline-flex min-h-11 items-center rounded-lg bg-live px-4 text-sm font-bold text-live-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
              >
                Record a trade
              </Link>
            </span>
          ) : undefined
        }
      />

      {market.length > 0 ? (
        <Bank framed label="Who is winning the market" aside="Points since each deal">
          <ul role="list" className="flex flex-col" data-testid="deal-ledger">
            {market.map(([memberId, entry]) => (
              <li key={memberId} className="grid grid-cols-[minmax(0,10rem)_1fr_4.5rem] items-center gap-3 py-1.5 sm:grid-cols-[minmax(0,14rem)_1fr_5rem]">
                <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                  {crest(memberId, 22)}
                  <span className="truncate">{name(memberId)}</span>
                </span>
                <span className="grid grid-cols-2 items-center" aria-hidden="true">
                  <span className="flex justify-end">
                    {entry.netTenths < 0 ? (
                      <span className="block h-2 rounded-l-full bg-loss" style={{ width: `${(Math.abs(entry.netTenths) / widest) * 100}%` }} />
                    ) : null}
                  </span>
                  <span className="border-l border-rule">
                    {entry.netTenths > 0 ? (
                      <span className="block h-2 rounded-r-full bg-gain" style={{ width: `${(entry.netTenths / widest) * 100}%` }} />
                    ) : null}
                  </span>
                </span>
                <span className={`stat text-right text-sm font-bold ${entry.netTenths > 0 ? "text-gain" : entry.netTenths < 0 ? "text-loss" : "text-ink-soft"}`}>
                  {formatSignedTenths(entry.netTenths)}
                  <span className="sr-only"> over {entry.deals} {entry.deals === 1 ? "deal" : "deals"}</span>
                </span>
              </li>
            ))}
          </ul>
        </Bank>
      ) : null}

      {deals.length > 0 ? (
        <nav aria-label="Filter by team" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          <Link
            href={`/leagues/${id}/transactions`}
            aria-current={team === null ? "page" : undefined}
            className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-3.5 text-sm font-semibold ${team === null ? "border-ink bg-ink text-stock" : "border-rule text-ink-soft hover:text-ink"}`}
          >
            All teams
          </Link>
          {data.members
            .filter((member) => ledger[member.id])
            .map((member) => (
              <Link
                key={member.id}
                href={`/leagues/${id}/transactions?team=${member.id}`}
                aria-current={team === member.id ? "page" : undefined}
                className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border py-1 pr-3.5 pl-1.5 text-sm font-semibold ${team === member.id ? "border-ink bg-ink text-stock" : "border-rule text-ink-soft hover:text-ink"}`}
              >
                {crest(member.id, 22)}
                {name(member.id)}
              </Link>
            ))}
        </nav>
      ) : null}

      <Bank framed label="Trade history" aside={`${shown.length} recorded`}>
        {shown.length === 0 ? (
          <EmptyNotice>
            No trades yet. When two teams agree a deal, record it and this page
            keeps score of who is winning it, round by round.
          </EmptyNotice>
        ) : (
          <ol className="flex flex-col gap-4" data-testid="deal-list">
            {shown.map((deal) => (
              <li key={deal.id} data-testid="deal" className="flex flex-col gap-4 rounded-xl border border-panel-border bg-stock p-4">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
                  <span className="rounded-full bg-stock-high px-2 py-0.5 font-bold text-ink">From round {deal.fromRound}</span>
                  <span className="font-semibold">{KIND_WORD[deal.kind]}</span>
                  {deal.note ? <span className="truncate">· {deal.note}</span> : null}
                </p>
                {deal.sides.map((side, index) => (
                  <div key={side.memberId} className={`flex flex-col gap-3 ${index > 0 ? "border-t border-panel-border pt-4" : ""}`}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2 font-semibold">
                        {crest(side.memberId, 28)}
                        <span className="truncate">{name(side.memberId)}</span>
                      </span>
                      {verdict(deal, side)}
                    </div>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
                      <div className="flex min-w-0 flex-col gap-2">
                        <p className="slot-label">Out</p>
                        {faces(side.outIds)}
                      </div>
                      <Glyph name="swap" size={22} className="mt-7 text-ink-faint" />
                      <div className="flex min-w-0 flex-col gap-2">
                        <p className="slot-label">In</p>
                        {faces(side.inIds)}
                      </div>
                    </div>
                  </div>
                ))}
              </li>
            ))}
          </ol>
        )}
      </Bank>
    </AppShell>
  );
}
