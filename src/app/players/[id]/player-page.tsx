import { displayName } from "@/lib/players/name";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  Bank,
  PositionPatch,
  Slot,
  Slots,
  Sparkline,
} from "@/components/board";
import { ScoreFigure, StatusBadge, availabilityBadge } from "@/components/broadcast";
import { AppShell } from "@/components/app-shell";
import { ClubCrest, PlayerPortrait } from "@/components/official-media";
import { getSession } from "@/lib/auth/session";
import { getLeagueWithMembers } from "@/lib/leagues/queries";
import { navLeagueFrom } from "@/lib/nav/items";
import { readNewsFor } from "@/lib/news/queries";
import { formatTenths } from "@/lib/stats/scoring";
import { readPlayerProfile } from "@/lib/stats/queries";
import { playerHref, teamHref } from "@/lib/nav/urls";
import { resolvePlayerId } from "@/lib/players/queries";

/**
 * One figure and its name, as a definition pair.
 *
 * A `<dl>` rather than a row of spans because that is what this is — the label
 * is not decoration, it is the only thing that distinguishes a 5.7 from a
 * 5.7. `lead` gives PIR the full-ink, name-sized treatment it gets in the pool,
 * so the two surfaces agree about which number matters.
 */
function Stat({
  label,
  value,
  lead = false,
}: {
  label: string;
  value: string | null;
  lead?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="slot-label">{label}</dt>
      <dd
        className={`stat ${lead ? "text-2xl font-semibold" : "text-sm"} ${
          value === null ? "text-ink-faint" : ""
        }`}
      >
        {value ?? "—"}
      </dd>
    </div>
  );
}

/**
 * One player: last season, then the game log — slices 4.5 and 9.1.
 *
 * Signed-in, because the pool is. The numbers are the stored tenths, so this
 * is the first surface that actually *displays* a box score.
 */
