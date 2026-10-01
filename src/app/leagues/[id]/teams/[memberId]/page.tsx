import { displayName } from "@/lib/players/name";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  Bank,
  EmptyNotice,
  FixtureNote,
  PositionPatch,
  Sparkline,
} from "@/components/board";
import { AppShell } from "@/components/app-shell";
import { ScoreFigure, StatusBadge, TeamCrest, availabilityBadge } from "@/components/broadcast";
import { TeamIdentityPicker } from "@/components/team-identity-picker";
import { ClubCrest, PlayerPortrait } from "@/components/official-media";
import { PlayerStatsLink } from "@/components/player-stats-link";
import { ContextPanel } from "@/components/context-panel";
import {
  resolveSeason,
  SeasonControl,
} from "@/components/season-control";
import { getSession } from "@/lib/auth/session";
import { serverConfig } from "@/lib/config/server";
import { radarSize } from "@/lib/engine";
import { formatTenths } from "@/lib/stats/scoring";
import { getLeagueWithMembers } from "@/lib/leagues/queries";
import { navLeagueFrom } from "@/lib/nav/items";
import { readPanel } from "@/lib/panel/queries";
import { readMemberDeals, readMemberRoster } from "@/lib/memberships/queries";

import { ImpactList } from "./impact-list";

/**
 * One member's current roster — slices 5.1 and 5.3.
 *
 * The squad of record is active `roster_memberships`. Transactions below it
 * are live deltas from box scores, not a stored cache.
 */
