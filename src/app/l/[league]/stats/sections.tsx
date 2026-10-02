import Link from "next/link";
import type { ReactNode } from "react";

import { Bank, EmptyNotice } from "@/components/board";
import { ClubBar } from "@/components/club-bar";
import { Glyph } from "@/components/glyphs";
import { InfoTip } from "@/components/info-tip";
import { ClubCrest, PlayerPortrait } from "@/components/official-media";
import { PlayerStatsLink } from "@/components/player-stats-link";
import { clubShares } from "@/lib/clubs/share";
import { displayName } from "@/lib/players/name";
import { ordinal } from "@/lib/season/story";
import { placeTint } from "@/lib/season/tint";
import type {
  CaptainRegret,
  ClubLoyalty,
  DraftValue,
  HeadToHead,
  Hindsight,
  LineupEfficiency,
  TeamProfile,
  WaffleBoard,
} from "@/lib/stats/league-stats";
import type { StatsPlayer } from "@/lib/stats/league-stats-queries";
import { formatHundredths, formatTenths } from "@/lib/stats/scoring";

import { MarginStrip } from "./margin-strip";

/** How the sections name things: the page owns the lookups, they only draw. */
export type Who = {
  readonly team: (memberId: string | null) => string;
  readonly crest: (memberId: string | null, size: number) => ReactNode;
  readonly player: (playerId: string) => StatsPlayer | undefined;
  readonly teamHref: (memberId: string) => string;
  readonly you: string;
};

const linkFocus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live";

/** A team's crest and name, the name opening the team's page. */
export function TeamName({ memberId, who, size = 20, className = "" }: { memberId: string | null; who: Who; size?: number; className?: string }) {
  if (!memberId) return <span className={`truncate text-ink-soft ${className}`}>{who.team(null)}</span>;
  return (
    <span className={`flex min-w-0 items-center gap-2 ${className}`}>
      {who.crest(memberId, size)}
      <Link href={who.teamHref(memberId)} className={`truncate hover:underline ${memberId === who.you ? "text-live" : ""} ${linkFocus}`}>
        {who.team(memberId)}
      </Link>
    </span>
  );
}

/** A player's name, opening the same profile the lineup and the pool open. */
export function PlayerName({ playerId, who, className = "" }: { playerId: string; who: Who; className?: string }) {
  const name = displayName(who.player(playerId)?.name ?? "A player");
  return (
    <PlayerStatsLink id={playerId} name={name} className={`truncate hover:underline ${linkFocus} ${className}`}>
      {name}
    </PlayerStatsLink>
  );
}

/** A column head with what it means behind an "i". */
function Head({ children, tip, align = "end" }: { children: ReactNode; tip: string; align?: "start" | "end" }) {
  return (
    <span className={`slot-label flex items-center gap-1.5 ${align === "end" ? "justify-end" : ""}`}>
      {children}
      <InfoTip label={`About ${typeof children === "string" ? children : "this column"}`}>{tip}</InfoTip>
    </span>
  );
}

