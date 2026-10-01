import { displayName } from "@/lib/players/name";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { Bank, EmptyNotice, PositionPatch } from "@/components/board";
import { PageHeader, ScoreFigure, TeamCrest } from "@/components/broadcast";
import { Glyph } from "@/components/glyphs";
import { PlayerPortrait } from "@/components/official-media";
import { getSession } from "@/lib/auth/session";
import { serverConfig } from "@/lib/config/server";
import type { Position } from "@/lib/engine";
import { getLeagueWithMembers } from "@/lib/leagues/queries";
import { readLeagueDeals } from "@/lib/memberships/queries";
import { navLeagueFrom } from "@/lib/nav/items";
import { badgesFrom } from "@/lib/season/badges";
import type { PlayerLeader } from "@/lib/stats/league-stats";
import { readLeagueStats } from "@/lib/stats/league-stats-queries";
import { readStandingsSnapshots } from "@/lib/stats/queries";
import { formatHundredths, formatSignedTenths, formatTenths } from "@/lib/stats/scoring";
import { stylesById } from "@/lib/teams/identity";

const TOPICS = [
  ["records", "Records"],
  ["teams", "Teams"],
  ["lineups", "Lineups"],
  ["draft", "Draft"],
  ["players", "Players"],
  ["deals", "Deals"],
] as const;

/**
 * League Stats (ADR-0011, S10): the season in numbers — records, team
 * profiles, how well lineups were set, what the draft was worth, the players
 * of the season and the market. Every figure is derived in
 * `src/lib/stats/league-stats.ts` from rows the app already stores.
 */
