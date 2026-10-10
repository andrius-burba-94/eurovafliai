import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { Bank, EmptyNotice, PositionPatch } from "@/components/board";
import { PageHeader, ScoreFigure, TeamCrest } from "@/components/broadcast";
import { Glyph } from "@/components/glyphs";
import { HonourChip } from "@/components/honour-chip";
import { MarketBars } from "@/components/market-bars";
import { PlayerPortrait } from "@/components/official-media";
import { getSession } from "@/lib/auth/session";
import { serverConfig } from "@/lib/config/server";
import type { Position } from "@/lib/engine";
import { getLeagueWithMembers } from "@/lib/leagues/queries";
import { readLeagueDeals } from "@/lib/memberships/queries";
import { navLeagueFrom } from "@/lib/nav/items";
import { badgesFrom } from "@/lib/season/badges";
import { headToHead, type PlayerLeader } from "@/lib/stats/league-stats";
import { readLeagueStats } from "@/lib/stats/league-stats-queries";
import { formatHundredths, formatTenths } from "@/lib/stats/scoring";
import { stylesById } from "@/lib/teams/identity";

import {
  CaptainRegretView,
  ClubLoyaltyView,
  DraftValueView,
  HeadToHeadView,
  HindsightView,
  LineupEfficiencyView,
  PlayerName,
  TeamName,
  TeamProfilesView,
  WaffleBoardView,
  type Who,
} from "./sections";
import { leagueHref, leaguePaths } from "@/lib/nav/urls";
import { leagueSource } from "@/lib/positions";

const TOPICS = [
  ["records", "Records"],
  ["teams", "Teams"],
  ["h2h", "Head-to-head"],
  ["lineups", "Lineups"],
  ["deals", "Deals"],
  ["draft", "Draft"],
  ["players", "Players"],
  ["clubs", "Clubs"],
] as const;

/**
 * League Stats (ADR-0011, S10): the season in numbers — every team's finish
 * per round, records, team profiles, how well lineups and captains were set,
 * what the draft was worth, the players of the season, the clubs that carried
 * each team and the market. Every figure is derived in
 * `src/lib/stats/league-stats.ts` from rows the app already stores, over
 * finished rounds only.
 */
