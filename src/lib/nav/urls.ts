/**
 * Every address in the app that names a league, a team or a player is built
 * here: /l/<league>, /l/<league>/<team>, /l/<league>/players/<player>. A
 * record without a slug yet (a fresh row before `ensureSlugs` reaches it) is
 * addressed by its id, which resolves just the same.
 */

export type Ref = { readonly id: string; readonly slug?: string | null };

const segment = (ref: Ref | string): string => (typeof ref === "string" ? ref : ref.slug || ref.id);

/** `/l/<league>` and its pages: `leagueHref(league, "standings")`. */
export function leagueHref(league: Ref | string, ...rest: string[]): string {
  const tail = rest.filter(Boolean).join("/");
  return `/l/${segment(league)}${tail ? `/${tail}` : ""}`;
}

/** A team's page sits directly under its league. */
export function teamHref(league: Ref | string, member: Ref | string): string {
  return `/l/${segment(league)}/${segment(member)}`;
}

/** A player's page, inside a league when there is one. */
export function playerHref(player: Ref | string, league?: Ref | string | null): string {
  return league ? `/l/${segment(league)}/players/${segment(player)}` : `/players/${segment(player)}`;
}

/** What a league page hands its client components: its base and each team's address. */
export type LeaguePaths = {
  readonly base: string;
  readonly teams: Readonly<Record<string, string>>;
};

export function leaguePaths(league: Ref, members: readonly Ref[]): LeaguePaths {
  return {
    base: leagueHref(league),
    teams: Object.fromEntries(members.map((member) => [member.id, teamHref(league, member)])),
  };
}
