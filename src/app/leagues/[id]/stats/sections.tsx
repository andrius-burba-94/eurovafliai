import type { ReactNode } from "react";

import { Bank, EmptyNotice } from "@/components/board";
import { ClubCrest, PlayerPortrait } from "@/components/official-media";
import { displayName } from "@/lib/players/name";
import { ordinal } from "@/lib/season/story";
import type {
  CaptainRegret,
  ClubLoyalty,
  DraftValue,
  HeadToHead,
  Hindsight,
  WaffleBoard,
} from "@/lib/stats/league-stats";
import type { StatsPlayer } from "@/lib/stats/league-stats-queries";
import { formatHundredths, formatTenths } from "@/lib/stats/scoring";

/** How the sections name things: the page owns the lookups, they only draw. */
export type Who = {
  readonly team: (memberId: string | null) => string;
  readonly crest: (memberId: string | null, size: number) => ReactNode;
  readonly player: (playerId: string) => StatsPlayer | undefined;
  readonly you: string;
};

/** Gold for a round won, loss for last, mixed into the panel so the number on it reads in both grounds. */
function placeTint(place: number, teams: number): string {
  const towardLast = teams > 1 ? Math.round(((place - 1) / (teams - 1)) * 100) : 0;
  return `color-mix(in oklch, color-mix(in oklch, var(--color-loss) ${towardLast}%, var(--color-gold)) 42%, var(--color-stock-panel))`;
}

export function WaffleBoardView({ waffle, who }: { waffle: WaffleBoard; who: Who }) {
  return (
    <section aria-labelledby="waffle-title" className="relative overflow-hidden rounded-xl border border-panel-border bg-stock-panel p-4 sm:p-5">
      <div aria-hidden="true" className="lattice pointer-events-none absolute inset-0" />
      <div className="relative flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="waffle-title" className="display text-2xl">Waffle board</h2>
          <p className="text-xs text-ink-soft">Every team&apos;s finish in every round. 1 is gold, last is red.</p>
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
                    <span className={`flex max-w-40 items-center gap-2 text-sm font-semibold ${row.memberId === who.you ? "text-live" : ""}`}>
                      {who.crest(row.memberId, 22)}
                      <span className="truncate">{who.team(row.memberId)}</span>
                    </span>
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
    <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-semibold text-ink-soft">
      {label}
      <select
        name={name}
        defaultValue={value}
        data-testid={`h2h-${name}`}
        className="block min-h-11 w-full appearance-none rounded-lg border border-rule bg-stock px-3 text-base text-ink focus:border-live focus:outline-2 focus:outline-live/40"
      >
        {teams.map((memberId) => (
          <option key={memberId} value={memberId}>{who.team(memberId)}</option>
        ))}
      </select>
    </label>
  );
  const widest = Math.max(1, ...(h2h?.rounds ?? []).map((row) => Math.abs(row.marginHundredths)));
  return (
    <Bank framed label="Head-to-head" aside="Round by round">
      <form method="get" action={action} className="flex flex-wrap items-end gap-3">
        {select("a", h2h?.a, "Team")}
        {select("b", h2h?.b, "Against")}
        <button type="submit" className="inline-flex min-h-11 items-center rounded-lg border border-rule px-4 text-sm font-semibold text-ink hover:border-ink-soft">
          Compare
        </button>
      </form>
      {!h2h || h2h.a === h2h.b ? (
        <EmptyNotice testId="h2h-empty">Pick two different teams.</EmptyNotice>
      ) : h2h.rounds.length === 0 ? (
        <EmptyNotice testId="h2h-empty">These two have not both played a finished round yet.</EmptyNotice>
      ) : (
        <div className="flex flex-col gap-3" data-testid="h2h">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="flex items-center gap-2 font-semibold">{who.crest(h2h.a, 24)}{who.team(h2h.a)}</span>
            <span className="display-figure text-3xl" data-testid="h2h-score">{h2h.aWins}–{h2h.bWins}</span>
            <span className="flex items-center gap-2 font-semibold">{who.team(h2h.b)}{who.crest(h2h.b, 24)}</span>
            {h2h.ties > 0 ? <span className="text-ink-soft">{h2h.ties} tied</span> : null}
          </p>
          <ol className="flex h-32 items-stretch gap-1 overflow-x-auto" aria-label="Margin per round">
            {h2h.rounds.map((row) => {
              const share = `${Math.max(6, (Math.abs(row.marginHundredths) / widest) * 100)}%`;
              const winner = row.marginHundredths > 0 ? h2h.a : row.marginHundredths < 0 ? h2h.b : null;
              const said = `Round ${row.round}: ${winner ? `${who.team(winner)} by ${formatHundredths(Math.abs(row.marginHundredths))}` : "tied"}`;
              return (
                <li key={row.round} className="flex w-6 shrink-0 flex-col" aria-label={said} title={said} data-testid="h2h-round">
                  <span className="flex flex-1 items-end">
                    {row.marginHundredths > 0 ? <span className="w-full rounded-t-md bg-gain" style={{ height: share }} /> : null}
                  </span>
                  <span className="h-px bg-rule-strong" />
                  <span className="flex flex-1 items-start">
                    {row.marginHundredths < 0 ? <span className="w-full rounded-b-md bg-loss" style={{ height: share }} /> : null}
                  </span>
                  <span className="stat h-4 text-center text-[0.625rem] text-ink-faint" aria-hidden="true">{row.round}</span>
                </li>
              );
            })}
          </ol>
          <p className="text-xs text-ink-soft">
            Green above the line: rounds {who.team(h2h.a)} won. Red below: rounds {who.team(h2h.b)} won. Taller is a wider margin.
          </p>
        </div>
      )}
    </Bank>
  );
}

