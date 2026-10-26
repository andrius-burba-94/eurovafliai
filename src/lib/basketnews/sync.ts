import { linkSourcePlayers, type PoolPlayer, type SyncQuestion } from "@/lib/fantasy/match";
import type { FantasyPlayer } from "@/lib/fantasy/parse";
import { planSync, type SyncSeat, type SyncStep } from "@/lib/fantasy/plan";
import { freezeRoles, type FrozenRoles, type LineupRole, type LineupSlots, playerGameDays, ROLE_MULTIPLIERS } from "@/lib/lineups/lineup";
import { readDayAt, roundWindows } from "@/lib/fantasy/windows";
import { normalizeName } from "@/lib/rosters/normalize";
import { formatHundredths } from "@/lib/stats/scoring";
import type { Position } from "@/lib/engine";

import {
  BasketNewsSessionExpired, basketNewsPlayer,
  readBasketNewsLeague, readBasketNewsLeagueLineups, readBasketNewsLineup, readBasketNewsScore,
  readBasketNewsTeamReference, readBasketNewsTeams, readBasketNewsTransfers, readBasketNewsPlayerPool,
  type BasketNewsLeague, type BasketNewsLineup, type BasketNewsScore,
  type BasketNewsTeam, type BasketNewsSourcePlayer as SourcePlayer,
} from "./client";
import { planBasketNewsTransfers } from "./transfers";

/** The business flow knows persistence operations, never PocketBase or its query syntax. */
export interface BasketNewsRepository {
  load(leagueId: string): Promise<{
    name: string; season: string; commissioner: string; sourceTeamId: string;
    /** The first round not every team has a final result for. */
    firstOpenRound: number;
    /** The newest round with any stored lineup; rosters were mirrored up to it. */
    latestStoredRound: number;
    rosterRound: number;
    /** Each stored EuroLeague fixture: its round, clubs, tip-off and whether it has been played. */
    fixtures: readonly { round: number; played: boolean; localClub: string; roadClub: string; utcDate: string | null }[];
    pool: (PoolPlayer & { basketnewsId?: string; basketnewsPosition?: Position | "" })[];
  }>;
  resume(leagueId: string): Promise<void>;
  rememberPlayers(leagueId: string, season: string, players: readonly FantasyPlayer[]): Promise<void>;
  appliedEvents(leagueId: string, round: number): Promise<ReadonlySet<string>>;
  reconcile(leagueId: string, season: string, round: number, target: ReadonlyMap<string, readonly string[]>, steps: readonly SyncStep[], at: Date): Promise<void>;
  linkLeague(leagueId: string, sourceLeagueId: string): Promise<void>;
  ensureMembers(leagueId: string, teams: readonly BasketNewsTeam[], ownTeamId: string, commissioner: string, firstPickOrder: readonly string[]): Promise<ReadonlyMap<string, { id: string; name: string }>>;
  linkPlayers(links: readonly { playerId: string; sourceId: string; position: Position; updateId: boolean; updatePosition: boolean }[]): Promise<void>;
  ensureDraft(leagueId: string, picks: readonly { memberId: string; playerId: string }[], order: readonly string[], draftDate: Date): Promise<void>;
  seats(leagueId: string): Promise<SyncSeat[]>;
  apply(leagueId: string, steps: readonly SyncStep[], at: Date): Promise<void>;
  /** Each member's frozen roles for a round, as stored. */
  frozenRoles(leagueId: string, season: string, round: number): Promise<ReadonlyMap<string, FrozenRoles>>;
  writeRound(leagueId: string, season: string, round: number, memberId: string, slots: LineupSlots, result: BasketNewsRoundResult | null, freeze?: RoundFreeze): Promise<void>;
  recompute(season: string, leagueId: string): Promise<void>;
  progress(jobId: string, nextRound: number): Promise<void>;
}

/** What one read freezes: the players whose game day it reached. */
export type RoundFreeze = { readonly gameDays: ReadonlyMap<string, string>; readonly readDay: string; readonly at: string };

export type BasketNewsRoundResult = {
  /** Every EuroLeague game of the round was played when this was read. */
  readonly final: boolean;
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
  leagueLineups: typeof readBasketNewsLeagueLineups;
  transfers?: typeof readBasketNewsTransfers;
  playerPool?: typeof readBasketNewsPlayerPool;
}

export const basketNewsSource: BasketNewsSource = {
  teamReference: readBasketNewsTeamReference,
  league: readBasketNewsLeague,
  teams: readBasketNewsTeams,
  lineup: readBasketNewsLineup,
  score: readBasketNewsScore,
  leagueLineups: readBasketNewsLeagueLineups,
  transfers: readBasketNewsTransfers,
  playerPool: readBasketNewsPlayerPool,
};


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

