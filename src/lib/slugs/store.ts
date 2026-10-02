import type PocketBase from "pocketbase";

import { leagueHref } from "@/lib/nav/urls";
import { displayName } from "@/lib/players/name";

import { leagueSlug, playerSlug, teamSlug } from "./slug";

/**
 * Slugs in the database, framework-free so the worker and the actions share
 * it. Every write is a single-field update guarded by the partial unique
 * indexes of migration 1790400000: a raced slug fails its update and the next
 * pass picks another, so a crash or a race leaves a record on its id, never
 * two records on one slug.
 */

type Client = Pick<PocketBase, "collection">;

async function taken(pb: Client, collection: string, filter = ""): Promise<Set<string>> {
  const rows = await pb.collection(collection).getFullList<{ slug?: string }>({
    filter: filter ? `(${filter}) && slug != ''` : "slug != ''",
    fields: "slug",
    requestKey: null,
  });
  return new Set(rows.map((row) => row.slug!).filter(Boolean));
}

/** A league's address when an action holds only its id. */
export async function leaguePathOf(pb: Client, leagueId: string): Promise<string> {
  try {
    return leagueHref(await pb.collection("leagues").getOne<{ id: string; slug?: string }>(leagueId, { fields: "id,slug", requestKey: null }));
  } catch {
    return leagueHref(leagueId);
  }
}

export async function newLeagueSlug(pb: Client, name: string): Promise<string> {
  return leagueSlug(name, await taken(pb, "leagues"));
}

/** A team's slug in its league; `memberId` keeps a rename from colliding with itself. */
export async function newTeamSlug(pb: Client, leagueId: string, name: string, memberId?: string): Promise<string> {
  const quoted = (value: string) => `'${value.replace(/[^A-Za-z0-9]/g, "")}'`;
  const filter = memberId ? `league = ${quoted(leagueId)} && id != ${quoted(memberId)}` : `league = ${quoted(leagueId)}`;
  return teamSlug(name, await taken(pb, "league_members", filter));
}

export type SlugReport = { readonly leagues: number; readonly teams: number; readonly players: number; readonly failed: number };

/** Gives every record without a slug one. Idempotent: a second run writes nothing. */
export async function ensureSlugs(pb: PocketBase): Promise<SlugReport> {
  let failed = 0;
  const write = async (collection: string, id: string, slug: string): Promise<boolean> => {
    try {
      await pb.collection(collection).update(id, { slug }, { requestKey: null });
      return true;
    } catch {
      failed += 1;
      return false;
    }
  };

  const leagues = await pb.collection("leagues").getFullList<{ id: string; name: string; slug?: string }>({
    fields: "id,name,slug",
    sort: "created",
    requestKey: null,
  });
  const leagueSlugs = new Set(leagues.map((row) => row.slug).filter((slug): slug is string => Boolean(slug)));
  let leaguesWritten = 0;
  for (const league of leagues.filter((row) => !row.slug)) {
    const slug = leagueSlug(league.name, leagueSlugs);
    if (await write("leagues", league.id, slug)) {
      leagueSlugs.add(slug);
      leaguesWritten += 1;
    }
  }

  const members = await pb.collection("league_members").getFullList<{
    id: string;
    league: string;
    team_name?: string;
    slug?: string;
    expand?: { user?: { name?: string } };
  }>({ expand: "user", sort: "created", requestKey: null });
  const byLeague = new Map<string, Set<string>>();
  for (const member of members) {
    const set = byLeague.get(member.league) ?? new Set<string>();
    if (member.slug) set.add(member.slug);
    byLeague.set(member.league, set);
  }
  let teamsWritten = 0;
  for (const member of members.filter((row) => !row.slug)) {
    const set = byLeague.get(member.league)!;
    const slug = teamSlug(member.team_name?.trim() || member.expand?.user?.name || "", set);
    if (await write("league_members", member.id, slug)) {
      set.add(slug);
      teamsWritten += 1;
    }
  }

  const players = await pb.collection("players").getFullList<{ id: string; name: string; club_code?: string; slug?: string }>({
    fields: "id,name,club_code,slug",
    sort: "created",
    requestKey: null,
  });
  const playerSlugs = new Set(players.map((row) => row.slug).filter((slug): slug is string => Boolean(slug)));
  let playersWritten = 0;
  for (const player of players.filter((row) => !row.slug)) {
    const slug = playerSlug(displayName(player.name), player.club_code, playerSlugs);
    if (await write("players", player.id, slug)) {
      playerSlugs.add(slug);
      playersWritten += 1;
    }
  }

  return { leagues: leaguesWritten, teams: teamsWritten, players: playersWritten, failed };
}
