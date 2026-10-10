import { displayName, surname } from "@/lib/players/name";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { Bank, EmptyNotice, PositionPatch } from "@/components/board";
import { PageHeader, PoolCrest, TeamCrest } from "@/components/broadcast";
import { ChipNav } from "@/components/chip-nav";
import { Glyph } from "@/components/glyphs";
import { MarketBars } from "@/components/market-bars";
import { Moment } from "@/components/moment";
import { PlayerPortrait } from "@/components/official-media";
import { getSession } from "@/lib/auth/session";
import { serverConfig } from "@/lib/config/server";
import { getLeagueWithMembers } from "@/lib/leagues/queries";
import { readLeagueDeals, type DealSide, type LeagueDeal } from "@/lib/memberships/queries";
import { navLeagueFrom } from "@/lib/nav/items";
import { formatSignedTenths } from "@/lib/stats/scoring";
import { stylesById } from "@/lib/teams/identity";
import { leagueHref } from "@/lib/nav/urls";
import { leagueSource } from "@/lib/positions";

/**
 * Trades (ADR-0011): who is winning the market, then every move on a round
 * timeline. A trade between two teams faces off on one line; a free-agent move
 * is one team against the pool. A move's verdict is player against player
 * since the round it counts from, the same delta the team page uses.
 */