export async function PlayerProfilePage({
  playerRef,
  leagueRef,
  memberRef,
  path,
}: {
  /** The player's slug or id, as the URL carries it. */
  playerRef: string;
  /** The league the profile was opened from, if any. */
  leagueRef: string | null;
  /** The team whose roster it was opened from, for the way back. */
  memberRef: string | null;
  /** The path as asked for, so a stale or id-shaped one can settle on the canonical address. */
  path: string;
}) {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");

  const id = await resolvePlayerId(playerRef);
  if (!id) notFound();
  const leagueData = leagueRef ? await getLeagueWithMembers(leagueRef) : null;
  const [profile, news] = await Promise.all([
    readPlayerProfile(id, { basketNews: Boolean(leagueData?.league.basketnews_team_id) }),
    readNewsFor(id),
  ]);
  if (!profile || (leagueRef && !leagueData)) notFound();
  const rosterMember = leagueData && memberRef
    ? leagueData.members.find((member) => member.id === memberRef || member.slug === memberRef)
    : undefined;
  // Inside a league the profile lives under it, so the sidebar keeps the league.
  const canonical = playerHref(profile.player, leagueData?.league);
  if (canonical !== path) {
    redirect(`${canonical}${rosterMember ? `?member=${encodeURIComponent(rosterMember.slug || rosterMember.id)}` : ""}`);
  }
  const league = leagueData ? navLeagueFrom(leagueData) : null;
  const rosterHref = leagueData && rosterMember ? teamHref(leagueData.league, rosterMember) : null;

  const { player, log } = profile;
  const bio = [
    player.bio.dorsal ? `#${player.bio.dorsal}` : null,
    player.bio.height ? `${player.bio.height} cm` : null,
    player.bio.weight ? `${player.bio.weight} kg` : null,
    player.bio.birthYear ? `b. ${player.bio.birthYear}` : null,
    player.bio.country,
  ].filter((part): part is string => Boolean(part));

  return (
    <AppShell league={league} current={league ? "pool" : undefined} testId="player-log">
      <div className="flex flex-col gap-4">
        {rosterHref ? (
          <Link
            href={rosterHref}
            data-testid="player-back-to-roster"
            className="slot-label inline-flex min-h-11 items-center self-start transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
          >
            &larr; Back to the roster
          </Link>
        ) : null}
        <section
          aria-label="Player card"
          className="relative flex items-end gap-4 overflow-hidden rounded-card border border-panel-border bg-stock-panel p-4 sm:gap-6 sm:p-6"
        >
          <div aria-hidden="true" className="lattice pointer-events-none absolute inset-0" />
          <PlayerPortrait personCode={player.personCode} name={player.name} className="relative !h-32 !w-28 sm:!h-40 sm:!w-36" />
          <div className="relative flex min-w-0 flex-col gap-2 pb-1">
            <span className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
              <ClubCrest clubCode={player.clubCode} />
              {player.clubName || player.clubCode}
            </span>
            <h1 className="display min-w-0 text-4xl break-words sm:text-5xl">{displayName(player.name)}</h1>
            <span className="flex flex-wrap items-center gap-2">
              <PositionPatch position={player.position} />
              {availabilityBadge(player.status) ? (
                <StatusBadge kind={availabilityBadge(player.status)!.kind}>{availabilityBadge(player.status)!.word}</StatusBadge>
              ) : null}
              {/* Each part appears only if the feed has it — one of 332 E2026
                  players has no height. */}
              {bio.length > 0 ? (
                <span className="text-xs text-ink-soft" data-testid="player-bio">
                  {bio.join(" · ")}
                </span>
              ) : null}
            </span>
            {player.last5 ? (
              <span className="flex items-baseline gap-2">
                <ScoreFigure size="md">{formatTenths(player.last5.pirTenths)}</ScoreFigure>
                <span className="text-xs text-ink-soft">PIR, last {player.last5.games}</span>
              </span>
            ) : null}
          </div>
        </section>
      </div>

      {/* **Current form, and only when there is any.**
          
          Above last season because form beats a body of work once form
          exists — the same precedence `averagePirOf` applies when it decides
          which average the pool ranks on. It is absent for everybody until
          the season is under way, which is why last season is still the
          block that carries draft night.
          
          The five numbers are printed *beside* the picture rather than left
          to the sparkline's spoken sentence: this is the one surface with
          room for both, and a chart whose values can only be heard is a chart
          that cannot be checked. */}
      {player.last5 ? (
        <Bank
          label="Form"
          aside={`Last ${player.last5.games} game${player.last5.games === 1 ? "" : "s"}`}
        >
          <div
            className="flex flex-wrap items-center gap-x-6 gap-y-3"
            data-testid="player-form"
          >
            <dl className="flex flex-wrap gap-x-8 gap-y-3">
              <Stat
                label="PIR"
                value={formatTenths(player.last5.pirTenths)}
                lead
              />
            </dl>
            <Sparkline
              values={player.last5.pirs}
              what="PIR"
              className="inline-flex h-8 w-24 text-live"
              testId="player-spark"
            />
            <p className="stat text-sm text-ink-soft" aria-hidden="true">
              {player.last5.pirs.join(" · ")}
            </p>
          </div>
        </Bank>
      ) : null}

      {/* **Last season, above the game log, because on draft night it is the
          only thing on this page.** E2026 has no games in it, so the log
          below is empty for every player and this block is the whole
          answer to "who is this". PIR leads for the same reason it leads
          the pool row: it is the number the league talks in. */}
      <Bank
        label="Last season"
        aside={
          player.previousSeason
            ? `${player.previousSeason.season} · ${player.previousSeason.games} game${
                player.previousSeason.games === 1 ? "" : "s"
              }`
            : "Not imported"
        }
      >
        {player.previousSeason ? (
          <dl
            className="flex flex-wrap gap-x-8 gap-y-3"
            data-testid="player-prev-season"
          >
            <Stat
              label="PIR"
              value={formatTenths(player.previousSeason.pir)}
              lead
            />
            <Stat
              label="Fantasy"
              value={
                player.previousSeason.fantasy === null
                  ? null
                  : formatTenths(player.previousSeason.fantasy)
              }
            />
            <Stat
              label="Points"
              value={
                player.previousSeason.points === null
                  ? null
                  : formatTenths(player.previousSeason.points)
              }
            />
            <Stat
              label="Rebounds"
              value={
                player.previousSeason.rebounds === null
                  ? null
                  : formatTenths(player.previousSeason.rebounds)
              }
            />
            <Stat
              label="Assists"
              value={
                player.previousSeason.assists === null
                  ? null
                  : formatTenths(player.previousSeason.assists)
              }
            />
            <Stat label="2P" value={player.previousSeason.twoPointPct} />
            <Stat label="3P" value={player.previousSeason.threePointPct} />
            <Stat label="FT" value={player.previousSeason.freeThrowPct} />
          </dl>
        ) : (
          <p
            className="min-w-0 text-sm break-words text-ink-soft"
            data-testid="player-prev-season-empty"
          >
            Nothing stored for last season — they did not play in the
            Euroleague, or they arrived after the numbers were imported.
            Roughly a third of the pool is in this position every September,
            which is what a cheat sheet is for.
          </p>
        )}
      </Bank>

      {/* Only when there is something, and only ever a headline and a link.
          A player with no published news gets no empty box explaining that
          a publisher has not mentioned them — see 9.4's notes. */}
      {news.length > 0 ? (
        <Bank label="In the news" aside={`${news.length}`}>
          <Slots testId="player-news-rows" label={`News about ${displayName(player.name)}`}>
            {news.map((item) => (
              <Slot key={item.id} testId="player-news" state="filled">
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-sm">{item.headline}</span>
                  <span className="text-xs text-ink-soft">
                    {item.published || "undated"}
                    {item.bodyPart ? ` · ${item.bodyPart}` : ""} ·{" "}
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-live underline decoration-live/40 underline-offset-4 transition-colors hover:decoration-live focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
                    >
                      RotoWire
                    </a>
                  </span>
                </span>
              </Slot>
            ))}
          </Slots>
        </Bank>
      ) : null}

      <Bank
        label="Game log"
        aside={
          log.length === 0
            ? "No games stored"
            : `${log.length} game${log.length === 1 ? "" : "s"}`
        }
      >
        {log.length === 0 ? (
          <p className="min-w-0 text-sm break-words text-ink-soft" data-testid="player-log-empty">
            No box scores stored for this player yet. Nights land after a
            counted round; the roster link above is still the squad of record.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[22rem] text-sm" data-testid="player-log-rows">
              <thead>
                <tr className="text-left text-xs text-ink-soft">
                  <th className="py-2 pr-3 font-semibold">Game</th>
                  <th className="py-2 pr-3 font-semibold">Club</th>
                  <th className="py-2 pr-3 text-right font-semibold">PIR</th>
                  <th className="py-2 text-right font-semibold">Fantasy</th>
                </tr>
              </thead>
              <tbody>
                {log.map((line) => {
                  const heat = Math.max(0, Math.min(1, line.fantasyTenths / 300));
                  return (
                    <tr key={line.id} data-testid="player-game" className="border-t border-panel-border">
                      <td className="py-2 pr-3 font-semibold">
                        {line.season} · R{line.round}
                        <span className="ml-2 text-xs font-normal text-ink-faint">{line.phase}</span>
                      </td>
                      <td className="py-2 pr-3">
                        <span className="flex items-center gap-1.5 text-ink-soft"><ClubCrest clubCode={line.clubCode} />{line.clubCode}</span>
                      </td>
                      <td className="stat py-2 pr-3 text-right" data-testid="player-game-pir">{line.pir}</td>
                      <td className="stat py-2 text-right font-bold" data-testid="player-game-fantasy">
                        <span className="rounded px-1.5 py-0.5" style={{ background: `color-mix(in oklab, var(--color-gain) ${Math.round(heat * 30)}%, transparent)` }}>
                          {formatTenths(line.fantasyTenths)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Bank>
    </AppShell>
  );
}