export default async function StatsPage({ params }: PageProps<"/leagues/[id]/stats">) {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");
  const { id } = await params;
  const data = await getLeagueWithMembers(id);
  if (!data) notFound();
  const you = data.members.find((member) => member.isYou);
  if (!you || (data.league.status !== "season" && data.league.status !== "complete")) notFound();

  const season = serverConfig().EUROLEAGUE_SEASON;
  const [page, deals, snapshots] = await Promise.all([
    readLeagueStats(id, season),
    readLeagueDeals(id, season),
    readStandingsSnapshots(id, season),
  ]);
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
          <EmptyNotice testId="stats-empty">No round has been counted yet. Records, profiles and leaders arrive with the first scored night.</EmptyNotice>
        </Bank>
      </AppShell>
    );
  }

  const { stats } = page;
  const { records } = stats;
  const badges = badgesFrom(snapshots);

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
  const teamWho = (memberId: string) => (
    <span className="flex min-w-0 items-center gap-2 font-semibold">
      {crest(memberId, 28)}
      <span className="truncate">{team(memberId)}</span>
    </span>
  );
  const playerWho = (playerId: string) => (
    <span className="flex min-w-0 items-center gap-2">
      <PlayerPortrait personCode={player(playerId)?.personCode} name={player(playerId)?.name ?? "A player"} />
      <span className="truncate font-semibold">{displayName(player(playerId)?.name ?? "A player")}</span>
    </span>
  );
  const leaderRows = (rows: readonly PlayerLeader[], unit: string) => (
    <ol className="flex flex-col divide-y divide-panel-border">
      {rows.map((row, index) => (
        <li key={row.playerId} className="flex items-center gap-3 py-2">
          <span className="stat w-4 text-xs text-ink-faint">{index + 1}</span>
          <PlayerPortrait personCode={player(row.playerId)?.personCode} name={player(row.playerId)?.name ?? "A player"} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-semibold">{displayName(player(row.playerId)?.name ?? "A player")}</span>
            <span className="flex items-center gap-1.5 text-xs text-ink-soft">
              {player(row.playerId)?.position ? <PositionPatch position={player(row.playerId)!.position} /> : null}
              {crest(row.ownerId, 16)}
              {team(row.ownerId)}
            </span>
          </span>
          <span className="stat text-sm font-bold">
            {formatTenths(row.tenths)}
            <span className="ml-1 text-xs font-normal text-ink-faint">{unit}</span>
          </span>
        </li>
      ))}
    </ol>
  );
  const benchMax = Math.max(1, ...stats.lineups.map((row) => row.benchLostTenths));
  const market = Object.entries(deals.ledger).sort(([, a], [, b]) => b.netTenths - a.netTenths);

  return (
    <AppShell current="stats" league={navLeagueFrom(data)} measure="wide" testId="league-stats">
      <PageHeader eyebrow={data.league.name} title="League stats" lead={`The season so far, after ${stats.rounds.length} counted round${stats.rounds.length === 1 ? "" : "s"}.`} />

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
              <li key={`${badge.id}:${badge.memberId}`} className="flex items-center gap-2 rounded-full border border-panel-border bg-stock-panel py-1 pr-3 pl-1 text-xs">
                {crest(badge.memberId, 22)}
                <Glyph name={badge.id === "on-fire" ? "flame" : badge.id === "crowned" ? "crown" : "spoon"} size={14} className={badge.id === "on-fire" ? "text-live" : badge.id === "crowned" ? "text-gold" : "text-wood"} />
                <span className="font-bold">{badge.title}</span>
                <span className="text-ink-soft">{team(badge.memberId)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section id="teams" className="scroll-mt-20">
        <Bank framed label="Team profiles" aside="Per counted round">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm" data-testid="stats-teams">
              <thead>
                <tr className="text-left text-xs text-ink-soft">
                  <th className="py-2 pr-3 font-semibold">Team</th>
                  <th className="py-2 pr-3 text-right font-semibold">Average</th>
                  <th className="py-2 pr-3 text-right font-semibold">Best</th>
                  <th className="py-2 pr-3 text-right font-semibold">Worst</th>
                  <th className="py-2 pr-3 text-right font-semibold" title="Standard deviation of round scores">Spread</th>
                  <th className="py-2 pr-3 text-right font-semibold">Won</th>
                  <th className="py-2 pr-3 text-right font-semibold">Top 3</th>
                  <th className="py-2 text-right font-semibold">Spoons</th>
                </tr>
              </thead>
              <tbody>
                {stats.teams.map((row) => (
                  <tr key={row.memberId} className={`border-t border-panel-border ${row.memberId === you.id ? "bg-live-sunk" : ""}`}>
                    <td className="py-2 pr-3">
                      <Link href={`/leagues/${id}/teams/${row.memberId}`} className="flex items-center gap-2 font-semibold hover:underline">
                        {crest(row.memberId, 22)}
                        <span className="truncate">{team(row.memberId)}</span>
                      </Link>
                    </td>
                    <td className="stat py-2 pr-3 text-right font-bold">{formatHundredths(row.averageHundredths)}</td>
                    <td className="stat py-2 pr-3 text-right">{formatHundredths(row.bestHundredths)}</td>
                    <td className="stat py-2 pr-3 text-right text-ink-soft">{formatHundredths(row.worstHundredths)}</td>
                    <td className="stat py-2 pr-3 text-right text-ink-soft">±{formatHundredths(row.spreadHundredths)}</td>
                    <td className="stat py-2 pr-3 text-right">{row.roundsWon}</td>
                    <td className="stat py-2 pr-3 text-right">{row.topThree}</td>
                    <td className="stat py-2 text-right">{row.spoons}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Bank>
      </section>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <section id="lineups" className="scroll-mt-20">
          <Bank framed label="Lineup efficiency" aside="Recorded rounds only">
            <p className="text-sm text-ink-soft">Points left on the bench and in the stands, and how often the captain was the night&apos;s best starter.</p>
            {stats.lineups.every((row) => row.captainRounds === 0 && row.benchLostTenths === 0) ? (
              <EmptyNotice testId="stats-lineups-empty">No lineup has been recorded yet, so every round counted everyone at 100%.</EmptyNotice>
            ) : (
            <ul role="list" className="flex flex-col divide-y divide-panel-border" data-testid="stats-lineups">
              {stats.lineups.map((row) => (
                <li key={row.memberId} className="flex items-center gap-3 py-2">
                  {crest(row.memberId, 20)}
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{team(row.memberId)}</span>
                  <span className="hidden h-2 w-24 overflow-hidden rounded-full bg-stock-high sm:block" aria-hidden="true">
                    <span className="block h-full rounded-full bg-loss" style={{ width: `${(row.benchLostTenths / benchMax) * 100}%` }} />
                  </span>
                  <span className="stat w-14 text-right text-sm">{formatTenths(row.benchLostTenths)}</span>
                  <span className="stat w-14 text-right text-xs text-ink-soft">
                    {row.captainRounds > 0 ? `C ${row.captainHits}/${row.captainRounds}` : "—"}
                  </span>
                </li>
              ))}
            </ul>
            )}
          </Bank>
        </section>

        <section id="draft" className="scroll-mt-20">
          <Bank framed label="Draft value" aside="Points for the drafting team">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <p className="slot-label text-gain">Steals · late picks</p>
                {stats.draft.steals.map((pick) => (
                  <p key={pick.overallNo} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate"><span className="stat text-ink-faint">#{pick.overallNo}</span> {displayName(player(pick.playerId)?.name ?? "A player")}</span>
                    <span className="stat font-bold">{formatTenths(pick.tenths)}</span>
                  </p>
                ))}
              </div>
              <div className="flex flex-col gap-2">
                <p className="slot-label text-loss">Busts · early picks</p>
                {stats.draft.busts.map((pick) => (
                  <p key={pick.overallNo} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate"><span className="stat text-ink-faint">#{pick.overallNo}</span> {displayName(player(pick.playerId)?.name ?? "A player")}</span>
                    <span className="stat font-bold">{formatTenths(pick.tenths)}</span>
                  </p>
                ))}
              </div>
            </div>
            {stats.draft.autoPicks > 0 ? (
              <p className="text-sm text-ink-soft">
                Autodraft made {stats.draft.autoPicks} pick{stats.draft.autoPicks === 1 ? "" : "s"}, averaging{" "}
                <span className="stat text-ink">{formatTenths(stats.draft.autoAverageTenths ?? 0)}</span> against{" "}
                <span className="stat text-ink">{formatTenths(stats.draft.humanAverageTenths ?? 0)}</span> for picks people made.
              </p>
            ) : null}
          </Bank>
        </section>
      </div>

      <section id="players" className="scroll-mt-20">
        <Bank framed label="Players of the season" aside="Fantasy points">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="flex flex-col gap-1">
              <p className="slot-label">Top scorers</p>
              {leaderRows(stats.players.overall, "")}
            </div>
            <div className="flex flex-col gap-1">
              <p className="slot-label flex items-center gap-1.5 text-live"><Glyph name="flame" size={12} /> Hot · last three rounds</p>
              {leaderRows(stats.players.hot, "avg")}
            </div>
            <div className="flex flex-col gap-1">
              <p className="slot-label">Best free agents</p>
              {stats.players.freeAgents.length > 0 ? leaderRows(stats.players.freeAgents, "") : <EmptyNotice>Every scorer is owned.</EmptyNotice>}
            </div>
          </div>
          <div className="grid gap-6 border-t border-panel-border pt-4 sm:grid-cols-3">
            {(["G", "F", "C"] as Position[]).map((position) => (
              <div key={position} className="flex flex-col gap-1">
                <p className="slot-label flex items-center gap-2"><PositionPatch position={position} /> {position === "G" ? "Guards" : position === "F" ? "Forwards" : "Centers"}</p>
                {leaderRows(stats.players.byPosition[position], "")}
              </div>
            ))}
          </div>
        </Bank>
      </section>

      <section id="deals" className="scroll-mt-20">
        <Bank framed label="Deal ledger" aside={<Link href={`/leagues/${id}/transactions`} className="font-semibold text-live hover:underline">All trades →</Link>}>
          {market.length === 0 ? (
            <EmptyNotice>No deals recorded yet.</EmptyNotice>
          ) : (
            <ul role="list" className="flex flex-col divide-y divide-panel-border">
              {market.map(([memberId, entry]) => (
                <li key={memberId} className="flex items-center gap-3 py-2">
                  {crest(memberId, 20)}
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{team(memberId)}</span>
                  <span className="text-xs text-ink-soft">{entry.deals} deal{entry.deals === 1 ? "" : "s"}</span>
                  <span className={`stat w-16 text-right text-sm font-bold ${entry.netTenths > 0 ? "text-gain" : entry.netTenths < 0 ? "text-loss" : "text-ink-soft"}`}>
                    {formatSignedTenths(entry.netTenths)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Bank>
      </section>
    </AppShell>
  );
}
