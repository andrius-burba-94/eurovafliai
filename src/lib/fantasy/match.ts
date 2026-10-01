import { displayName } from "@/lib/players/name";
import { normalizeName } from "@/lib/rosters/normalize";

import type { FantasyPlayer, FantasyTeam } from "./parse";

/**
 * Who is who: the official game's teams and players against ours.
 *
 * Pure. A stored link (`fantasy_team_id`, `fantasy_id`) always wins; the
 * heuristics only run for what has never been linked, and anything they cannot
 * place alone becomes a question for the commissioner rather than a guess. A
 * wrong guess would move a real player off a real roster.
 */

export type PoolPlayer = {
  readonly id: string;
  readonly name: string;
  readonly nameNormalized: string;
  readonly clubCode: string;
  readonly clubName: string;
  readonly dorsal: string;
  readonly fantasyId: string;
  /** `left` rows are tried last: a re-registered player leaves one behind under his old name. */
  readonly status: string;
};

export type SyncMember = {
  readonly id: string;
  readonly teamName: string;
  readonly fantasyTeamId: string;
};

export type Choice = { readonly id: string; readonly label: string };

export type SyncQuestion =
  | {
      readonly kind: "team";
      readonly fantasyTeamId: string;
      readonly fantasyTeamName: string;
      readonly manager: string;
      readonly choices: readonly Choice[];
    }
  | {
      readonly kind: "member";
      readonly memberId: string;
      readonly teamName: string;
      readonly choices: readonly Choice[];
    }
  | {
      readonly kind: "player";
      readonly fantasyPlayerId: string;
      readonly name: string;
      readonly club: string;
      readonly jersey: string;
      readonly fantasyTeamName: string;
      readonly choices: readonly Choice[];
    };

export type Resolution = {
  /** Official team id → our member id. */
  readonly teams: ReadonlyMap<string, string>;
  /** Official player id → our player id. */
  readonly players: ReadonlyMap<string, string>;
  /** Links the heuristics found this run, to be stored. */
  readonly teamLinks: readonly { memberId: string; fantasyTeamId: string }[];
  readonly playerLinks: readonly { playerId: string; fantasyId: string }[];
  readonly questions: readonly SyncQuestion[];
};

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv"]);

function tokens(value: string): string[] {
  return normalizeName(value).split(" ").filter(Boolean);
}

function surnameTokens(player: FantasyPlayer): string[] {
  const all = tokens(player.lastName);
  const kept = all.filter((token) => !SUFFIXES.has(token));
  return kept.length > 0 ? kept : all;
}

function holdsAll(pool: PoolPlayer, wanted: readonly string[]): boolean {
  const have = new Set(pool.nameNormalized.split(" "));
  return wanted.every((token) => have.has(token));
}

function sharesAny(pool: PoolPlayer, wanted: readonly string[]): boolean {
  const have = new Set(pool.nameNormalized.split(" "));
  return wanted.some((token) => have.has(token));
}

/** The surname's letters, order-free: "Miller-Mcintyre" and "Miller-Mc Intyre" split into different words. */
function letters(value: string): string {
  return [...normalizeName(value).replace(/\s+/g, "")].sort().join("");
}

function sameSurnameLetters(pool: PoolPlayer, player: FantasyPlayer): boolean {
  const surname = pool.name.includes(",") ? pool.name.slice(0, pool.name.indexOf(",")) : pool.name;
  return letters(surname) === letters(player.lastName);
}

function sameJersey(pool: PoolPlayer, player: FantasyPlayer): boolean {
  return player.jersey !== "" && pool.dorsal.trim() === player.jersey;
}

export function playerLabel(pool: PoolPlayer): string {
  return `${displayName(pool.name)} · ${pool.clubCode}${pool.dorsal ? ` #${pool.dorsal}` : ""}`;
}

function byLabel(a: Choice, b: Choice): number {
  return a.label.localeCompare(b.label);
}

/**
 * Official club id → our club code.
 *
 * By name first — on 30 September 2026 all twenty names matched ours exactly,
 * while all but six abbreviations differed. A sponsor rename mid-season is the
 * case the vote exists for: the club whose players carry the same surname and
 * jersey wins.
 */
export function resolveClubs(
  teams: readonly FantasyTeam[],
  pool: readonly PoolPlayer[],
): Map<string, string> {
  const byName = new Map<string, string>();
  for (const player of pool) byName.set(normalizeName(player.clubName), player.clubCode);

  const clubs = new Map<string, { name: string; players: FantasyPlayer[] }>();
  for (const team of teams) {
    for (const player of team.players) {
      const entry = clubs.get(player.club.id) ?? { name: player.club.name, players: [] };
      entry.players.push(player);
      clubs.set(player.club.id, entry);
    }
  }

  const resolved = new Map<string, string>();
  for (const [clubId, club] of clubs) {
    const named = byName.get(normalizeName(club.name));
    if (named) {
      resolved.set(clubId, named);
      continue;
    }
    const votes = new Map<string, number>();
    for (const player of club.players) {
      const surname = surnameTokens(player);
      for (const candidate of pool) {
        if (sameJersey(candidate, player) && holdsAll(candidate, surname)) {
          votes.set(candidate.clubCode, (votes.get(candidate.clubCode) ?? 0) + 1);
        }
      }
    }
    const ranked = [...votes].sort((a, b) => b[1] - a[1]);
    if (ranked[0] && ranked[0][1] > (ranked[1]?.[1] ?? 0)) resolved.set(clubId, ranked[0][0]);
  }
  return resolved;
}

