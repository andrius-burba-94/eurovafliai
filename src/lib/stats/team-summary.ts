import type {
  CaptainRegret,
  ClubLoyalty,
  Hindsight,
  LeagueStats,
  LineupEfficiency,
  TeamProfile,
} from "./league-stats";

/**
 * One team's slice of League Stats, for its own page: its finish in every
 * finished round, its profile, how it set its lineups and captains, and the
 * clubs its points came from. Pure; `readLeagueStats` is the read.
 */
export type TeamSummary = {
  readonly finishes: readonly { readonly round: number; readonly place: number | null }[];
  readonly teams: number;
  readonly profile: TeamProfile | null;
  readonly lineup: LineupEfficiency | null;
  readonly hindsight: Hindsight | null;
  readonly captain: CaptainRegret | null;
  readonly clubs: ClubLoyalty | null;
};

export function teamSummary(stats: LeagueStats, memberId: string): TeamSummary {
  const row = stats.waffle.rows.find((entry) => entry.memberId === memberId);
  const lineup = stats.lineups.find((entry) => entry.memberId === memberId) ?? null;
  return {
    finishes: stats.waffle.rounds.map((round, index) => ({ round, place: row?.places[index] ?? null })),
    teams: stats.waffle.teams,
    profile: stats.teams.find((entry) => entry.memberId === memberId) ?? null,
    // A team nobody recorded a lineup for has nothing to judge, not a perfect record.
    lineup: lineup && (lineup.captainRounds > 0 || lineup.benchLostTenths > 0) ? lineup : null,
    hindsight: stats.hindsight.find((entry) => entry.memberId === memberId) ?? null,
    captain: stats.captains.find((entry) => entry.memberId === memberId) ?? null,
    clubs: stats.clubs.find((entry) => entry.memberId === memberId) ?? null,
  };
}
