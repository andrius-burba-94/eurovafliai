import Link from "next/link";

import { TeamCrest } from "@/components/broadcast";
import { Menu } from "@/components/menu";
import { ordinal } from "@/lib/season/story";
import type { CrestShape, TeamColor } from "@/lib/teams/identity";

export type SwitchTeam = {
  readonly id: string;
  readonly href: string;
  readonly name: string;
  readonly manager: string;
  readonly color: TeamColor;
  readonly crest: CrestShape;
  readonly isYou: boolean;
  readonly rank: number | null;
};

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live";

/**
 * The team's name is also the way to every other team in the league: it opens
 * the league's teams in table order, each with its crest, manager and rank.
 * The season being looked at travels with the link.
 */
export function TeamSwitcher({
  title,
  currentId,
  season,
  teams,
}: {
  title: string;
  currentId: string;
  season: string | null;
  teams: readonly SwitchTeam[];
}) {
  const ordered = [...teams].sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.name.localeCompare(b.name));
  const query = season ? `?season=${encodeURIComponent(season)}` : "";
  return (
    <Menu
      testId="team-switcher"
      headingClassName="mt-1 min-w-0"
      anchored={false}
      label={
        <>
          <span className="display min-w-0 text-4xl break-words sm:text-5xl">{title}</span>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            width={22}
            height={22}
            fill="none"
            stroke="currentColor"
            strokeWidth={2.25}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mb-1.5 shrink-0 self-end text-ink-soft transition-transform duration-200 group-hover:text-ink group-aria-expanded:rotate-180 group-aria-expanded:text-ink motion-reduce:transition-none"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
          <span className="sr-only">, switch team</span>
        </>
      }
      buttonClassName={`group -mx-1.5 inline-flex min-h-11 items-center gap-2 rounded-lg px-1.5 text-left text-ink transition-colors hover:bg-ink/5 aria-expanded:bg-ink/5 ${focusRing}`}
      // No top or left: the panel opens where it stands, under the title. On a
      // phone it spans the hero rather than running off the screen's edge.
      panelClassName="popover-drop absolute z-50 mt-2 flex max-h-[min(28rem,70vh)] origin-top-left flex-col overflow-y-auto rounded-xl border border-panel-border bg-stock-panel p-1.5 max-sm:inset-x-0 sm:w-[22rem]"
    >
      <p className="slot-label px-2.5 pt-1 pb-1.5">Teams in the league</p>
      <ul role="list" className="flex flex-col gap-0.5" data-testid="team-switcher-list">
        {ordered.map((team) => {
          const here = team.id === currentId;
          return (
            <li key={team.id}>
              <Link
                href={`${team.href}${query}`}
                aria-current={here ? "page" : undefined}
                data-testid="team-switcher-team"
                className={`flex min-h-12 items-center gap-3 rounded-lg px-2.5 py-1.5 transition-colors ${focusRing} ${
                  here ? "bg-stock-high" : "hover:bg-ink/5"
                }`}
              >
                <span className="stat w-7 shrink-0 text-xs text-ink-faint">{team.rank ? ordinal(team.rank) : "–"}</span>
                <TeamCrest name={team.name} color={team.color} shape={team.crest} size={28} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={`truncate text-sm ${here ? "font-bold text-ink" : "font-semibold text-ink"}`}>{team.name}</span>
                  <span className="truncate text-xs text-ink-soft">{team.manager}</span>
                </span>
                {team.isYou ? (
                  <span className="slot-label shrink-0 rounded-full border border-live/50 px-2 py-0.5 text-live">You</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </Menu>
  );
}