/**
 * The one pool row this official player is, or null when that is not certain.
 *
 * Among players who have not left first, then everyone — on 30 September four
 * stale "left" rows ("Lawson, Aj", "Mills, Patty") shadowed the real ones.
 * Surname tokens inside our name within the club; a jersey settles a tie. With
 * no surname hit, the same surname letters, then the jersey plus any shared
 * name token — "Rj Cole" is stored as "Cole, Robert Jalen".
 */
export function matchPlayer(
  player: FantasyPlayer,
  clubCode: string | undefined,
  pool: readonly PoolPlayer[],
): PoolPlayer | null {
  const current = pool.filter((row) => row.status !== "left");
  return matchWithin(player, clubCode, current) ?? matchWithin(player, clubCode, pool);
}

function matchWithin(
  player: FantasyPlayer,
  clubCode: string | undefined,
  pool: readonly PoolPlayer[],
): PoolPlayer | null {
  const surname = surnameTokens(player);
  const inClub = clubCode ? pool.filter((row) => row.clubCode === clubCode) : [];

  if (clubCode) {
    const named = inClub.filter((row) => holdsAll(row, surname));
    if (named.length === 1) return named[0]!;
    if (named.length > 1) {
      const numbered = named.filter((row) => sameJersey(row, player));
      if (numbered.length === 1) return numbered[0]!;
      const first = tokens(player.firstName);
      const given = named.filter((row) => first.length > 0 && holdsAll(row, first));
      return given.length === 1 ? given[0]! : null;
    }
    const spelled = inClub.filter((row) => sameSurnameLetters(row, player));
    if (spelled.length === 1) return spelled[0]!;
    const numbered = inClub.filter(
      (row) => sameJersey(row, player) && sharesAny(row, [...surname, ...tokens(player.firstName)]),
    );
    return numbered.length === 1 ? numbered[0]! : null;
  }

  const anywhere = pool.filter((row) => sameJersey(row, player) && holdsAll(row, surname));
  return anywhere.length === 1 ? anywhere[0]! : null;
}

export function resolveFantasy(
  teams: readonly FantasyTeam[],
  members: readonly SyncMember[],
  pool: readonly PoolPlayer[],
): Resolution {
  const questions: SyncQuestion[] = [];

  const teamMap = new Map<string, string>();
  const teamLinks: { memberId: string; fantasyTeamId: string }[] = [];
  const officialIds = new Set(teams.map((team) => team.id));
  for (const member of members) {
    if (member.fantasyTeamId && officialIds.has(member.fantasyTeamId)) {
      teamMap.set(member.fantasyTeamId, member.id);
    }
  }
  const linkedMembers = () => new Set(teamMap.values());
  for (const team of teams) {
    if (teamMap.has(team.id)) continue;
    const key = normalizeName(team.name);
    const taken = linkedMembers();
    const same = members.filter(
      (member) => !taken.has(member.id) && normalizeName(member.teamName) === key,
    );
    if (same.length === 1) {
      teamMap.set(team.id, same[0]!.id);
      teamLinks.push({ memberId: same[0]!.id, fantasyTeamId: team.id });
    }
  }
  const taken = linkedMembers();
  const openMembers = members.filter((member) => !taken.has(member.id));
  const openTeams = teams.filter((team) => !teamMap.has(team.id));
  for (const team of openTeams) {
    questions.push({
      kind: "team",
      fantasyTeamId: team.id,
      fantasyTeamName: team.name,
      manager: team.manager,
      choices: openMembers.map((member) => ({ id: member.id, label: member.teamName })).sort(byLabel),
    });
  }
  if (openTeams.length === 0) {
    for (const member of openMembers) {
      questions.push({ kind: "member", memberId: member.id, teamName: member.teamName, choices: [] });
    }
  }

  const clubs = resolveClubs(teams, pool);
  const byFantasyId = new Map(pool.filter((row) => row.fantasyId).map((row) => [row.fantasyId, row]));
  const playerMap = new Map<string, string>();
  const claims = new Map<string, string[]>();
  const pending: { player: FantasyPlayer; team: FantasyTeam }[] = [];
  for (const team of teams) {
    for (const player of team.players) {
      const stored = byFantasyId.get(player.id);
      if (stored) {
        playerMap.set(player.id, stored.id);
        continue;
      }
      const candidate = matchPlayer(
        player,
        clubs.get(player.club.id),
        pool.filter((row) => !row.fantasyId),
      );
      if (candidate) claims.set(candidate.id, [...(claims.get(candidate.id) ?? []), player.id]);
      pending.push({ player, team });
    }
  }

  const playerLinks: { playerId: string; fantasyId: string }[] = [];
  const claimed = new Map<string, string>();
  for (const [poolId, fantasyIds] of claims) {
    if (fantasyIds.length === 1) claimed.set(fantasyIds[0]!, poolId);
  }
  for (const { player, team } of pending) {
    const poolId = claimed.get(player.id);
    if (poolId) {
      playerMap.set(player.id, poolId);
      playerLinks.push({ playerId: poolId, fantasyId: player.id });
      continue;
    }
    const clubCode = clubs.get(player.club.id);
    const choices = pool
      .filter((row) => !row.fantasyId && (!clubCode || row.clubCode === clubCode))
      .map((row) => ({ id: row.id, label: playerLabel(row) }))
      .sort(byLabel);
    questions.push({
      kind: "player",
      fantasyPlayerId: player.id,
      name: `${player.firstName} ${player.lastName}`.trim(),
      club: player.club.name,
      jersey: player.jersey,
      fantasyTeamName: team.name,
      choices,
    });
  }

  return { teams: teamMap, players: playerMap, teamLinks, playerLinks, questions };
}