export default async function StatsPage({ params, searchParams }: PageProps<"/l/[league]/stats">) {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");
  const { league: leagueRef } = await params;
  const query = await searchParams;
  const data = await getLeagueWithMembers(leagueRef);
  if (!data) notFound();
  const id = data.league.id;
  const base = leagueHref(data.league);
  const you = data.members.find((member) => member.isYou);
  if (!you || (data.league.status !== "season" && data.league.status !== "complete")) notFound();

  const season = serverConfig().EUROLEAGUE_SEASON;
  const [page, deals] = await Promise.all([readLeagueStats(id, season, leagueSource(data.league)), readLeagueDeals(id, season, leagueSource(data.league))]);
  const styles = stylesById(data.members);
  const team = (memberId: string | null) => {
    if (!memberId) return "Free agent";
    const member = data.members.find((row) => row.id === memberId);
    return member?.teamName.trim() || member?.name || "A team";
  };
  const crest = (memberId: string | null, size: number) =>
    memberId && styles[memberId] ? <TeamCrest name={team(memberId)} color={styles[memberId]!.color} shape={styles[memberId]!.crest} size={size} /> : null;
  const player = (playerId: string) => page?.players[playerId];

  if (!page || page.stats.rounds.length === 0) {
    return (
      <AppShell current="stats" league={navLeagueFrom(data)} measure="wide" testId="league-stats">
        <PageHeader eyebrow={data.league.name} title="League stats" />
        <Bank framed label="The season in numbers">
          <EmptyNotice testId="stats-empty">No round has finished yet. Records, profiles and leaders arrive once the first round&apos;s last game is played.</EmptyNotice>
        </Bank>
      </AppShell>
    );
  }

  const { stats } = page;
  const { records } = stats;
  const badges = badgesFrom(page.snapshots);
  const paths = leaguePaths(data.league, data.members);
  const teamHref = (memberId: string) => paths.teams[memberId] ?? base;
  const who: Who = { team, crest, player, teamHref, you: you.id };
  const ranked = stats.waffle.rows.map((row) => row.memberId);
  const known = (raw: string | string[] | undefined) => (typeof raw === "string" && ranked.includes(raw) ? raw : null);
  const left = known(query.a) ?? (ranked.includes(you.id) ? you.id : ranked[0]);
  const right = known(query.b) ?? ranked.find((memberId) => memberId !== left);
  const h2h = left && right ? headToHead(page.snapshots, left, right) : null;

  const record = (label: string, who: ReactNode, value: string, detail: string, testId: string) => (
    <div data-testid={testId} className="flex flex-col gap-2 rounded-xl border border-panel-border bg-stock-panel p-4">
      <p className="slot-label">{label}</p>
      <div className="flex items-end justify-between gap-3">
        <span className="min-w-0">{who}</span>
        <ScoreFigure size="md">{value}</ScoreFigure>
      </div>
      <p className="text-xs text-ink-soft">{detail}</p>
    </div>
  );
  const teamWho = (memberId: string) => <TeamName memberId={memberId} who={who} size={28} className="font-semibold" />;
  const playerWho = (playerId: string) => (
    <span className="flex min-w-0 items-center gap-2">
      <PlayerPortrait personCode={player(playerId)?.personCode} name={player(playerId)?.name ?? "A player"} />
      <PlayerName playerId={playerId} who={who} className="font-semibold" />
    </span>
  );
  const leaderRows = (rows: readonly PlayerLeader[], unit: string) => (
    <ol className="flex flex-col divide-y divide-panel-border">
      {rows.map((row, index) => (
        <li key={row.playerId} className="flex items-center gap-3 py-2">
          <span className="stat w-4 text-xs text-ink-faint">{index + 1}</span>
          <PlayerPortrait personCode={player(row.playerId)?.personCode} name={player(row.playerId)?.name ?? "A player"} />
          <span className="flex min-w-0 flex-1 flex-col">
            <PlayerName playerId={row.playerId} who={who} className="text-sm font-semibold" />
            <span className="flex min-w-0 items-center gap-1.5 text-xs text-ink-soft">
              {player(row.playerId)?.position ? <PositionPatch position={player(row.playerId)!.position} /> : null}
              <TeamName memberId={row.ownerId} who={who} size={16} />
            </span>
          </span>
          <span className="stat text-sm font-bold">
            {formatTenths(row.tenths)}
            {unit ? <span className="ml-1 text-xs font-normal text-ink-faint">{unit}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
  const market = Object.entries(deals.ledger).sort(([, a], [, b]) => b.netTenths - a.netTenths);

  return (
    <AppShell current="stats" league={navLeagueFrom(data)} measure="wide" testId="league-stats">
      <PageHeader eyebrow={data.league.name} title="League stats" lead={`The season so far, after ${stats.rounds.length} finished round${stats.rounds.length === 1 ? "" : "s"}.`} />

      <WaffleBoardView waffle={stats.waffle} who={who} />

      <nav aria-label="Topics" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {TOPICS.map(([anchor, label]) => (
          <a key={anchor} href={`#${anchor}`} className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-rule px-3.5 text-sm font-semibold text-ink-soft hover:border-ink-soft hover:text-ink">
            {label}
          </a>
        ))}
      </nav>

      <section id="records" aria-labelledby="records-title" className="flex scroll-mt-20 flex-col gap-3">
        <h2 id="records-title" className="display text-2xl">Record book</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {records.highestRound ? record("Highest round", teamWho(records.highestRound.memberId), formatHundredths(records.highestRound.hundredths), `Round ${records.highestRound.round}`, "record-highest") : null}
          {records.bestNight ? record("Best single night", playerWho(records.bestNight.playerId), formatTenths(records.bestNight.tenths), `Round ${records.bestNight.round} · for ${team(records.bestNight.memberId)}`, "record-night") : null}
          {records.bestCaptainNight ? record("Best captain call", playerWho(records.bestCaptainNight.playerId), formatTenths(records.bestCaptainNight.tenths), `Round ${records.bestCaptainNight.round} · ×2 for ${team(records.bestCaptainNight.memberId)}`, "record-captain") : null}
          {records.biggestMargin ? record("Biggest winning margin", teamWho(records.biggestMargin.memberId), formatHundredths(records.biggestMargin.marginHundredths), `Round ${records.biggestMargin.round}`, "record-margin") : null}
          {records.lowestRound ? record("Lowest round", teamWho(records.lowestRound.memberId), formatHundredths(records.lowestRound.hundredths), `Round ${records.lowestRound.round}`, "record-lowest") : null}
        </div>
        {badges.length > 0 ? (
          <ul role="list" aria-label="Honours so far" className="flex flex-wrap gap-2">
            {badges.map((badge) => (
              <li key={`${badge.id}:${badge.memberId}`} className="flex items-center gap-2 rounded-full border border-panel-border bg-stock-panel py-0.5 pr-3 pl-1 text-xs">
                <HonourChip id={badge.id} title={badge.title} />
                <TeamName memberId={badge.memberId} who={who} size={18} className="text-ink-soft" />
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section id="teams" className="scroll-mt-20">
        <TeamProfilesView rows={stats.teams} who={who} />
      </section>

      <section id="h2h" className="scroll-mt-20">
        <HeadToHeadView h2h={h2h} teams={ranked} action={`${base}/stats#h2h`} who={who} />
      </section>

      <div id="lineups" className="grid scroll-mt-20 gap-6 lg:grid-cols-2 lg:items-start">
        <LineupEfficiencyView rows={stats.lineups} who={who} />
        <CaptainRegretView rows={stats.captains} who={who} />
        <HindsightView rows={stats.hindsight} who={who} />
        <section id="deals" className="scroll-mt-20">
          <Bank
            framed
            label="Deal ledger"
            info="Net points each team has gained or lost since its deals, counted the way its lineups counted them."
            aside={<Link href={`${base}/transactions`} className="font-semibold text-live hover:underline">All trades →</Link>}
          >
            {market.length === 0 ? (
              <EmptyNotice>No deals recorded yet.</EmptyNotice>
            ) : (
              <MarketBars rows={market} name={(memberId) => team(memberId)} crest={crest} hrefOf={teamHref} showDeals testId="stats-deals" />
            )}
          </Bank>
        </section>
      </div>

      <section id="draft" className="scroll-mt-20">
        <DraftValueView draft={stats.draft} who={who} />
      </section>

      <section id="players" className="scroll-mt-20">
        <Bank framed label="Players of the season" info="Fantasy points over finished rounds. Owners are as of the latest finished round.">
          <div className="grid gap-y-6 lg:grid-cols-3 lg:divide-x lg:divide-panel-border">
            <div className="flex flex-col gap-1 lg:pr-6">
              <p className="slot-label">Top scorers</p>
              {leaderRows(stats.players.overall, "")}
            </div>
            <div className="flex flex-col gap-1 border-t border-panel-border pt-5 lg:border-t-0 lg:px-6 lg:pt-0">
              <p className="slot-label flex items-center gap-1.5 text-live"><Glyph name="flame" size={12} /> Hot · last three rounds</p>
              {leaderRows(stats.players.hot, "avg")}
            </div>
            <div className="flex flex-col gap-1 border-t border-panel-border pt-5 lg:border-t-0 lg:pt-0 lg:pl-6">
              <p className="slot-label">Best free agents</p>
              {stats.players.freeAgents.length > 0 ? leaderRows(stats.players.freeAgents, "") : <EmptyNotice>Every scorer is owned.</EmptyNotice>}
            </div>
          </div>
          <div className="mt-2 grid gap-y-6 border-t border-rule pt-5 sm:grid-cols-3 sm:divide-x sm:divide-panel-border">
            {(["G", "F", "C"] as Position[]).map((position, index) => (
              <div key={position} className={`flex flex-col gap-1 ${index === 0 ? "sm:pr-6" : index === 1 ? "sm:px-6" : "sm:pl-6"}`}>
                <p className="slot-label flex items-center gap-2"><PositionPatch position={position} /> {position === "G" ? "Guards" : position === "F" ? "Forwards" : "Centers"}</p>
                {leaderRows(stats.players.byPosition[position], "")}
              </div>
            ))}
          </div>
        </Bank>
      </section>

      <section id="clubs" className="scroll-mt-20">
        <ClubLoyaltyView rows={stats.clubs} clubNames={page.clubNames} who={who} />
      </section>
    </AppShell>
  );
}
