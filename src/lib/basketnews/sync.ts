import { matchPlayer, playerLabel, resolveClubs, type PoolPlayer, type SyncQuestion } from "@/lib/fantasy/match";
import type { FantasyPlayer, FantasyTeam } from "@/lib/fantasy/parse";
import { planSync, type SyncSeat, type SyncStep } from "@/lib/fantasy/plan";
import type { LineupSlots } from "@/lib/lineups/lineup";
import { normalizeName } from "@/lib/rosters/normalize";

import {
  readBasketNewsLeague, readBasketNewsLineup, readBasketNewsScore,
  readBasketNewsTeamReference, readBasketNewsTeams,
  type BasketNewsLeague, type BasketNewsLineup, type BasketNewsScore,
  type BasketNewsTeam,
} from "./client";

/** The business flow knows persistence operations, never PocketBase or its query syntax. */
export interface BasketNewsRepository {
  load(leagueId: string): Promise<{ name: string; season: string; commissioner: string; sourceTeamId: string; latestRound: number; pool: (PoolPlayer & { basketnewsId?: string })[] }>;
  linkLeague(leagueId: string, sourceLeagueId: string): Promise<void>;
  ensureMembers(leagueId: string, teams: readonly BasketNewsTeam[], ownTeamId: string, commissioner: string, firstPickOrder: readonly string[]): Promise<ReadonlyMap<string, { id: string; name: string }>>;
  linkPlayers(links: readonly { playerId: string; sourceId: string }[]): Promise<void>;
  ensureDraft(leagueId: string, picks: readonly { memberId: string; playerId: string }[], order: readonly string[], draftDate: Date): Promise<void>;
  seats(leagueId: string): Promise<SyncSeat[]>;
  apply(leagueId: string, steps: readonly SyncStep[], at: Date): Promise<void>;
  writeRound(leagueId: string, season: string, round: number, memberId: string, slots: LineupSlots, result: BasketNewsRoundResult | null): Promise<void>;
  recompute(season: string, leagueId: string): Promise<void>;
  progress(jobId: string, nextRound: number): Promise<void>;
}

export type BasketNewsRoundResult = {
  readonly totalHundredths: number;
  readonly calculatedHundredths: number;
  readonly players: readonly { playerId: string; rawHundredths: number; weightedHundredths: number; role: string }[];
};

export interface BasketNewsSource {
  teamReference: typeof readBasketNewsTeamReference;
  league: typeof readBasketNewsLeague;
  teams: typeof readBasketNewsTeams;
  lineup: typeof readBasketNewsLineup;
  score: typeof readBasketNewsScore;
}

export const basketNewsSource: BasketNewsSource = {
  teamReference: readBasketNewsTeamReference,
  league: readBasketNewsLeague,
  teams: readBasketNewsTeams,
  lineup: readBasketNewsLineup,
  score: readBasketNewsScore,
};

type SourcePlayer = BasketNewsLeague["draft"]["picks"][number]["player"];

function fantasyPlayer(player: SourcePlayer): FantasyPlayer {
  const position = player.team?.positions[0];
  const mapped = position === "guard" ? "G" : position === "forward" ? "F" : position === "center" ? "C" : null;
  if (!mapped) throw new Error(`BasketNews has no known position for ${player.firstName} ${player.lastName}.`);
  return {
    id: player.id,
    firstName: [player.firstName, player.middleName].filter(Boolean).join(" "),
    lastName: player.lastName,
    jersey: player.team?.number == null ? "" : String(player.team.number),
    position: mapped,
    club: { id: player.team?.team.id ?? "", name: player.team?.team.translation.name ?? "" },
  };
}

function slotsFor(lineup: BasketNewsLineup, ids: ReadonlyMap<string, string>): LineupSlots {
  const get = (sourceId: string) => {
    const id = ids.get(sourceId);
    if (!id) throw new Error(`BasketNews player ${sourceId} has no mapping.`);
    return id;
  };
  const starters = lineup.players.filter((player) => !/^b-|^i-/.test(player.cardIdentifier)).map((player) => get(player.playerId));
  const captain = lineup.players.find((player) => player.captain);
  if (!captain || starters.length !== 5) throw new Error("BasketNews lineup shape changed; refusing to store an incomplete round.");
  return {
    starters, captain: get(captain.playerId),
    sixth: lineup.players.filter((player) => player.cardIdentifier === "b-1").map((player) => get(player.playerId)),
    bench: lineup.players.filter((player) => /^b-/.test(player.cardIdentifier) && player.cardIdentifier !== "b-1").map((player) => get(player.playerId)),
    inactive: lineup.players.filter((player) => /^i-/.test(player.cardIdentifier)).map((player) => get(player.playerId)),
  };
}