export function HindsightView({ rows, who }: { rows: readonly Hindsight[]; who: Who }) {
  return (
    <Bank framed label="Hindsight lineup" aside="Recorded rounds only">
      <p className="text-sm text-ink-soft">Each round replayed with what your squad actually scored: the lineup you set against the best legal one. 100% is perfect.</p>
      {rows.length === 0 ? (
        <EmptyNotice testId="stats-hindsight-empty">No lineup has been recorded for a finished round yet.</EmptyNotice>
      ) : (
        <ul role="list" className="flex flex-col divide-y divide-panel-border" data-testid="stats-hindsight">
          {rows.map((row) => (
            <li key={row.memberId} className="flex items-center gap-3 py-2">
              {who.crest(row.memberId, 20)}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold">{who.team(row.memberId)}</span>
                <span className="text-xs text-ink-soft">
                  {row.worst ? `Worst: round ${row.worst.round}, ${formatTenths(row.worst.lostTenths)} left on the table` : "Never left a point behind"}
                </span>
              </span>
              <span className="hidden h-2 w-20 overflow-hidden rounded-full bg-stock-high sm:block" aria-hidden="true">
                <span className="block h-full rounded-full bg-gain" style={{ width: `${row.iqPercent ?? 0}%` }} />
              </span>
              <span className="stat w-12 text-right text-sm font-bold">{row.iqPercent === null ? "—" : `${row.iqPercent}%`}</span>
            </li>
          ))}
        </ul>
      )}
    </Bank>
  );
}