export default async function TeamPage({
  params,
  searchParams,
}: PageProps<"/leagues/[id]/teams/[memberId]">) {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");

  const { id, memberId } = await params;
  const query = await searchParams;
  const currentSeason = serverConfig().EUROLEAGUE_SEASON;
  const season = resolveSeason(query.season, currentSeason);

  const data = await getLeagueWithMembers(id);
  if (!data) notFound();

  const viewerIsMember = data.members.some((member) => member.isYou);
  if (!viewerIsMember) notFound();

  const member = data.members.find((row) => row.id === memberId);
  if (!member) notFound();

  const teamNames = Object.fromEntries(
    data.members.map((row) => [
      row.id,
      row.teamName.trim() ? row.teamName : row.name,
    ]),
  );
  const [roster, deals, panel] = await Promise.all([
    readMemberRoster(id, memberId, season),
    readMemberDeals(id, memberId, season, teamNames),
    readPanel({ leagueId: id, season, teamNames }),
  ]);
  const template = data.settings.roster_template;
  const teamTitle = member.teamName.trim() ? member.teamName : member.name;
  const played = roster.filter((player) => player.games > 0);
  const top = [...played].sort((a, b) => b.seasonTenths - a.seasonTenths)[0];
  const low = [...played].sort((a, b) => a.seasonTenths / a.games - b.seasonTenths / b.games)[0];
  const rosterSize = radarSize(template);
  const viewerCanManage =
    data.isCommissioner ||
    data.members.some((row) => row.isYou && row.canManage);

  return (
    <AppShell
      current={member.isYou ? "team" : undefined}
      league={navLeagueFrom(data)}
      testId="roster"
      measure="wide"
      panel={<ContextPanel data={panel} />}
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <TeamCrest name={teamTitle} color={member.color} shape={member.crest} size={64} />
          <div className="min-w-0">
            <p className="slot-label text-live">{data.league.name} / {member.isYou ? "My team" : "Team"}</p>
            <h1 className="display mt-1 min-w-0 text-4xl break-words sm:text-5xl">{teamTitle}</h1>
            <p className="mt-2 text-sm text-ink-soft">{member.name} · {roster.length} of {rosterSize} players</p>
          </div>
        </div>
        {member.isYou && data.league.status === "season" ? <Link href={`/leagues/${id}/lineup`} className="inline-flex min-h-11 items-center rounded-lg bg-live px-4 text-sm font-bold text-live-ink hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live">Set lineup</Link> : null}
      </div>

      <SeasonControl
        action={`/leagues/${id}/teams/${memberId}`}
        season={season}
        currentSeason={currentSeason}
      />

      {roster.length > 1 && top && low && top.id !== low.id ? (
        <div className="grid gap-3 sm:grid-cols-2" data-testid="roster-callouts">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-gain/40 bg-gain/10 p-4">
            <span className="flex min-w-0 items-center gap-3">
              <PlayerPortrait personCode={top.personCode} name={top.name} />
              <span className="min-w-0">
                <span className="slot-label block text-gain">Carrying you</span>
                <span className="block truncate font-semibold">{displayName(top.name)}</span>
              </span>
            </span>
            <ScoreFigure size="sm">{formatTenths(top.seasonTenths)}</ScoreFigure>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-loss/40 bg-loss/10 p-4">
            <span className="flex min-w-0 items-center gap-3">
              <PlayerPortrait personCode={low.personCode} name={low.name} />
              <span className="min-w-0">
                <span className="slot-label block text-loss">On thin ice</span>
                <span className="block truncate font-semibold">{displayName(low.name)}</span>
              </span>
            </span>
            <ScoreFigure size="sm">{formatTenths(low.seasonTenths)}</ScoreFigure>
          </div>
        </div>
      ) : null}

      <Bank framed label="The roster" aside={`${roster.length} of ${rosterSize} · season points`}>
        {roster.length === 0 ? (
          <EmptyNotice testId="roster-empty">
            No players are on this roster yet. Slots fill from the draft, then from recorded trades.
          </EmptyNotice>
        ) : (
          <ul role="list" aria-label={`${teamTitle} roster`} data-testid="roster-list" className="flex flex-col">
            {(["G", "F", "C"] as const).map((position) => {
              const group = roster.filter((player) => player.position === position).sort((a, b) => b.seasonTenths - a.seasonTenths);
              return (
                <li key={position} className="flex flex-col">
                  <p className="slot-label flex items-center gap-2 border-b border-panel-border py-2">
                    <PositionPatch position={position} />
                    {position === "G" ? "Guards" : position === "F" ? "Forwards" : "Centers"} · {group.length}/{template[position]}
                  </p>
                  <ul role="list" className="flex flex-col">
                    {group.map((player) => {
                      const badge = availabilityBadge(player.status);
                      return (
                        <li key={player.id} data-testid="roster-player" className="flex items-center gap-3 border-b border-panel-border py-2.5 last:border-b-0">
                          <PlayerStatsLink
                            id={player.id}
                            name={player.name}
                            href={`/players/${player.id}?league=${encodeURIComponent(id)}&member=${encodeURIComponent(memberId)}`}
                            className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md transition-colors hover:bg-ink/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
                          >
                            <PlayerPortrait personCode={player.personCode} name={player.name} />
                            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="truncate text-sm font-semibold">{displayName(player.name)}</span>
                                {badge ? <StatusBadge kind={badge.kind}>{badge.word}</StatusBadge> : null}
                              </span>
                              <span className="flex flex-wrap items-center gap-x-2 text-xs text-ink-soft">
                                <span className="flex items-center gap-1"><ClubCrest clubCode={player.clubCode} />{player.clubCode}</span>
                                <FixtureNote fixture={player.fixture} />
                                {player.overallNo ? <span className="stat">#{player.overallNo}</span> : null}
                              </span>
                            </span>
                          </PlayerStatsLink>
                          <Sparkline values={player.last5Pirs} what="PIR" className="hidden h-4 w-[3.125rem] text-ink-soft sm:inline-flex" testId="roster-spark" />
                          <span className="flex w-16 shrink-0 flex-col items-end">
                            <span className="stat text-sm font-bold">{formatTenths(player.seasonTenths)}</span>
                            <span className="stat text-xs text-ink-faint">{player.lastTenths === null ? "—" : `last ${formatTenths(player.lastTenths)}`}</span>
                          </span>
                        </li>
                      );
                    })}
                    {Array.from({ length: Math.max(0, template[position] - group.length) }, (_, index) => (
                      <li key={`open-${index}`} className="flex min-h-12 items-center border-b border-dashed border-rule py-2 text-sm text-ink-faint last:border-b-0">
                        Open roster slot
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </Bank>

      <ImpactList
        deals={deals}
        teamName={teamTitle}
        leagueId={id}
        canManage={viewerCanManage}
        season={data.league.status === "season"}
      />

      {member.isYou || viewerCanManage ? (
        <details className="group rounded-xl border border-panel-border bg-stock-panel px-4 py-3" data-testid="edit-crest">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-semibold [&::-webkit-details-marker]:hidden">
            {member.isYou ? "Your crest" : `${teamTitle}'s crest`}
            <span aria-hidden="true" className="text-ink-soft transition-transform group-open:rotate-90">&rsaquo;</span>
          </summary>
          <div className="pt-3 pb-1">
            <TeamIdentityPicker leagueId={id} memberId={member.id} name={teamTitle} color={member.color} crest={member.crest} />
          </div>
        </details>
      ) : null}

    </AppShell>
  );
}
