import type { NavLeague } from "@eurovafliai/core/nav/items";
import { leagueSource } from "@eurovafliai/core/positions";

import type { LeagueWithMembers } from "@/lib/leagues/types";

/** The nav's view of a league, from what every league page already reads. */
export function navLeagueFrom(data: LeagueWithMembers): NavLeague {
  const you = data.members.find((member) => member.isYou) ?? null;
  return {
    id: data.league.id,
    slug: data.league.slug ?? "",
    name: data.league.name,
    status: data.league.status,
    youMemberId: you?.id ?? null,
    youMemberSlug: you?.slug ?? "",
    isCommissioner: data.isCommissioner,
    canManage: data.isCommissioner || Boolean(you?.canManage),
    rolled: Boolean(data.settings.rolled_at),
    sourceOwned: Boolean(data.league.basketnews_team_id),
    source: leagueSource(data.league),
  };
}