export function basketNewsResult(lineup: BasketNewsLineup, score: BasketNewsScore, ids: ReadonlyMap<string, string>): BasketNewsRoundResult {
  const players = lineup.players.map((entry) => {
    const playerId = ids.get(entry.playerId);
    if (!playerId) throw new Error(`BasketNews player ${entry.playerId} has no mapping.`);
    const role = entry.cardIdentifier;
    const multiplier = role.startsWith("i-") ? 0 : role === "b-1" ? 1 : role.startsWith("b-") ? 0.5 : entry.captain ? 2 : 1;
    const rawHundredths = Math.round((entry.player.fantasy_pts ?? 0) * 100);
    return { playerId, rawHundredths, weightedHundredths: Math.round(rawHundredths * multiplier), role };
  });
  return {
    totalHundredths: Math.round(score.pointsGained * 100),
    calculatedHundredths: players.reduce((sum, player) => sum + player.weightedHundredths, 0),
    players,
  };
}

export type BasketNewsSyncOutcome = { status: "applied" | "blocked"; message: string; questions: readonly SyncQuestion[]; rounds: number };

/** Fetch and validate the entire source slice before writing any league data. */
export async function syncBasketNews(
  repo: BasketNewsRepository,
  leagueId: string,
  jobId: string,
  cookie: string | undefined,
  startRound: number,
  source: BasketNewsSource = basketNewsSource,
): Promise<BasketNewsSyncOutcome> {
  const local = await repo.load(leagueId);
  const reference = await source.teamReference(local.sourceTeamId);
  const candidates = await Promise.all(reference.fantasyLeagues.map(async ({ fantasyLeagueId }) => {
    try { return await source.league(fantasyLeagueId, reference.leagueId); } catch { return null; }
  }));
  const linked = candidates.filter((candidate): candidate is BasketNewsLeague => candidate !== null);
  const official = linked.find((candidate) => normalizeName(candidate.title) === normalizeName(local.name)) ?? (linked.length === 1 ? linked[0] : null);
  if (!official || official.pointCalcSystem !== "modern") throw new Error("The team URL does not identify a single Modern BasketNews Draft league with this name.");
  const teams = await source.teams(official.id);
  if (!teams.some((team) => team.id === local.sourceTeamId) || teams.length === 0 || new Set(teams.map((team) => team.id)).size !== teams.length || official.draft.picks.length !== teams.length * 13) {
    throw new Error("BasketNews league membership or draft changed; refusing a partial import.");
  }

  const rounds: { round: number; lineups: BasketNewsLineup[]; scores: (BasketNewsScore | null)[] }[] = [];
  for (let round = Math.max(1, startRound || local.latestRound + 1); round <= 40; round += 1) {
    const index = round - 1;
    const scores = await Promise.all(teams.map((team) => source.score(team.id, index, official.leagueId)));
    if (scores.some(Boolean) && scores.some((score) => !score)) throw new Error(`BasketNews round ${round} has only some team scores.`);
    if (scores.every((score) => score === null)) break;
    const lineups = await Promise.all(teams.map((team) => source.lineup(team.id, index, official.leagueId, cookie)));
    if (lineups.some((lineup) => lineup.players.length !== 13)) throw new Error(`BasketNews round ${round} has an incomplete lineup.`);
    rounds.push({ round, scores, lineups });
  }

  const picks = official.draft.picks;
  const byTeam = new Map<string, FantasyPlayer[]>();
  const sourcePlayers = new Map<string, SourcePlayer>();
  for (const pick of picks) {
    sourcePlayers.set(pick.playerId, pick.player);
    byTeam.set(pick.fantasyTeamId, [...(byTeam.get(pick.fantasyTeamId) ?? []), fantasyPlayer(pick.player)]);
  }
  for (const round of rounds) for (const lineup of round.lineups) for (const entry of lineup.players) {
    if (entry.player.team) sourcePlayers.set(entry.playerId, entry.player);
    else if (!sourcePlayers.has(entry.playerId)) sourcePlayers.set(entry.playerId, entry.player);
  }
  const rosters: FantasyTeam[] = teams.map((team) => ({ id: team.id, name: team.title, manager: "", players: byTeam.get(team.id) ?? [] }));
  const clubCodes = resolveClubs(rosters, local.pool);
  const mapped = new Map<string, string>();
  const links: { playerId: string; sourceId: string }[] = [];
  const questions: SyncQuestion[] = [];
  for (const [sourceId, sourcePlayer] of sourcePlayers) {
    const existing = local.pool.find((player) => player.basketnewsId === sourceId);
    const player = fantasyPlayer(sourcePlayer);
    const match = existing ?? matchPlayer(player, clubCodes.get(player.club.id), local.pool);
    if (match) {
      mapped.set(sourceId, match.id);
      if (!existing) links.push({ playerId: match.id, sourceId });
      continue;
    }
    const surname = normalizeName(player.lastName);
    questions.push({
      kind: "player", fantasyPlayerId: sourceId, name: `${player.firstName} ${player.lastName}`,
      club: player.club.name, jersey: player.jersey, fantasyTeamName: teams.find((team) => byTeam.get(team.id)?.some((entry) => entry.id === sourceId))?.title ?? "BasketNews",
      choices: local.pool.filter((candidate) => candidate.nameNormalized.includes(surname)).slice(0, 20).map((candidate) => ({ id: candidate.id, label: playerLabel(candidate) })),
    });
  }
  if (questions.length) return { status: "blocked", message: `${questions.length} BasketNews player mapping question(s) need answers.`, questions, rounds: 0 };
  if (new Set(mapped.values()).size !== mapped.size) throw new Error("Two BasketNews players matched one local player; resolve their mappings before importing.");

  for (const round of rounds) for (const [index, lineup] of round.lineups.entries()) {
    slotsFor(lineup, mapped);
    const score = round.scores[index];
    if (!score) continue;
    const result = basketNewsResult(lineup, score, mapped);
    if (result.calculatedHundredths !== result.totalHundredths) {
      throw new Error(`BasketNews round ${round.round} team ${teams[index]!.title} does not add up to its official score.`);
    }
  }

  const firstPickOrder = picks.slice(0, teams.length).map((pick) => pick.fantasyTeamId);
  await repo.linkLeague(leagueId, official.id);
  const members = await repo.ensureMembers(leagueId, teams, local.sourceTeamId, local.commissioner, firstPickOrder);
  await repo.linkPlayers(links);
  const draftPicks = picks.map((pick) => ({ memberId: members.get(pick.fantasyTeamId)!.id, playerId: mapped.get(pick.playerId)! }));
  await repo.ensureDraft(leagueId, draftPicks, firstPickOrder.map((id) => members.get(id)!.id), new Date(official.draftDate ?? Date.now()));

  for (const round of rounds) {
    const target = new Map<string, string[]>();
    round.lineups.forEach((lineup, index) => target.set(members.get(teams[index]!.id)!.id, lineup.players.map((entry) => mapped.get(entry.playerId)!)));
    const plan = planSync({
      round: round.round,
      seats: await repo.seats(leagueId), target,
      teamName: (id) => [...members.values()].find((member) => member.id === id)?.name ?? id,
      playerName: (id) => local.pool.find((player) => player.id === id)?.name ?? id,
      source: "BasketNews",
    });
    await repo.apply(leagueId, plan.steps, new Date());
    for (const [index, lineup] of round.lineups.entries()) {
      const member = members.get(teams[index]!.id)!;
      const score = round.scores[index];
      await repo.writeRound(leagueId, local.season, round.round, member.id, slotsFor(lineup, mapped), score ? basketNewsResult(lineup, score, mapped) : null);
    }
    await repo.recompute(local.season, leagueId);
    if (round.scores.every((score) => score !== null)) await repo.progress(jobId, round.round + 1);
  }
  return { status: "applied", message: `Mirrored ${teams.length} teams, ${picks.length} draft picks and ${rounds.length} round(s).`, questions: [], rounds: rounds.length };
}