export default async function TransactionsPage({ params, searchParams }: PageProps<"/l/[league]/transactions">) {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");
  const { league: leagueRef } = await params;
  const query = await searchParams;
  const data = await getLeagueWithMembers(leagueRef);
  if (!data) notFound();
  const id = data.league.id;
  const base = leagueHref(data.league);
  const you = data.members.find((member) => member.isYou);
  const canManage = data.isCommissioner || Boolean(you?.canManage);
  if ((!you && !canManage) || (data.league.status !== "season" && data.league.status !== "complete")) notFound();

  const season = serverConfig().EUROLEAGUE_SEASON;
  const { deals, players, ledger } = await readLeagueDeals(id, season, leagueSource(data.league));
  const styles = stylesById(data.members);
  const name = (memberId: string) => {
    const member = data.members.find((row) => row.id === memberId);
    return member?.teamName.trim() || member?.name || "A team";
  };
  const crest = (memberId: string, size: number) =>
    styles[memberId] ? <TeamCrest name={name(memberId)} color={styles[memberId]!.color} shape={styles[memberId]!.crest} size={size} /> : null;

  const rounds = [...new Set(deals.map((deal) => deal.fromRound))].sort((a, b) => b - a);
  const team = typeof query.team === "string" && data.members.some((row) => row.id === query.team) ? query.team : null;
  const roundParam = typeof query.round === "string" ? Number(query.round) : Number.NaN;
  const round = rounds.includes(roundParam) ? roundParam : null;
  const kinds = new Set(deals.map(kindOf));
  const kind = (query.kind === "trade" || query.kind === "free") && kinds.has(query.kind) ? query.kind : null;
  const filterHref = (next: { team: string | null; round: number | null; kind: MoveKind | null }) => {
    const search = new URLSearchParams();
    if (next.team) search.set("team", next.team);
    if (next.round !== null) search.set("round", String(next.round));
    if (next.kind) search.set("kind", next.kind);
    const tail = search.toString();
    return `${base}/transactions${tail ? `?${tail}` : ""}`;
  };
  const shown = deals.filter(
    (deal) =>
      (!team || deal.sides.some((side) => side.memberId === team)) &&
      (round === null || deal.fromRound === round) &&
      (kind === null || kindOf(deal) === kind),
  );
  const timeline = rounds
    .map((n) => ({ round: n, deals: shown.filter((deal) => deal.fromRound === n) }))
    .filter((group) => group.deals.length > 0);
  const market = Object.entries(ledger).sort(([, a], [, b]) => b.netTenths - a.netTenths);
  const traders = data.members.filter((member) => ledger[member.id]);

  const faces = (ids: readonly string[], className = "") => (
    <span className={`flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 ${className}`}>
      {ids.map((playerId) => {
        const player = players[playerId];
        const full = player ? displayName(player.name) : "A player";
        return (
          <span key={playerId} className="inline-flex min-w-0 items-center gap-1.5" title={full}>
            <PlayerPortrait personCode={player?.personCode} name={full} className="h-7 w-6" />
            <span className="truncate font-semibold">
              <span className="sr-only">{full}</span>
              <span aria-hidden="true">{player ? surname(player.name) : full}</span>
            </span>
            {player?.position ? <PositionPatch position={player.position} /> : null}
          </span>
        );
      })}
    </span>
  );

  const moveLine = (side: DealSide, pool: boolean) => (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      {pool ? (
        <>
          <PoolCrest size={22} />
          <span className="sr-only">With free agency:</span>
        </>
      ) : null}
      {side.outIds.length > 0 ? (
        <span className="flex min-w-0 items-center gap-2 text-ink-faint">
          <span className="sr-only">Out:</span>
          {faces(side.outIds)}
        </span>
      ) : (
        <span className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-faint">Signed</span>
      )}
      <span className="flex min-w-0 items-center gap-2">
        <Glyph name="swap" size={16} className="shrink-0 text-ink-faint" />
        {side.inIds.length > 0 ? (
          <span className="flex min-w-0 items-center gap-2 text-ink">
            <span className="sr-only">In:</span>
            {faces(side.inIds)}
          </span>
        ) : (
          <span className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-faint">Released</span>
        )}
      </span>
    </span>
  );

  const verdict = (deal: LeagueDeal, side: DealSide) => {
    const winning = side.deltaTenths > 0;
    const losing = side.deltaTenths < 0;
    return (
      <span className="flex items-center justify-end gap-2">
        {winning || losing ? (
          <Moment
            kind="stamp"
            id={`stamp:${deal.id}:${side.memberId}:${winning ? "win" : "lose"}`}
            as="span"
            className={`verdict-stamp hidden text-xs sm:inline-grid ${winning ? "text-gain" : "text-loss"}`}
          >
            {winning ? "Winning" : "Losing"}
          </Moment>
        ) : null}
        <span className={`stat w-14 text-right text-sm font-bold ${winning ? "text-gain" : losing ? "text-loss" : "text-ink-soft"}`} data-testid="deal-delta">
          {formatSignedTenths(side.deltaTenths)}
          <span className="sr-only">{winning ? " winning" : losing ? " losing" : " level"}</span>
        </span>
      </span>
    );
  };

  const tradeLine = (deal: LeagueDeal, a: DealSide, b: DealSide) => {
    const header = (side: DealSide, mirrored: boolean) => (
      <span className={`flex min-w-0 items-center justify-between gap-3 sm:justify-start ${mirrored ? "sm:flex-row-reverse" : ""}`}>
        <span className={`flex min-w-0 items-center gap-2 text-sm font-semibold ${mirrored ? "sm:flex-row-reverse" : ""}`}>
          {crest(side.memberId, 24)}
          <span className="truncate">{name(side.memberId)}</span>
        </span>
        {verdict(deal, side)}
      </span>
    );
    const sent = (from: DealSide, to: DealSide, mirrored: boolean) => (
      <span className={`flex min-w-0 text-sm text-ink ${mirrored ? "" : "sm:justify-end"}`}>
        <span className="sr-only">{name(from.memberId)} sent {name(to.memberId)}:</span>
        {faces(from.outIds, mirrored ? "" : "sm:justify-end")}
      </span>
    );
    return (
      <div
        data-testid="trade-line"
        className="grid grid-cols-1 gap-x-4 gap-y-1.5 py-2.5 [grid-template-areas:'ah'_'as'_'sw'_'bs'_'bh'] sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-y-2 sm:[grid-template-areas:'ah_._bh'_'as_sw_bs']"
      >
        <span className="min-w-0 [grid-area:ah]">{header(a, false)}</span>
        <span className="min-w-0 pl-8 [grid-area:as] sm:pl-0">{sent(a, b, false)}</span>
        <span className="flex items-center pl-8 text-ink-faint [grid-area:sw] sm:justify-center sm:pl-0">
          <Glyph name="swap" size={18} />
        </span>
        <span className="min-w-0 pl-8 [grid-area:bs] sm:pl-0">{sent(b, a, true)}</span>
        <span className="min-w-0 [grid-area:bh]">{header(b, true)}</span>
      </div>
    );
  };

  const filterWords = [
    team ? name(team) : null,
    round !== null ? `round ${round}` : null,
    kind === "trade" ? "trades" : kind === "free" ? "free agents" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <AppShell current="trades" league={navLeagueFrom(data)} measure="wide" testId="transactions">
      <PageHeader
        eyebrow={data.league.name}
        title="Trades"
        lead="Every move, scored player against player since it happened."
        action={
          canManage && data.league.status === "season" ? (
            <span className="flex flex-wrap gap-2">
              <Link
                href={`${base}/fantasy`}
                data-testid="fantasy-sync-link"
                className="inline-flex min-h-11 items-center rounded-lg border border-rule-strong px-4 text-sm font-bold text-ink hover:border-ink-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
              >
                Fantasy sync
              </Link>
              {!data.league.basketnews_team_id ? <Link
                href={`${base}/transactions/new`}
                data-testid="record-trade"
                className="inline-flex min-h-11 items-center rounded-lg bg-live px-4 text-sm font-bold text-live-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
              >
                Record a trade
              </Link> : null}
            </span>
          ) : undefined
        }
      />

      {market.length > 0 ? (
        <Bank framed label="Who is winning the market" aside="Points since each deal">
          <MarketBars rows={market} name={name} crest={crest} testId="deal-ledger" />
        </Bank>
      ) : null}

      <Bank framed label="Moves" aside={filterWords ? `${filterWords} · ${shown.length}` : `${shown.length} recorded`}>
        {deals.length > 0 ? (
          <div className="flex flex-col gap-2">
            <ChipNav
              label="Filter by team"
              testId="deal-teams"
              wrap
              chips={[
                { key: "all", href: filterHref({ team: null, round, kind }), current: team === null, children: "All" },
                ...traders.map((member) => ({
                  key: member.id,
                  href: filterHref({ team: member.id, round, kind }),
                  current: team === member.id,
                  label: name(member.id),
                  square: true,
                  children: crest(member.id, 30) ?? name(member.id).slice(0, 2),
                })),
              ]}
            />
            <ChipNav
              label="Filter by round"
              testId="deal-rounds"
              chips={[
                { key: "all", href: filterHref({ team, round: null, kind }), current: round === null, children: "All rounds" },
                ...rounds.map((n) => ({
                  key: String(n),
                  href: filterHref({ team, round: n, kind }),
                  current: round === n,
                  label: `Round ${n}`,
                  testId: `deal-round-${n}`,
                  children: `R${n}`,
                })),
              ]}
            />
            {kinds.size > 1 ? (
              <ChipNav
                label="Filter by kind of move"
                testId="deal-kinds"
                chips={[
                  { key: "all", href: filterHref({ team, round, kind: null }), current: kind === null, children: "All moves" },
                  { key: "trade", href: filterHref({ team, round, kind: "trade" }), current: kind === "trade", children: "Trades" },
                  { key: "free", href: filterHref({ team, round, kind: "free" }), current: kind === "free", children: "Free agents" },
                ]}
              />
            ) : null}
          </div>
        ) : null}

        {deals.length === 0 ? (
          <EmptyNotice>
            No moves yet. Every trade and signing lands here with what it has
            been worth since, round by round.
          </EmptyNotice>
        ) : timeline.length === 0 ? (
          <EmptyNotice>
            No moves for {filterWords}.{" "}
            <Link href={filterHref({ team: null, round: null, kind: null })} className="font-semibold text-ink underline underline-offset-4">
              Show every move
            </Link>
          </EmptyNotice>
        ) : (
          <ol className="flex flex-col gap-5" data-testid="deal-list">
            {timeline.map((group) => (
              <li key={group.round} data-testid="deal-round" data-round={group.round}>
                <h3 className="slot-label flex items-baseline gap-2 border-b border-rule pb-1.5">
                  Round {group.round}
                  <span className="font-normal normal-case tracking-normal text-ink-faint">
                    {group.deals.length} move{group.deals.length === 1 ? "" : "s"}
                  </span>
                </h3>
                <ol className="flex flex-col">
                  {group.deals.map((deal) => (
                    <li key={deal.id} data-testid="deal" data-kind={deal.kind} className="flex flex-col border-b border-panel-border py-1 last:border-b-0">
                      {deal.kind === "trade" && deal.sides.length === 2 ? tradeLine(deal, deal.sides[0]!, deal.sides[1]!) : deal.sides.map((side) => (
                        <div
                          key={side.memberId}
                          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-1.5 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto]"
                        >
                          <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                            {crest(side.memberId, 24)}
                            <span className="truncate">{name(side.memberId)}</span>
                          </span>
                          <span className="col-span-2 row-start-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1">{moveLine(side, kindOf(deal) === "free")}</span>
                          <span className="col-start-2 row-start-1 sm:col-start-3">{verdict(deal, side)}</span>
                        </div>
                      ))}
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ol>
        )}
      </Bank>
    </AppShell>
  );
}

type MoveKind = "trade" | "free";

/** A trade is between teams; a release, a signing or both together is with the pool. */
function kindOf(deal: LeagueDeal): MoveKind {
  return deal.kind === "trade" ? "trade" : "free";
}