/**
 * The round as BasketNews scored it. A player whose game day a read has
 * reached is weighed by the role he froze in (`roleFor`); anyone else by his
 * card now.
 */
export function basketNewsResult(
  lineup: BasketNewsLineup, score: BasketNewsScore, ids: ReadonlyMap<string, string>, final = true,
  roleFor: (playerId: string) => LineupRole | null = () => null,
): BasketNewsRoundResult {
  const players = lineup.players.map((entry) => {
    const playerId = ids.get(entry.playerId);
    if (!playerId) throw new Error(`BasketNews player ${entry.playerId} has no mapping.`);
    const role = entry.cardIdentifier;
    const frozen = roleFor(playerId);
    const multiplier = frozen ? ROLE_MULTIPLIERS[frozen] : role.startsWith("i-") ? 0 : role === "b-1" ? 1 : role.startsWith("b-") ? 0.5 : entry.captain ? 2 : 1;
    const rawHundredths = Math.round((entry.player.fantasy_pts ?? 0) * 100);
    return { playerId, rawHundredths, weightedHundredths: Math.round(rawHundredths * multiplier), role };
  });
  return {
    final,
    totalHundredths: Math.round(score.pointsGained * 100),
    calculatedHundredths: players.reduce((sum, player) => sum + player.weightedHundredths, 0),
    players,
  };
}

export type BasketNewsSyncOutcome = {
  status: "applied" | "blocked" | "failed"; message: string; questions: readonly SyncQuestion[]; rounds: number;
  /** Final rounds whose lineup does not rebuild the official score; the official score is stored. */
  warnings?: readonly string[];
};