export function CaptainRegretView({ rows, who }: { rows: readonly CaptainRegret[]; who: Who }) {
  const name = (playerId: string) => displayName(who.player(playerId)?.name ?? "A player");
  return (
    <Bank framed label="Captain regret" aside="Points the armband missed">
      <p className="text-sm text-ink-soft">What the captain&apos;s ×2 would have added on the best starter of the five, summed. Lower is better.</p>
      {rows.length === 0 ? (
        <EmptyNotice testId="stats-captains-empty">No captain has been recorded for a finished round yet.</EmptyNotice>
      ) : (
        <ul role="list" className="flex flex-col divide-y divide-panel-border" data-testid="stats-captains">
          {rows.map((row) => (
            <li key={row.memberId} className="flex items-center gap-3 py-2">
              {who.crest(row.memberId, 20)}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold">{who.team(row.memberId)}</span>
                <span className="text-xs text-ink-soft">
                  {row.worst
                    ? `Round ${row.worst.round}: ${name(row.worst.captainId)} wore it, ${name(row.worst.bestId)} scored ${formatTenths(row.worst.regretTenths)} more`
                    : "Always on the right player"}
                </span>
              </span>
              <span className="stat w-12 text-right text-xs text-ink-soft">{row.perfect}/{row.rounds}</span>
              <span className={`stat w-14 text-right text-sm font-bold ${row.regretTenths > 0 ? "text-loss" : "text-gain"}`}>
                {row.regretTenths > 0 ? `−${formatTenths(row.regretTenths)}` : "0.0"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Bank>
  );
}

export function ClubLoyaltyView({ rows, clubNames, who }: { rows: readonly ClubLoyalty[]; clubNames: ReadonlyMap<string, string>; who: Who }) {
  return (
    <Bank framed label="Club loyalty" aside="Counted points by EuroLeague club">
      {rows.length === 0 ? (
        <EmptyNotice testId="stats-clubs-empty">No counted points yet.</EmptyNotice>
      ) : (
        <ul role="list" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="stats-clubs">
          {rows.map((row) => {
            const top = row.clubs.slice(0, 4);
            const widest = Math.max(1, ...top.map((club) => club.tenths));
            return (
              <li key={row.memberId} className="flex flex-col gap-2">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  {who.crest(row.memberId, 20)}
                  <span className="truncate">{who.team(row.memberId)}</span>
                </p>
                <ol className="flex flex-col gap-1.5">
                  {top.map((club) => (
                    <li key={club.clubCode} className="flex items-center gap-2 text-xs">
                      <ClubCrest clubCode={club.clubCode} />
                      <span className="w-24 shrink-0 truncate text-ink-soft">{clubNames.get(club.clubCode) ?? club.clubCode}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-stock-high" aria-hidden="true">
                        <span className="block h-full rounded-full bg-ink-soft" style={{ width: `${(club.tenths / widest) * 100}%` }} />
                      </span>
                      <span className="stat w-12 text-right">{formatTenths(club.tenths)}</span>
                    </li>
                  ))}
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
      <div>
        <p className={`slot-label ${ink}`}>{title}</p>
        <p className="text-xs text-ink-soft">{meaning}</p>
      </div>
      <ol className="flex flex-col divide-y divide-panel-border">
        {picks.map((pick) => {
          const person = who.player(pick.playerId);
          return (
            <li key={pick.overallNo} className="grid grid-cols-[2.25rem_auto_minmax(0,1fr)_auto_2.25rem_3.5rem] items-center gap-2 py-1.5 text-sm">
              <span className="stat text-xs text-ink-faint">#{pick.overallNo}</span>
              <PlayerPortrait personCode={person?.personCode} name={person?.name ?? "A player"} />
              <span className="truncate font-semibold">{displayName(person?.name ?? "A player")}</span>
              <span title={who.team(pick.memberId)}>{who.crest(pick.memberId, 18)}<span className="sr-only">{who.team(pick.memberId)}</span></span>
              <span className="stat text-xs text-ink-soft">R{pick.round}</span>
              <span className="stat text-right font-bold">{formatTenths(pick.tenths)}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
  return (
    <Bank framed label="Draft value" aside="Points for the drafting team">
      {draft.steals.length === 0 && draft.busts.length === 0 ? (
        <EmptyNotice testId="stats-draft-empty">This league has no finished draft to look back on.</EmptyNotice>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {list("Steals · late picks", "Late picks that scored most for the team that drafted them.", "text-gain", draft.steals, "stats-steals")}
          {list("Busts · early picks", "Early picks that scored least for the team that drafted them.", "text-loss", draft.busts, "stats-busts")}
        </div>
      )}
    </Bank>
  );
}
