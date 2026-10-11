import { difficultyOf } from "@/lib/fixtures/schedule";
import {
  resolveLineups,
  rolesFromSlots,
  ROLE_MULTIPLIERS,
  type LineupRole,
  type LineupSource,
} from "@/lib/lineups/lineup";
import { coversRound } from "@/lib/memberships/from";
import { groupTransactionHistory } from "@/lib/memberships/history";
import { impactForMember, type ImpactLine, type ImpactTransaction } from "@/lib/stats/impact";
import { weighHundredths } from "@/lib/stats/scoring";
import type { RoundSnapshot } from "@/lib/stats/standings";

import type { FactsGame, FactsPlayer, RoundFactsInput } from "./round-facts";

/**
 * One finished round, measured: every player's night in the league's
 * ruleset, who captained whom, every deal's swing — 7.3 A, lifted out of the
 * round sheet so the briefs read the same figures it prints. Pure. It
 * decides nothing about what is worth saying; the sheets built on it do.
 */

/** Earlier games this season before the season's own average is trusted. */
export const SEASON_GAMES = 3;
/** Last season stands in only on a real sample. */
export const LAST_SEASON_GAMES = 10;
/** Under: an average worth missing (tenths), a drop this big, at most half of it. */
export const UNDER_BASIS = 100;
export const UNDER_BY = -800;
export const UNDER_RATIO = 0.5;

export const STARTING_ROLES: readonly LineupRole[] = ["captain", "starter", "sixth"];

export type Basis = {
  readonly tenths: number;
  readonly games: number;
  readonly source: "this season" | "last season";
  readonly minutes: number | null;
};

export type Night = {
  readonly playerId: string;
  readonly ownerId: string | null;
  readonly role: LineupRole | null;
  readonly raw: number;
  /** Null for a free agent: nobody counted him. */
  readonly counted: number | null;
  readonly games: readonly FactsGame[];
  readonly played: boolean;
  readonly basis: Basis | null;
  /** Night minus his average, hundredths; null without an average. */
  readonly change: number | null;
};

export type Captaincy = {
  readonly memberId: string;
  readonly captain: Night;
  /** The member's best other starter or sixth man. */
  readonly best: Night | null;
  /** Hundredths the best other starter scored over the captain, raw. */
  readonly regret: number;
  readonly hit: boolean;
};

export type DealSide = {
  readonly memberId: string;
  readonly inIds: readonly string[];
  readonly outIds: readonly string[];
  /** Hundredths of players in minus players out, this round. */
  readonly round: number;
  /** The same since the deal, through this round. */
  readonly toDate: number;
};

export type Deal = { readonly kind: string; readonly fromRound: number; readonly sides: readonly DealSide[] };

export type NextRun = { easy: number; even: number; hard: number; unknown: number; idle: number };

export type RoundAnalysis = {
  readonly round: number;
  readonly basketNews: boolean;
  /** Snapshots through this round, oldest first. */
  readonly snapshots: readonly RoundSnapshot[];
  readonly current: RoundSnapshot;
  readonly previous: RoundSnapshot | null;
  readonly memberIds: readonly string[];
  readonly teamNames: Readonly<Record<string, string>>;
  readonly playerById: ReadonlyMap<string, FactsPlayer>;
  readonly sourceOf: ReadonlyMap<string, LineupSource>;
  readonly nightOf: (playerId: string) => Night;
  /** Every player who had a line this round or was owned in it, by id. */
  readonly all: readonly Night[];
  readonly rostered: readonly Night[];
  readonly gamesBy: ReadonlyMap<string, readonly FactsGame[]>;
  readonly roundGames: RoundFactsInput["fixtures"];
  readonly clubOf: (playerId: string) => string;
  readonly clubPlayed: (club: string) => boolean;
  /** A regular who fell well short of his own average (the round sheet's underperformer). */
  readonly isUnder: (entry: Night) => boolean;
  readonly captaincies: readonly Captaincy[];
  /** Every deal made through this round, newest first. */
  readonly deals: readonly Deal[];
  /** Next round's fixtures for a member's current players; null when there is no next round. */
  readonly nextFor: (memberId: string) => { squad: string[]; counts: NextRun } | null;
  /** Today's flag, with the date of the latest report behind it. */
  readonly availability: (playerId: string) => string;
};