/** Fetch and validate the entire source slice before writing any league data. */
export async function syncBasketNews(
  repo: BasketNewsRepository,
  leagueId: string,
  jobId: string,
  cookie: string | undefined,
  startRound: number,
  source: BasketNewsSource = basketNewsSource,
  now: Date = new Date(),
): Promise<BasketNewsSyncOutcome> {
  await repo.resume(leagueId);
  const local = await repo.load(leagueId);
  const warnings: string[] = [];
  const failures: string[] = [];
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
  type RoundRead = { round: number; final: boolean; lineups: BasketNewsLineup[]; scores: (BasketNewsScore | null)[]; rosterOnly?: boolean };
  const rounds: RoundRead[] = [];
  let current: RoundRead | null = null;
  try {
    const rows = await source.leagueLineups(official.id, official.leagueId);
    if (rows.length) {
      const round = rows[0]!.fantasyRound + 1;
      const byTeam = new Map(rows.map((row) => [row.fantasyTeamId, row]));
      if (byTeam.size !== teams.length || rows.some((row) => row.fantasyRound + 1 !== round) || teams.some((team) => byTeam.get(team.id)?.players.length !== 13)) {
        throw new Error("BasketNews league lineups disagree on the round or are incomplete; refusing a partial roster sync.");
      }
      current = { round, final: false, lineups: teams.map((team) => byTeam.get(team.id)!), scores: teams.map(() => null), rosterOnly: true };
    }
  } catch (error) { failures.push(`Rosters: ${(error as Error).message}`); }

  // A game postponed out of its round's freeze is not the round's, as
  // `roundWindows` already decides: it must not keep the round open for weeks.
  const windows = roundWindows(local.fixtures);
  const counted = local.fixtures.filter((game) => windows.find((window) => window.round === game.round)?.tips.includes(Date.parse(game.utcDate ?? "")) ?? true);
  const isFinal = (round: number) => counted.every((game) => game.round !== round || game.played);
  const unplayed = counted.filter((game) => !game.played).map((game) => game.round);
  const lastReadable = unplayed.length ? Math.min(...unplayed) : 0;
  const first = Math.max(1, startRound ? Math.min(startRound, local.firstOpenRound) : local.firstOpenRound);
  for (let round = first; round <= 40; round += 1) {
    try {
      const index = round - 1;
      const scores = await Promise.all(teams.map((team) => source.score(team.id, index, official.leagueId)));
      const final = scores.some(Boolean) && isFinal(round);
      if (final && scores.some((score) => !score)) throw new Error(`BasketNews round ${round} has only some team scores.`);
      if (scores.every((score) => score === null) && round > lastReadable) break;
      let lineups: BasketNewsLineup[];
      try {
        if (!cookie) throw new BasketNewsSessionExpired();
        lineups = await Promise.all(teams.map((team) => source.lineup(team.id, index, official.leagueId, cookie)));
      } catch (error) {
        if (error instanceof BasketNewsSessionExpired || scores.some(Boolean)) throw error;
        break;
      }
      if (lineups.some((lineup) => lineup.players.length !== 13)) {
        if (scores.some(Boolean)) throw new Error(`BasketNews round ${round} has an incomplete lineup.`);
        break;
      }
      rounds.push({ round, final, scores, lineups });
    } catch (error) {
      failures.push(`Lineups round ${round}: ${(error as Error).message}`);
      // A private session failure affects every historical lineup. The public
      // roster above is independent and can still be applied.
      if (error instanceof BasketNewsSessionExpired) break;
      if (round >= Math.max(lastReadable, current?.round ?? 0)) break;
    }
  }
  if (current && !rounds.some((row) => row.round === current!.round)) rounds.push(current);
  rounds.sort((a, b) => a.round - b.round);

  const picks = official.draft.picks;
  const sourcePlayers = new Map<string, SourcePlayer>();
  for (const pick of picks) sourcePlayers.set(pick.playerId, pick.player);
  for (const round of [...rounds, ...(current ? [current] : [])]) for (const lineup of round.lineups) for (const entry of lineup.players) {
    if (entry.player.team || !sourcePlayers.has(entry.playerId)) sourcePlayers.set(entry.playerId, entry.player);
  }
  let extraMetadata: readonly FantasyPlayer[] = [];
  if ([...sourcePlayers.values()].some((player) => !player.team) && source.playerPool) {
    try { extraMetadata = await source.playerPool(official.leagueId); }
    catch (error) { warnings.push(`Player metadata: ${(error as Error).message}`); }
  }
  const linkedRows = new Map(local.pool.filter((row) => row.basketnewsId).map((row) => [row.basketnewsId!, row]));
  const teamOf = (sourceId: string) =>
    teams.find((team, index) => rounds.some((round) => round.lineups[index]?.players.some((entry) => entry.playerId === sourceId)))?.title ?? "BasketNews";
  const read: { player: FantasyPlayer; teamName: string }[] = [];
  for (const [sourceId, sourcePlayer] of sourcePlayers) {
    const player = sourcePlayer.team ? basketNewsPlayer(sourcePlayer) : extraMetadata.find((row) => row.id === sourceId);
    if (player) read.push({ player, teamName: teamOf(sourceId) });
    else if (!linkedRows.has(sourceId)) failures.push(`Player ${sourceId}: historical lineup has no club or position; current rosters continue independently.`);
  }
  const linking = linkSourcePlayers({ read, pool: local.pool, idOf: (row) => row.basketnewsId ?? "" });
  const { mapped, questions } = linking;
  for (const sourceId of sourcePlayers.keys()) if (linkedRows.has(sourceId)) mapped.set(sourceId, linkedRows.get(sourceId)!.id);
  const fresh = new Set(linking.links.map((link) => link.sourceId));
  const links = read.flatMap(({ player }) => {
    const playerId = mapped.get(player.id);
    const updatePosition = !local.pool.find((row) => row.id === playerId)?.basketnewsPosition;
    return playerId && (fresh.has(player.id) || updatePosition)
      ? [{ playerId, sourceId: player.id, position: player.position, updateId: fresh.has(player.id), updatePosition }]
      : [];
  });
  await repo.rememberPlayers(leagueId, local.season, read.flatMap(({ player }) => mapped.has(player.id) ? [] : [player]));
  if (picks.some((pick) => !mapped.has(pick.playerId))) {
    return { status: "blocked", message: `${questions.length} BasketNews player mapping question(s) need answers.`, questions, rounds: 0, warnings: failures };
  }
  const firstPickOrder = picks.slice(0, teams.length).map((pick) => pick.fantasyTeamId);
  if (rounds.length === 0 && failures.length) throw new Error(failures.join(" "));
  await repo.linkLeague(leagueId, official.id);
  const members = await repo.ensureMembers(leagueId, teams, local.sourceTeamId, local.commissioner, firstPickOrder);
  await repo.linkPlayers(links);
  const draftPicks = picks.map((pick) => ({ memberId: members.get(pick.fantasyTeamId)!.id, playerId: mapped.get(pick.playerId)! }));
  await repo.ensureDraft(leagueId, draftPicks, firstPickOrder.map((id) => members.get(id)!.id), new Date(official.draftDate ?? now));

  const clubOf = new Map(local.pool.map((player) => [player.id, player.clubCode]));
  let rosterRound = local.rosterRound;
  let completed = 0;
  let historyGap = false;
  let nextRound = first;
  const validRounds: typeof rounds = rounds.filter((round) => {
    if (round.lineups.some((lineup) => lineup.players.some((entry) => !mapped.has(entry.playerId)))) return false;
    try { for (const lineup of round.lineups) slotsFor(lineup, mapped); return true; }
    catch (error) { failures.push(`Lineups round ${round.round}: ${(error as Error).message}`); return false; }
  });
  const rosterReads = current ? [...rounds.filter((round) => round.round !== current!.round), current].sort((a, b) => a.round - b.round) : rounds;
  for (const round of rosterReads) {
    if (round.lineups.some((lineup) => lineup.players.some((entry) => !mapped.has(entry.playerId)))) { historyGap = true; continue; }
    try {
      for (const lineup of round.lineups) slotsFor(lineup, mapped);
    } catch (error) { failures.push(`Lineups round ${round.round}: ${(error as Error).message}`); historyGap = true; continue; }
    if (round.round >= rosterRound) {
      const target = new Map<string, string[]>();
      round.lineups.forEach((lineup, index) => target.set(members.get(teams[index]!.id)!.id, lineup.players.map((entry) => mapped.get(entry.playerId)!)));
      const seats = await repo.seats(leagueId);
      const input = { round: round.round, seats, target,
        teamName: (id: string) => [...members.values()].find((member) => member.id === id)?.name ?? id,
        playerName: (id: string) => local.pool.find((player) => player.id === id)?.name ?? id, source: "BasketNews" };
      let steps = planSync(input).steps;
      if (source.transfers) {
        try {
          const events = await source.transfers(official.id, round.round - 1);
          const eventIds = new Set(events.flatMap((event) => [...event.offer.players, ...event.request.players].map((entry) => entry.playerId)));
          // Intermediate players may not be on either roster snapshot. Resolve
          // them from the public pool before deciding whether the log is usable.
          if ([...eventIds].some((id) => !mapped.has(id)) && source.playerPool) {
            const pool = await source.playerPool(official.leagueId);
            const taken = new Set(mapped.values());
            const between = linkSourcePlayers({
              read: pool.filter((row) => eventIds.has(row.id) && !mapped.has(row.id)).map((player) => ({ player, teamName: "" })),
              pool: local.pool.filter((row) => !taken.has(row.id)), idOf: (row) => row.basketnewsId ?? "",
            });
            for (const [sourceId, playerId] of between.mapped) mapped.set(sourceId, playerId);
          }
          const exact = planBasketNewsTransfers({ ...input, events, memberOf: new Map([...members].map(([sourceId, member]) => [sourceId, member.id])), playerOf: mapped, appliedIds: await repo.appliedEvents(leagueId, round.round) });
          if (exact) steps = exact;
          else warnings.push(`Round ${round.round}: transfer log does not explain the official rosters; snapshot reconciliation used, exact trade history needs reconciliation.`);
        } catch (error) { warnings.push(`Round ${round.round}: transfer log unavailable; snapshot reconciliation used, exact trade history needs reconciliation. ${(error as Error).message}`); }
      }
      await repo.reconcile(leagueId, local.season, round.round, target, steps, now);
      rosterRound = round.round;
    }
  }
  for (const round of validRounds) {
    try {
      const readDay = readDayAt(now.getTime(), windows.find((window) => window.round === round.round));
      const freeze = readDay ? { gameDays: playerGameDays({ fixtures: local.fixtures, round: round.round, clubOf }), readDay, at: now.toISOString() } : undefined;
      const stored = freeze ? await repo.frozenRoles(leagueId, local.season, round.round) : new Map<string, FrozenRoles>();
      for (const [index, lineup] of round.lineups.entries()) {
        const member = members.get(teams[index]!.id)!;
        const score = round.scores[index];
        const slots = slotsFor(lineup, mapped);
        const roles = freeze ? freezeRoles({ previous: stored.get(member.id), slots, ...freeze }) : (stored.get(member.id) ?? {});
        const result = score ? basketNewsResult(lineup, score, mapped, round.final, (playerId) => roles[playerId]?.role ?? null) : null;
        if (result && round.final && result.calculatedHundredths !== result.totalHundredths) warnings.push(`Round ${round.round}: ${teams[index]!.title} adds up to ${formatHundredths(result.calculatedHundredths)} from its lineup, not the official ${formatHundredths(result.totalHundredths)}; the official score is kept.`);
        await repo.writeRound(leagueId, local.season, round.round, member.id, slots, result, freeze);
      }
      await repo.recompute(local.season, leagueId);
      if (round.final && !historyGap && round.round === nextRound) {
        nextRound = round.round + 1;
        await repo.progress(jobId, nextRound);
      }
      completed += 1;
    } catch (error) {
      historyGap = true;
      failures.push(`Lineups round ${round.round}: ${(error as Error).message}`);
    }
  }
  const status = questions.length ? "blocked" : failures.length ? "failed" : "applied";
  const message = [`Rosters: through round ${rosterRound}.`, `Mirrored ${teams.length} teams, ${picks.length} draft picks and ${completed} round(s).`,
    questions.length ? `${questions.length} player(s) await mapping or source approval; official rosters are checked every six hours.` : "",
    ...failures, ...warnings].filter(Boolean).join(" ");
  return { status, message, questions, rounds: completed, warnings: [...failures, ...warnings] };
}