export function WaffleBoardView({ waffle, who }: { waffle: WaffleBoard; who: Who }) {
  return (
    <section aria-labelledby="waffle-title" className="relative rounded-xl border border-panel-border bg-stock-panel p-4 sm:p-5">
      <div aria-hidden="true" className="lattice pointer-events-none absolute inset-0 rounded-xl" />
      <div className="relative flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 id="waffle-title" className="display text-2xl">Waffle board</h2>
          <InfoTip label="About the waffle board">Every team&apos;s finish in every finished round. 1 is gold, last is red.</InfoTip>
        </div>
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-1" data-testid="stats-waffle">
            <caption className="sr-only">Each team&apos;s finish per finished round</caption>
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-10 bg-stock-panel pr-2 text-left text-xs font-semibold text-ink-soft">Team</th>
                {waffle.rounds.map((round) => (
                  <th key={round} scope="col" className="stat w-9 text-center text-xs font-normal text-ink-faint">R{round}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {waffle.rows.map((row) => (
                <tr key={row.memberId} data-testid="waffle-row">
                  <th scope="row" className="sticky left-0 z-10 bg-stock-panel pr-2 text-left">
                    <TeamName memberId={row.memberId} who={who} size={22} className="max-w-44 text-sm font-semibold" />
                  </th>
                  {row.places.map((place, index) => (
                    <td
                      key={waffle.rounds[index]}
                      data-testid="waffle-cell"
                      aria-label={place === null ? `Round ${waffle.rounds[index]}: no score` : `Round ${waffle.rounds[index]}: ${ordinal(place)}`}
                      className={`stat size-9 rounded-md text-center text-sm ${place === 1 ? "font-bold" : ""}`}
                      style={place === null ? undefined : { background: placeTint(place, waffle.teams) }}
                    >
                      {place ?? "–"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/**
 * Team profiles: each team's typical round and how far its rounds range,
 * drawn as one bar from worst to best on the league's own scale with the
 * average marked, then the counts a friend would quote.
 */
export function TeamProfilesView({ rows, who }: { rows: readonly TeamProfile[]; who: Who }) {
  const low = Math.min(...rows.map((row) => row.worstHundredths));
  const high = Math.max(...rows.map((row) => row.bestHundredths));
  const at = (value: number) => (high > low ? ((value - low) / (high - low)) * 100 : 50);
  const count = (value: number, glyph: "crown" | "spoon" | null, ink: string) => (
    <span className={`stat inline-flex items-center justify-end gap-1 ${value === 0 ? "text-ink-faint" : ink}`}>
      {glyph && value > 0 ? <Glyph name={glyph} size={13} /> : null}
      {value}
    </span>
  );
  return (
    <Bank framed label="Team profiles" info="Each team's finished rounds: its typical score, how far its rounds range, and how often it finished first, top three or last.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[38rem] text-sm" data-testid="stats-teams">
          <thead>
            <tr className="text-left">
              <th className="py-2 pr-3 font-normal"><span className="slot-label">Team</span></th>
              <th className="py-2 pr-3 font-normal"><Head tip="Points in a typical round.">Average</Head></th>
              <th className="w-[34%] py-2 pr-3 font-normal"><Head tip="The bar runs from the team's worst round to its best, on one scale for the whole league. The mark is the average." align="start">Range</Head></th>
              <th className="py-2 pr-3 font-normal"><Head tip="How far a typical round lands from the average. Low means steady, high means boom or bust.">Swing</Head></th>
              <th className="py-2 pr-3 font-normal"><Head tip="Rounds finished first.">Won</Head></th>
              <th className="py-2 pr-3 font-normal"><Head tip="Rounds finished in the top three.">Top 3</Head></th>
              <th className="py-2 font-normal"><Head tip="Rounds finished last.">Last</Head></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
                <tr key={row.memberId} className={`border-t border-panel-border ${row.memberId === who.you ? "bg-live-sunk/60" : ""}`}>
                  <td className="py-2 pr-3"><TeamName memberId={row.memberId} who={who} size={22} className="font-semibold" /></td>
                  <td className="stat py-2 pr-3 text-right font-bold">{formatHundredths(row.averageHundredths)}</td>
                  <td className="py-2 pr-3">
                    <span className="flex items-center gap-2">
                      <span className="stat w-11 shrink-0 text-right text-xs text-ink-faint">{formatHundredths(row.worstHundredths)}</span>
                      <span className="relative h-2 flex-1 rounded-full bg-stock-high" aria-hidden="true">
                        <span
                          className="absolute inset-y-0 rounded-full bg-ink-soft/50"
                          style={{ left: `${at(row.worstHundredths)}%`, width: `${Math.max(2, at(row.bestHundredths) - at(row.worstHundredths))}%` }}
                        />
                        <span className="absolute -top-1 h-4 w-1 -translate-x-1/2 rounded-full bg-live" style={{ left: `${at(row.averageHundredths)}%` }} />
                      </span>
                      <span className="stat w-11 shrink-0 text-xs text-ink-soft">{formatHundredths(row.bestHundredths)}</span>
                      <span className="sr-only">from {formatHundredths(row.worstHundredths)} to {formatHundredths(row.bestHundredths)}</span>
                    </span>
                  </td>
                  <td className="stat py-2 pr-3 text-right text-ink-soft">±{formatHundredths(row.spreadHundredths)}</td>
                  <td className="py-2 pr-3 text-right">{count(row.roundsWon, "crown", "font-bold text-gold")}</td>
                  <td className="py-2 pr-3 text-right">{count(row.topThree, null, "font-semibold text-ink")}</td>
                  <td className="py-2 text-right">{count(row.spoons, "spoon", "text-wood")}</td>
                </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Bank>
  );
}

export function HeadToHeadView({
  h2h,
  teams,
  action,
  who,
}: {
  h2h: HeadToHead | null;
  teams: readonly string[];
  action: string;
  who: Who;
}) {
  const select = (name: "a" | "b", value: string | undefined, label: string) => (
    <label className="flex min-w-0 flex-1 flex-col">
      <span className="sr-only">{label}</span>
      <select
        name={name}
        defaultValue={value}
        data-testid={`h2h-${name}`}
        className="block min-h-11 w-full appearance-none truncate rounded-lg border border-rule bg-stock px-3 text-sm text-ink focus:border-live focus:outline-2 focus:outline-live/40"
      >
        {teams.map((memberId) => (
          <option key={memberId} value={memberId}>{who.team(memberId)}</option>
        ))}
      </select>
    </label>
  );
  const ready = h2h && h2h.a !== h2h.b && h2h.rounds.length > 0 ? h2h : null;
  return (
    <Bank
      framed
      label="Head-to-head"
      info="Two teams, round by round. Green bars are rounds the first team won, red bars rounds the second won; a taller bar is a wider margin. Point at or tap a bar for its round."
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,24rem)_auto_minmax(0,1fr)] lg:items-center lg:gap-6">
        <form method="get" action={action} className="flex items-center gap-2">
          {select("a", h2h?.a, "Team")}
          <span className="text-xs font-semibold text-ink-faint">v</span>
          {select("b", h2h?.b, "Against")}
          <button type="submit" className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-rule px-3 text-sm font-semibold text-ink hover:border-ink-soft">
            Compare
          </button>
        </form>
        {!h2h || h2h.a === h2h.b ? (
          <EmptyNotice testId="h2h-empty">Pick two different teams.</EmptyNotice>
        ) : !ready ? (
          <EmptyNotice testId="h2h-empty">These two have not both played a finished round yet.</EmptyNotice>
        ) : (
          <>
            <p className="flex items-center gap-3" data-testid="h2h">
              <span className="flex items-center gap-2">{who.crest(ready.a, 28)}<span className="sr-only">{who.team(ready.a)}</span></span>
              <span className="display-figure text-4xl" data-testid="h2h-score">{ready.aWins}–{ready.bWins}</span>
              <span className="flex items-center gap-2">{who.crest(ready.b, 28)}<span className="sr-only">{who.team(ready.b)}</span></span>
              {ready.ties > 0 ? <span className="text-xs text-ink-soft">{ready.ties} tied</span> : null}
            </p>
            <MarginStrip
              rounds={ready.rounds.map((row) => {
                const winner = row.marginHundredths > 0 ? ready.a : row.marginHundredths < 0 ? ready.b : null;
                return {
                  round: row.round,
                  marginHundredths: row.marginHundredths,
                  said: `Round ${row.round}: ${winner ? `${who.team(winner)} by ${formatHundredths(Math.abs(row.marginHundredths))}` : "tied"}`,
                };
              })}
            />
          </>
        )}
      </div>
    </Bank>
  );
}

/** A team list with column heads: the shape lineup efficiency, captain regret and hindsight share. */
function TeamTable({
  columns,
  rows,
  testId,
}: {
  columns: readonly { readonly label: string; readonly tip: string; readonly width: string }[];
  rows: readonly { readonly memberId: string; readonly cells: readonly ReactNode[] }[];
  testId: string;
}) {
  const template = `minmax(0,1fr) ${columns.map((column) => column.width).join(" ")}`;
  return (
    <div className="flex flex-col" data-testid={testId}>
      <div className="grid items-center gap-3 border-b border-panel-border pb-2" style={{ gridTemplateColumns: template }}>
        <span className="slot-label">Team</span>
        {columns.map((column) => (
          <Head key={column.label} tip={column.tip}>{column.label}</Head>
        ))}
      </div>
      <ul role="list" className="flex flex-col divide-y divide-panel-border">
        {rows.map((row) => (
          <li key={row.memberId} className="grid min-h-11 items-center gap-3 py-1.5" style={{ gridTemplateColumns: template }}>
            {row.cells}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LineupEfficiencyView({ rows, who }: { rows: readonly LineupEfficiency[]; who: Who }) {
  const benchMax = Math.max(1, ...rows.map((row) => row.benchLostTenths));
  return (
    <Bank framed label="Lineup efficiency" info="How well each team set its lineup, in rounds where a lineup was recorded.">
      {rows.every((row) => row.captainRounds === 0 && row.benchLostTenths === 0) ? (
        <EmptyNotice testId="stats-lineups-empty">No lineup has been recorded yet, so every round counted everyone at 100%.</EmptyNotice>
      ) : (
        <TeamTable
          testId="stats-lineups"
          columns={[
            { label: "Bench", tip: "Points scored by bench and inactive players that did not count in full. Lower is better.", width: "minmax(6rem,9rem)" },
            { label: "Captain", tip: "Rounds the captain was the best of the starting five, out of rounds with a captain.", width: "4.5rem" },
          ]}
          rows={rows.map((row) => ({
            memberId: row.memberId,
            cells: [
              <TeamName key="team" memberId={row.memberId} who={who} className="text-sm font-semibold" />,
              <span key="bench" className="flex items-center justify-end gap-2">
                <span className="hidden h-1.5 flex-1 overflow-hidden rounded-full bg-stock-high sm:block" aria-hidden="true">
                  <span className="block h-full rounded-full bg-loss" style={{ width: `${(row.benchLostTenths / benchMax) * 100}%` }} />
                </span>
                <span className="stat w-12 text-right text-sm">{formatTenths(row.benchLostTenths)}</span>
              </span>,
              <span key="captain" className="stat text-right text-sm text-ink-soft">
                {row.captainRounds > 0 ? `${row.captainHits}/${row.captainRounds}` : "—"}
              </span>,
            ],
          }))}
        />
      )}
    </Bank>
  );
}

export function CaptainRegretView({ rows, who }: { rows: readonly CaptainRegret[]; who: Who }) {
  return (
    <Bank framed label="Captain regret" info="What the captain's ×2 would have added had it been on the best of the five starters, summed over the season. Lower is better.">
      {rows.length === 0 ? (
        <EmptyNotice testId="stats-captains-empty">No captain has been recorded for a finished round yet.</EmptyNotice>
      ) : (
        <TeamTable
          testId="stats-captains"
          columns={[
            { label: "Right", tip: "Rounds the armband was on the best starter, out of rounds with a captain.", width: "4rem" },
            { label: "Missed", tip: "Points the armband missed, summed.", width: "4.5rem" },
          ]}
          rows={rows.map((row) => ({
            memberId: row.memberId,
            cells: [
              <TeamName key="team" memberId={row.memberId} who={who} className="text-sm font-semibold" />,
              <span key="right" className="stat text-right text-sm text-ink-soft">{row.perfect}/{row.rounds}</span>,
              <span key="missed" className={`stat text-right text-sm font-bold ${row.regretTenths > 0 ? "text-loss" : "text-gain"}`}>
                {row.regretTenths > 0 ? `−${formatTenths(row.regretTenths)}` : "0.0"}
              </span>,
            ],
          }))}
        />
      )}
    </Bank>
  );
}

export function HindsightView({ rows, who }: { rows: readonly Hindsight[]; who: Who }) {
  return (
    <Bank framed label="Hindsight lineup" info="Each round replayed with what the squad actually scored: the lineup set against the best one the same squad allowed. 100% means nothing was left on the bench.">
      {rows.length === 0 ? (
        <EmptyNotice testId="stats-hindsight-empty">No lineup has been recorded for a finished round yet.</EmptyNotice>
      ) : (
        <TeamTable
          testId="stats-hindsight"
          columns={[
            { label: "IQ", tip: "Points scored as a share of the best lineup's points.", width: "minmax(6rem,9rem)" },
            { label: "Worst", tip: "The round that left the most points behind, and how many.", width: "5.5rem" },
          ]}
          rows={rows.map((row) => ({
            memberId: row.memberId,
            cells: [
              <TeamName key="team" memberId={row.memberId} who={who} className="text-sm font-semibold" />,
              <span key="iq" className="flex items-center justify-end gap-2">
                <span className="hidden h-1.5 flex-1 overflow-hidden rounded-full bg-stock-high sm:block" aria-hidden="true">
                  <span className="block h-full rounded-full bg-gain" style={{ width: `${row.iqPercent ?? 0}%` }} />
                </span>
                <span className="stat w-10 text-right text-sm font-bold">{row.iqPercent === null ? "—" : `${row.iqPercent}%`}</span>
              </span>,
              <span key="worst" className="flex justify-end">
                {row.worst && row.worst.lostTenths > 0 ? (
                  <span className="stat rounded-full border border-panel-border px-2 py-0.5 text-xs whitespace-nowrap text-ink-soft">
                    R{row.worst.round} <span className="text-loss">−{formatTenths(row.worst.lostTenths)}</span>
                  </span>
                ) : (
                  <span className="rounded-full border border-gain/40 px-2 py-0.5 text-xs text-gain">Perfect</span>
                )}
              </span>,
            ],
          }))}
        />
      )}
    </Bank>
  );
}

/**
 * Club loyalty: one bar per team cut into the clubs its counted points came
 * from, each in the club's own colour, then the top clubs as crests with
 * their points. The club's name is behind its crest.
 */
export function ClubLoyaltyView({ rows, clubNames, who }: { rows: readonly ClubLoyalty[]; clubNames: ReadonlyMap<string, string>; who: Who }) {
  return (
    <Bank framed label="Club loyalty" info="Counted points by the EuroLeague club the player wore that night, after lineups. Point at or tap a colour or a crest for the club's name.">
      {rows.length === 0 ? (
        <EmptyNotice testId="stats-clubs-empty">No counted points yet.</EmptyNotice>
      ) : (
        <ul role="list" className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" data-testid="stats-clubs">
          {rows.map((row) => {
            const top = row.clubs.slice(0, 4);
            const segments = clubShares(row.clubs, 4).map((share) => ({ ...share, name: clubNames.get(share.clubCode) ?? share.clubCode }));
            return (
              <li key={row.memberId} className="flex min-w-0 flex-col gap-2">
                <TeamName memberId={row.memberId} who={who} className="text-sm font-semibold" />
                <ClubBar segments={segments} />
                <ol className="flex flex-wrap gap-x-2.5 gap-y-1">
                  {top.map((club) => {
                    const name = clubNames.get(club.clubCode) ?? club.clubCode;
                    return (
                      <li key={club.clubCode} className="flex items-center gap-1">
                        <InfoTip
                          triggerClassName="inline-grid size-7 place-items-center rounded-md"
                          trigger={
                            <>
                              <ClubCrest clubCode={club.clubCode} />
                              <span className="sr-only">{name}</span>
                            </>
                          }
                        >
                          {name}
                        </InfoTip>
                        <span className="stat text-xs">{formatTenths(club.tenths)}</span>
                      </li>
                    );
                  })}
                </ol>
              </li>
            );
          })}
        </ul>
      )}
    </Bank>
  );
}

export function DraftValueView({ draft, who }: { draft: DraftValue; who: Who }) {
  const list = (title: string, meaning: string, ink: string, picks: DraftValue["steals"], testId: string) => (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <span className="flex items-center gap-1.5">
        <span className={`slot-label ${ink}`}>{title}</span>
        <InfoTip label={`About ${title}`}>{meaning}</InfoTip>
      </span>
      <ol className="flex flex-col divide-y divide-panel-border">
        {picks.map((pick) => {
          const person = who.player(pick.playerId);
          return (
            <li key={pick.overallNo} className="grid grid-cols-[2.25rem_auto_minmax(0,1fr)_auto_2.25rem_3.5rem] items-center gap-2 py-1.5 text-sm">
              <span className="stat text-xs text-ink-faint">#{pick.overallNo}</span>
              <PlayerPortrait personCode={person?.personCode} name={person?.name ?? "A player"} />
              <PlayerName playerId={pick.playerId} who={who} className="font-semibold" />
              <Link href={who.teamHref(pick.memberId)} title={who.team(pick.memberId)} className={`rounded-full ${linkFocus}`}>
                {who.crest(pick.memberId, 18)}
                <span className="sr-only">{who.team(pick.memberId)}</span>
              </Link>
              <span className="stat text-xs text-ink-soft">R{pick.round}</span>
              <span className="stat text-right font-bold">{formatTenths(pick.tenths)}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
  return (
    <Bank framed label="Draft value" info="Points each pick has scored for the team that drafted it.">
      {draft.steals.length === 0 && draft.busts.length === 0 ? (
        <EmptyNotice testId="stats-draft-empty">This league has no finished draft to look back on.</EmptyNotice>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 sm:gap-8">
          {list("Steals · late picks", "Late picks that scored most for the team that drafted them.", "text-gain", draft.steals, "stats-steals")}
          {list("Busts · early picks", "Early picks that scored least for the team that drafted them.", "text-loss", draft.busts, "stats-busts")}
        </div>
      )}
    </Bank>
  );
}