export type RoundAnalysisResult =
  | { readonly ok: true; readonly analysis: RoundAnalysis }
  | { readonly ok: false; readonly reason: string };

export const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const minutes = (seconds: number) => Math.round(seconds / 60);

export function analyseRound(input: RoundFactsInput): RoundAnalysisResult {
  const R = input.round;
  const snaps = [...input.snapshots].filter((snap) => snap.round <= R).sort((a, b) => a.round - b.round);
  const current = snaps.find((snap) => snap.round === R);
  if (!current) return { ok: false, reason: `round ${R} has no standings snapshot` };
  if (current.table.length === 0 || Math.max(...current.table.map((row) => row.roundHundredths)) <= 0) {
    return { ok: false, reason: `nobody scored in round ${R}` };
  }

  const memberIds = input.members.map((member) => member.id).sort(byId);
  const teamNames = Object.fromEntries(input.members.map((member) => [member.id, member.teamName]));
  const playerById = new Map(input.players.map((player) => [player.id, player]));

  // Who owned whom this round; overlapping windows go to the lowest id, as the recap does.
  const ownerOf = new Map<string, string>();
  for (const window of [...input.windows].sort((a, b) => byId(a.memberId, b.memberId))) {
    if (coversRound(window, R) && !ownerOf.has(window.playerId)) ownerOf.set(window.playerId, window.memberId);
  }

  const resolved = resolveLineups({ recorded: input.lineups, rounds: [R], memberIds });
  const sourceOf = new Map<string, LineupSource>(resolved.map((row) => [row.memberId, row.source]));
  const rolesOf = new Map(resolved.map((row) => [row.memberId, row.slots ? rolesFromSlots(row.slots) : null]));
  const captainOf = new Map(resolved.flatMap((row) => (row.slots ? [[row.memberId, row.slots.captain] as const] : [])));
  // BasketNews's own published value wins wherever a lineup recorded one, in
  // every round — the rule `mergeBasketNewsLines` applies for the trades page.
  const officialOf = new Map<string, { rawHundredths: number; weightedHundredths: number }>();
  for (const result of input.official) {
    if (result.round > R) continue;
    for (const player of result.players) officialOf.set(`${result.round}|${player.playerId}`, player);
  }

  const basketNews = input.ruleset === "basketnews";
  const valueOf = (game: FactsGame) => (basketNews ? game.basketNewsHundredths : game.fantasyTenths * 10);

  const gamesBy = new Map<string, FactsGame[]>();
  for (const game of input.games) {
    if (game.round > R) continue;
    gamesBy.set(game.player, [...(gamesBy.get(game.player) ?? []), game]);
  }
  /** A player's raw round, hundredths, in the league's ruleset. */
  const roundValue = (playerId: string, round: number, games: readonly FactsGame[]) =>
    officialOf.get(`${round}|${playerId}`)?.rawHundredths ?? games.reduce((sum, game) => sum + valueOf(game), 0);

  const basisOf = (playerId: string): Basis | null => {
    const before = (gamesBy.get(playerId) ?? []).filter((game) => game.round < R && game.seconds > 0);
    const rounds = [...new Set(before.map((game) => game.round))];
    if (rounds.length >= SEASON_GAMES) {
      const total = rounds.reduce(
        (sum, round) => sum + roundValue(playerId, round, before.filter((game) => game.round === round)),
        0,
      );
      const seconds = before.reduce((sum, game) => sum + game.seconds, 0);
      return {
        tenths: Math.round(total / rounds.length / 10),
        games: rounds.length,
        source: "this season",
        minutes: minutes(seconds / before.length),
      };
    }
    const player = playerById.get(playerId);
    if (!basketNews && player && player.prevSeasonGames >= LAST_SEASON_GAMES && player.prevSeasonFantasyTenths > 0) {
      return { tenths: player.prevSeasonFantasyTenths, games: player.prevSeasonGames, source: "last season", minutes: null };
    }
    return null;
  };

  const nights = new Map<string, Night>();
  const nightOf = (playerId: string): Night => {
    const known = nights.get(playerId);
    if (known) return known;
    const games = (gamesBy.get(playerId) ?? []).filter((game) => game.round === R);
    const ownerId = ownerOf.get(playerId) ?? null;
    const role = ownerId ? (rolesOf.get(ownerId)?.get(playerId) ?? null) : null;
    const official = officialOf.get(`${R}|${playerId}`);
    const raw = roundValue(playerId, R, games);
    const multiplier = role ? ROLE_MULTIPLIERS[role] : 1;
    const counted =
      ownerId === null
        ? null
        : (official?.weightedHundredths ??
          (basketNews
            ? Math.round(raw * multiplier)
            : weighHundredths(games.reduce((sum, game) => sum + game.fantasyTenths, 0), multiplier)));
    const basis = basisOf(playerId);
    const result: Night = {
      playerId,
      ownerId,
      role,
      raw,
      counted,
      games,
      played: games.some((game) => game.seconds > 0),
      basis,
      change: basis ? raw - basis.tenths * 10 : null,
    };
    nights.set(playerId, result);
    return result;
  };

  const roundPlayers = [...new Set([...input.games.filter((game) => game.round === R).map((game) => game.player), ...ownerOf.keys()])].sort(byId);
  const all = roundPlayers.map(nightOf);
  const rostered = all.filter((entry) => entry.ownerId !== null);

  const isUnder = (entry: Night) => {
    if (!entry.basis || entry.change === null || !entry.played) return false;
    // No lineup means everyone counted in full, so only a role that sat him
    // (bench, inactive) disqualifies; the basis below keeps it to regulars.
    if (entry.role && !STARTING_ROLES.includes(entry.role)) return false;
    return entry.basis.tenths >= UNDER_BASIS && entry.change <= UNDER_BY && entry.raw <= entry.basis.tenths * 10 * UNDER_RATIO;
  };

  const roundGames = input.fixtures.filter((fixture) => fixture.round === R);
  const clubOf = (playerId: string) => {
    const latest = [...(gamesBy.get(playerId) ?? [])].sort((a, b) => b.round - a.round || b.gameCode - a.gameCode)[0];
    return latest?.clubCode ?? playerById.get(playerId)?.clubCode ?? "";
  };
  const clubPlayed = (club: string) =>
    roundGames.some((fixture) => fixture.played && (fixture.localClub === club || fixture.roadClub === club));

  const captaincies: Captaincy[] = memberIds.flatMap((memberId) => {
    const captainId = captainOf.get(memberId);
    if (!captainId) return [];
    const captain = nightOf(captainId);
    const others = rostered.filter(
      (entry) => entry.ownerId === memberId && entry.playerId !== captainId && (entry.role === "starter" || entry.role === "sixth"),
    );
    const best = [...others].sort((a, b) => b.raw - a.raw || byId(a.playerId, b.playerId))[0] ?? null;
    const regret = best ? best.raw - captain.raw : 0;
    const teamTop = rostered.filter((entry) => entry.ownerId === memberId).every((entry) => entry.raw <= captain.raw);
    return [{ memberId, captain, best, regret, hit: teamTop && captain.raw > 0 }];
  });

  // ---- deals ---------------------------------------------------------------
  const impactLines: ImpactLine[] = [];
  for (const [playerId, games] of gamesBy) {
    for (const round of new Set(games.map((game) => game.round))) {
      const value = roundValue(playerId, round, games.filter((game) => game.round === round));
      impactLines.push({ playerId, round, fantasyTenths: value / 10, pir: 0 });
    }
  }
  const rows = [...input.transactions].sort(
    (a, b) => (b.date ?? "").localeCompare(a.date ?? "") || byId(b.id, a.id),
  );
  const idMap = (raw: unknown, memberId: string): string[] => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const ids = (raw as Record<string, unknown>)[memberId];
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
  };
  const deals: Deal[] = groupTransactionHistory(rows).flatMap((event) => {
    const first = event.rows[0]!;
    if (first.from_round > R) return [];
    const transactions: ImpactTransaction[] = event.rows.flatMap((row) =>
      row.type === "trade" || row.type === "add" || row.type === "drop"
        ? [
            {
              id: row.id,
              type: row.type,
              fromRound: row.from_round,
              playersIn: Object.fromEntries(Object.keys((row.players_in as object) ?? {}).map((id) => [id, idMap(row.players_in, id)])),
              playersOut: Object.fromEntries(Object.keys((row.players_out as object) ?? {}).map((id) => [id, idMap(row.players_out, id)])),
            },
          ]
        : [],
    );
    const sideIds = [...new Set(transactions.flatMap((tx) => [...Object.keys(tx.playersIn), ...Object.keys(tx.playersOut)]))].sort(byId);
    const sides = sideIds.map((memberId): DealSide => {
      const scored = impactForMember(memberId, transactions, impactLines);
      return {
        memberId,
        inIds: transactions.flatMap((tx) => tx.playersIn[memberId] ?? []),
        outIds: transactions.flatMap((tx) => tx.playersOut[memberId] ?? []),
        round: Math.round(scored.reduce((sum, deal) => sum + (deal.byRound.find((row) => row.round === R)?.deltaTenths ?? 0), 0) * 10),
        toDate: Math.round(scored.reduce((sum, deal) => sum + deal.deltaTenths, 0) * 10),
      };
    });
    const kind = event.swap ? "swap" : event.exchange ? "exchange" : first.type;
    return sides.length > 0 ? [{ kind, fromRound: first.from_round, sides }] : [];
  });

  // ---- next round ------------------------------------------------------------
  // The flag is raised by the scraper and cleared only by a person, so an
  // old one can outlive the injury: the report's date goes with it.
  const availability = (playerId: string) => {
    const status = playerById.get(playerId)?.status ?? "";
    const latest = input.news
      .filter((item) => item.player === playerId && item.status !== "" && /^\d{4}-\d{2}-\d{2}$/.test(item.published))
      .map((item) => item.published)
      .sort()
      .at(-1);
    return latest ? `${status}, reported ${latest}` : `${status}, no report on file`;
  };
  const next = input.nextRound;
  const nextFor = (memberId: string) => {
    if (next === null) return null;
    const squad = [...new Set(input.windows.filter((window) => window.memberId === memberId && coversRound(window, next)).map((window) => window.playerId))].sort(byId);
    const counts: NextRun = { easy: 0, even: 0, hard: 0, unknown: 0, idle: 0 };
    for (const playerId of squad) {
      const club = playerById.get(playerId)?.clubCode ?? clubOf(playerId);
      const game = input.fixtures.find((fixture) => fixture.round === next && (fixture.localClub === club || fixture.roadClub === club));
      if (!game) counts.idle += 1;
      else counts[difficultyOf({ rows: input.fixtures, club, game }) ?? "unknown"] += 1;
    }
    return { squad, counts };
  };

  return {
    ok: true,
    analysis: {
      round: R,
      basketNews,
      snapshots: snaps,
      current,
      previous: snaps.filter((snap) => snap.round < R).at(-1) ?? null,
      memberIds,
      teamNames,
      playerById,
      sourceOf,
      nightOf,
      all,
      rostered,
      gamesBy,
      roundGames,
      clubOf,
      clubPlayed,
      isUnder,
      captaincies,
      deals,
      nextFor,
      availability,
    },
  };
}
