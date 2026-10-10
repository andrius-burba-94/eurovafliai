import type { Position } from "@/lib/engine";
import { difficultyOf, type ScheduleRow } from "@/lib/fixtures/schedule";
import {
  resolveLineups,
  rolesFromSlots,
  ROLE_MULTIPLIERS,
  type LineupRole,
  type LineupSource,
  type RecordedLineup,
} from "@/lib/lineups/lineup";
import { coversRound } from "@/lib/memberships/from";
import { groupTransactionHistory, type HistoryRow } from "@/lib/memberships/history";
import { displayName, surname } from "@/lib/players/name";
import { memberHonours } from "@/lib/season/badges";
import { movementOf, ordinal } from "@/lib/season/story";
import { impactForMember, type ImpactLine, type ImpactTransaction } from "@/lib/stats/impact";
import type { RecapWindow } from "@/lib/stats/recap";
import { formatHundredths, formatSignedHundredths, formatTenths, weighHundredths } from "@/lib/stats/scoring";
import type { RoundSnapshot } from "@/lib/stats/standings";

import { numbersIn } from "./facts";
import { assignTokens, type TokenRef } from "./tokens";

/**
 * One finished Euroleague round for one league, as facts a model can narrate —
 * slice 7.0.
 *
 * Everything a write-up may say is decided here, in tested code: who starred,
 * who beat his own average and by how much, who did not play, which deal
 * moved most, who climbed. The model gets the result as compact labelled
 * lines and turns it into prose; it never adds, ranks or judges. Three rules
 * shape every line:
 *
 * - **Nothing from after the round.** Averages are built from earlier rounds'
 *   lines, never from the projection cache, which already contains this round
 *   and every one since. Deals count through the round only. Today's injury
 *   flag appears only in the next-round section, and says it is today's.
 * - **No names.** Teams and players are tokens; clubs are their public codes.
 *   No league, team, user or player name, note, headline or id is written.
 * - **Integers until the last moment.** Team figures are the snapshot's
 *   hundredths, player figures are hundredths in both rulesets (a BasketNews
 *   tenth can be fractional), and the repo's formatters print them.
 */

export const ROUND_FACTS_VERSION = 1;

/** A star is a counted night; this many make the list. */
export const STARS = 5;
/** Beat his own average by at least this (hundredths) and by half again. */
export const OVER_BY = 1000;
export const OVER_RATIO = 1.5;
/** For an average at or below zero, a night this big is the bar instead. */
export const OVER_FLOOR = 1500;
/** Under: an average worth missing (tenths), a drop this big, at most half of it. */
export const UNDER_BASIS = 100;
export const UNDER_BY = -800;
export const UNDER_RATIO = 0.5;
/** Earlier games this season before the season's own average is trusted. */
export const SEASON_GAMES = 3;
/** Last season stands in only on a real sample. */
export const LAST_SEASON_GAMES = 10;
/** A free agent this high in the round's raw ranking is news. */
export const FREE_AGENT_TOP = 10;
/** A bench or inactive night this big (hundredths) is worth naming. */
export const WASTED_NIGHT = 1500;
/** Best starter over captain by this much (hundredths) is a captain flop. */
export const CAPTAIN_REGRET = 1000;
/** A start after this many bench games of the previous five, or the reverse. */
export const ROLE_SWITCH = 3;
/** How far back an injury report explains a missed game, in days. */
export const NEWS_DAYS = 14;
/** A table move worth its own label. */
export const MOVED_PLACES = 2;
const LIST = 3;

export type FactsRuleset = "euroleague" | "basketnews";

/** One stored box-score line, in the shape the sheet needs. */
export type FactsGame = {
  readonly player: string;
  readonly round: number;
  readonly gameCode: number;
  readonly clubCode: string;
  readonly teamScore: number;
  readonly opponentScore: number;
  readonly seconds: number;
  readonly points: number;
  readonly rebounds: number;
  readonly assists: number;
  readonly pir: number;
  /** EuroLeague fantasy points, tenths. */
  readonly fantasyTenths: number;
  /** BasketNews Modern from the feed, hundredths. */
  readonly basketNewsHundredths: number;
  readonly started: "yes" | "no" | "";
};

export type FactsPlayer = {
  readonly id: string;
  /** The stored name: used only to list what the prose must not spell out. */
  readonly name: string;
  /** His position in the league's own game (7.2 D), resolved by the reader. */
  readonly position: Position;
  readonly clubCode: string;
  /** Availability **now** (`injured`, `doubtful`, ...): never applied to a past round. */
  readonly status: string;
  readonly prevSeasonFantasyTenths: number;
  readonly prevSeasonGames: number;
};

export type FactsMember = {
  readonly id: string;
  readonly teamName: string;
  readonly userName: string;
};

/** BasketNews's own published round for one team. */
export type FactsOfficialRound = {
  readonly memberId: string;
  readonly round: number;
  readonly players: readonly { readonly playerId: string; readonly rawHundredths: number; readonly weightedHundredths: number }[];
};

export type FactsNews = {
  readonly player: string;
  readonly status: string;
  readonly bodyPart: string;
  /** `YYYY-MM-DD`, or empty. */
  readonly published: string;
};

export type RoundFactsInput = {
  readonly round: number;
  readonly ruleset: FactsRuleset;
  readonly leagueName: string;
  readonly members: readonly FactsMember[];
  /** Snapshots of completed rounds; later ones are ignored. */
  readonly snapshots: readonly RoundSnapshot[];
  readonly windows: readonly RecapWindow[];
  readonly lineups: readonly RecordedLineup[];
  readonly games: readonly FactsGame[];
  readonly official: readonly FactsOfficialRound[];
  readonly fixtures: readonly ScheduleRow[];
  readonly players: readonly FactsPlayer[];
  /** Transaction rows; `note` is read to group deals and never written out. */
  readonly transactions: readonly HistoryRow[];
  readonly news: readonly FactsNews[];
  /** The round after this one, when this is the latest finished round and another is scheduled. */
  readonly nextRound: number | null;
};

export type RoundFacts = {
  readonly version: number;
  readonly round: number;
  readonly text: string;
  readonly refs: Readonly<Record<string, TokenRef>>;
  /** Names the prose must not spell out. */
  readonly privateNames: readonly string[];
  readonly numbersByToken: ReadonlyMap<string, ReadonlySet<number>>;
  readonly sharedNumbers: ReadonlySet<number>;
};

export type RoundFactsResult = { readonly ok: true; readonly facts: RoundFacts } | { readonly ok: false; readonly reason: string };

type Basis = { readonly tenths: number; readonly games: number; readonly source: "this season" | "last season"; readonly minutes: number | null };

type Night = {
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

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const minutes = (seconds: number) => Math.round(seconds / 60);
const STARTING_ROLES: readonly LineupRole[] = ["captain", "starter", "sixth"];

export function buildRoundFacts(input: RoundFactsInput): RoundFactsResult {
  const R = input.round;
  const snaps = [...input.snapshots].filter((snap) => snap.round <= R).sort((a, b) => a.round - b.round);
  const current = snaps.find((snap) => snap.round === R);
  if (!current) return { ok: false, reason: `round ${R} has no standings snapshot` };
  const night = [...current.table].sort((a, b) => b.roundHundredths - a.roundHundredths || byId(a.memberId, b.memberId));
  if (night.length === 0 || night[0]!.roundHundredths <= 0) {
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

  // ---- labels -------------------------------------------------------------
  const stars = rostered
    .filter((entry) => (entry.counted ?? 0) > 0)
    .sort((a, b) => b.counted! - a.counted! || b.raw - a.raw || byId(a.playerId, b.playerId))
    .slice(0, STARS);

  const over = rostered
    .filter((entry) => {
      if (!entry.basis || entry.change === null || !entry.played) return false;
      const average = entry.basis.tenths * 10;
      return entry.change >= OVER_BY && (average > 0 ? entry.raw >= average * OVER_RATIO : entry.raw >= OVER_FLOOR);
    })
    .sort((a, b) => b.change! - a.change! || byId(a.playerId, b.playerId))
    .slice(0, LIST);

  const under = rostered
    .filter((entry) => {
      if (!entry.basis || entry.change === null || !entry.played) return false;
      // No lineup means everyone counted in full, so only a role that sat him
      // (bench, inactive) disqualifies; the basis below keeps it to regulars.
      if (entry.role && !STARTING_ROLES.includes(entry.role)) return false;
      return entry.basis.tenths >= UNDER_BASIS && entry.change <= UNDER_BY && entry.raw <= entry.basis.tenths * 10 * UNDER_RATIO;
    })
    .sort((a, b) => a.change! - b.change! || byId(a.playerId, b.playerId))
    .slice(0, LIST);

  const roundGames = input.fixtures.filter((fixture) => fixture.round === R);
  const lastTip = roundGames.map((fixture) => (fixture.utcDate ? Date.parse(fixture.utcDate) : Number.NaN)).filter(Number.isFinite);
  const lastTipAt = lastTip.length > 0 ? Math.max(...lastTip) : null;
  const clubOf = (playerId: string) => {
    const latest = [...(gamesBy.get(playerId) ?? [])].sort((a, b) => b.round - a.round || b.gameCode - a.gameCode)[0];
    return latest?.clubCode ?? playerById.get(playerId)?.clubCode ?? "";
  };
  const clubPlayed = (club: string) =>
    roundGames.some((fixture) => fixture.played && (fixture.localClub === club || fixture.roadClub === club));
  const reasonFor = (playerId: string): string | null => {
    if (lastTipAt === null) return null;
    const earliest = lastTipAt - NEWS_DAYS * 86_400_000;
    const report = input.news
      .filter((item) => item.player === playerId && item.status !== "")
      .map((item) => ({ item, at: Date.parse(`${item.published}T23:59:59Z`) }))
      .filter(({ at }) => Number.isFinite(at) && at >= earliest && at - 86_400_000 <= lastTipAt)
      .sort((a, b) => b.at - a.at)[0];
    if (!report) return null;
    return [report.item.status, report.item.bodyPart.toLowerCase()].filter(Boolean).join(", ");
  };

  const dnp = rostered
    .filter((entry) => {
      if (entry.played) return false;
      const regular = entry.role ? STARTING_ROLES.includes(entry.role) : (entry.basis?.tenths ?? 0) >= UNDER_BASIS;
      return regular && clubPlayed(clubOf(entry.playerId));
    })
    .sort((a, b) => (b.basis?.tenths ?? 0) - (a.basis?.tenths ?? 0) || byId(a.playerId, b.playerId))
    .slice(0, 8);

  const rawRank = [...all].sort((a, b) => b.raw - a.raw || byId(a.playerId, b.playerId));
  const freeAgents = rawRank
    .map((entry, index) => ({ entry, place: index + 1 }))
    .filter(({ entry, place }) => entry.ownerId === null && place <= FREE_AGENT_TOP && entry.raw > 0)
    .slice(0, LIST);

  const startersOf = (memberId: string) =>
    rostered.filter((entry) => entry.ownerId === memberId && (entry.role === "starter" || entry.role === "captain"));
  const benchNights = rostered
    .filter((entry) => {
      if (entry.role !== "bench" || entry.raw < WASTED_NIGHT) return false;
      const starters = startersOf(entry.ownerId!);
      return starters.length > 0 && entry.raw > Math.min(...starters.map((starter) => starter.raw));
    })
    .sort((a, b) => b.raw - a.raw || byId(a.playerId, b.playerId))
    .slice(0, LIST);
  const inactiveNights = rostered
    .filter((entry) => entry.role === "inactive" && entry.raw >= WASTED_NIGHT)
    .sort((a, b) => b.raw - a.raw || byId(a.playerId, b.playerId))
    .slice(0, LIST);

  type Captaincy = { memberId: string; captain: Night; best: Night | null; regret: number; hit: boolean };
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
  const flops = captaincies.filter((entry) => entry.regret >= CAPTAIN_REGRET).sort((a, b) => b.regret - a.regret).slice(0, LIST);

  const roleChanges = rostered
    .flatMap((entry) => {
      const game = entry.games.find((candidate) => candidate.started !== "");
      if (!game) return [];
      const before = (gamesBy.get(entry.playerId) ?? [])
        .filter((candidate) => candidate.round < R && candidate.started !== "")
        .sort((a, b) => b.round - a.round || b.gameCode - a.gameCode)
        .slice(0, 5);
      const bench = before.filter((candidate) => candidate.started === "no").length;
      const starts = before.length - bench;
      if (game.started === "yes" && bench >= ROLE_SWITCH) return [{ entry, into: true, of: before.length, count: bench }];
      if (game.started === "no" && starts >= ROLE_SWITCH) return [{ entry, into: false, of: before.length, count: starts }];
      return [];
    })
    .sort((a, b) => b.entry.raw - a.entry.raw || byId(a.entry.playerId, b.entry.playerId))
    .slice(0, LIST);

  // ---- table ---------------------------------------------------------------
  const previous = snaps.filter((snap) => snap.round < R).at(-1) ?? null;
  const tableSnaps = previous ? [previous, current] : [current];
  const movements = new Map(memberIds.map((memberId) => [memberId, movementOf(tableSnaps, memberId, teamNames)]));
  const order = [...memberIds].sort((a, b) => (movements.get(a)?.rank ?? 99) - (movements.get(b)?.rank ?? 99));
  const leaderBefore = previous
    ? [...memberIds].sort((a, b) => (movements.get(a)?.previousRank ?? 99) - (movements.get(b)?.previousRank ?? 99))[0]!
    : null;
  const lastBefore = previous
    ? [...memberIds].sort((a, b) => (movements.get(b)?.previousRank ?? 0) - (movements.get(a)?.previousRank ?? 0))[0]!
    : null;
  const honours = new Map(memberHonours(snaps).map((row) => [row.memberId, row]));

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
  type DealSide = { memberId: string; inIds: string[]; outIds: string[]; round: number; toDate: number };
  type Deal = { kind: string; fromRound: number; sides: DealSide[] };
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
  const newDeals = deals.filter((deal) => deal.fromRound === R).slice(0, 4);
  const swing = deals
    .flatMap((deal) => deal.sides.map((side) => ({ deal, side })))
    .filter(({ side }) => side.round !== 0)
    .sort((a, b) => Math.abs(b.side.round) - Math.abs(a.side.round) || byId(a.side.memberId, b.side.memberId))[0];

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
  const nextLines =
    next === null
      ? []
      : memberIds.map((memberId) => {
          const squad = [...new Set(input.windows.filter((window) => window.memberId === memberId && coversRound(window, next)).map((window) => window.playerId))].sort(byId);
          const counts = { easy: 0, even: 0, hard: 0, unknown: 0, idle: 0 };
          for (const playerId of squad) {
            const club = playerById.get(playerId)?.clubCode ?? clubOf(playerId);
            const game = input.fixtures.find((fixture) => fixture.round === next && (fixture.localClub === club || fixture.roadClub === club));
            if (!game) counts.idle += 1;
            else counts[difficultyOf({ rows: input.fixtures, club, game }) ?? "unknown"] += 1;
          }
          const out = squad.filter((playerId) => ["injured", "doubtful"].includes(playerById.get(playerId)?.status ?? "")).slice(0, 2);
          return { memberId, counts, out };
        });

  // ---- tokens -----------------------------------------------------------------
  const mentioned = new Set<string>([
    ...stars.map((entry) => entry.playerId),
    ...over.map((entry) => entry.playerId),
    ...under.map((entry) => entry.playerId),
    ...dnp.map((entry) => entry.playerId),
    ...freeAgents.map(({ entry }) => entry.playerId),
    ...benchNights.map((entry) => entry.playerId),
    ...inactiveNights.map((entry) => entry.playerId),
    ...captaincies.flatMap((entry) => [entry.captain.playerId, ...(entry.best ? [entry.best.playerId] : [])]),
    ...roleChanges.map(({ entry }) => entry.playerId),
    ...[...newDeals, ...(swing ? [swing.deal] : [])].flatMap((deal) => deal.sides.flatMap((side) => [...side.inIds, ...side.outIds])),
    ...nextLines.flatMap((line) => line.out),
  ]);
  for (const memberId of memberIds) {
    const top = rostered.filter((entry) => entry.ownerId === memberId).sort((a, b) => (b.counted ?? 0) - (a.counted ?? 0) || byId(a.playerId, b.playerId))[0];
    if (top) mentioned.add(top.playerId);
  }
  const tokens = assignTokens(memberIds, mentioned);
  const T = (memberId: string) => tokens.member.get(memberId) ?? "@T?";
  const P = (playerId: string) => tokens.player.get(playerId) ?? "#P?";
  const h = formatHundredths;
  const signed = formatSignedHundredths;

  // ---- text ---------------------------------------------------------------
  const lines: string[] = [];
  const ruleset = basketNews
    ? "BasketNews fantasy points (BasketNews Modern scoring)"
    : "EuroLeague fantasy points (PIR, plus a tenth on a club win)";
  lines.push(`FACT SHEET · round report · version ${ROUND_FACTS_VERSION}`);
  lines.push(
    `META · Euroleague round ${R} · ${memberIds.length} teams · scoring: ${ruleset} · a lineup weighs each player: captain double, starters and sixth man in full, bench half, inactive nothing${previous ? "" : " · first counted round of the season"}`,
  );
  const provisional = memberIds.filter((memberId) => (sourceOf.get(memberId) ?? "absent") === "absent");
  if (provisional.length > 0) lines.push(`META · no lineup recorded, everyone counted in full: ${provisional.map(T).join(", ")}`);
  lines.push("Values are fantasy points unless marked PIR. raw = what a player scored; counted = what his lineup role made of it.");

  lines.push("", `NIGHT (each team's round, best first)`);
  for (const [index, row] of night.entries()) {
    const place = 1 + night.filter((other) => other.roundHundredths > row.roundHundredths).length;
    lines.push(`${T(row.memberId)} · ${ordinal(place)}${index === 0 ? " of the night" : ""} · ${h(row.roundHundredths)}`);
  }
  const top = night[0]!.roundHundredths;
  const tiedTop = night.filter((row) => row.roundHundredths === top).map((row) => row.memberId);
  const bottom = night.at(-1)!.roundHundredths;
  const average = Math.round(night.reduce((sum, row) => sum + row.roundHundredths, 0) / night.length);
  lines.push(
    [
      "NIGHT SUMMARY",
      tiedTop.length > 1
        ? `tied for 1st: ${tiedTop.map(T).join(", ")}`
        : night.length > 1
          ? `winner ${T(tiedTop[0]!)} by ${h(top - night[1]!.roundHundredths)}`
          : `winner ${T(tiedTop[0]!)}`,
      night.length > 1 && bottom < top ? `last ${night.filter((row) => row.roundHundredths === bottom).map((row) => T(row.memberId)).join(", ")}` : null,
      `average ${h(average)}`,
      `top to bottom ${h(top - bottom)}`,
    ]
      .filter(Boolean)
      .join(" · "),
  );

  lines.push("", `TABLE AFTER ROUND ${R} (season totals)`);
  for (const [index, memberId] of order.entries()) {
    const move = movements.get(memberId);
    if (!move) continue;
    const above = index > 0 ? order[index - 1]! : null;
    const aboveTotal = above ? (movements.get(above)?.totalHundredths ?? 0) : 0;
    const parts = [`${T(memberId)} · ${ordinal(move.rank)} · total ${h(move.totalHundredths)}`];
    if (move.previousRank !== null) {
      parts.push(move.moved > 0 ? `up ${move.moved} from ${ordinal(move.previousRank)}` : move.moved < 0 ? `down ${-move.moved} from ${ordinal(move.previousRank)}` : "same place");
    }
    if (move.passed.length > 0) parts.push(`passed ${move.passed.map(T).join(", ")}`);
    if (above) parts.push(`${h(aboveTotal - move.totalHundredths)} behind ${T(above)}`);
    if (move.gap > 0 && index > 1) parts.push(`${h(move.gap)} behind the leader`);
    lines.push(parts.join(" · "));
  }
  const leaderNow = order[0]!;
  const lastNow = order.at(-1)!;
  const tableSummary = [
    leaderBefore && leaderBefore !== leaderNow ? `new leader ${T(leaderNow)} (was ${T(leaderBefore)})` : `leader ${T(leaderNow)}`,
    order.length > 1 ? `lead ${h((movements.get(leaderNow)?.totalHundredths ?? 0) - (movements.get(order[1]!)?.totalHundredths ?? 0))}` : null,
    lastBefore && lastBefore !== lastNow ? `last place now ${T(lastNow)} (was ${T(lastBefore)})` : `last place ${T(lastNow)}`,
  ];
  lines.push(["TABLE SUMMARY", ...tableSummary.filter(Boolean)].join(" · "));

  lines.push("", "TEAMS");
  for (const memberId of memberIds) {
    const source = sourceOf.get(memberId) ?? "absent";
    const captaincy = captaincies.find((entry) => entry.memberId === memberId);
    const topScorer = rostered
      .filter((entry) => entry.ownerId === memberId)
      .sort((a, b) => (b.counted ?? 0) - (a.counted ?? 0) || byId(a.playerId, b.playerId))[0];
    const honour = honours.get(memberId);
    lines.push(
      [
        T(memberId),
        source === "absent" ? "no lineup, everyone in full" : source === "carried" ? "lineup carried from an earlier round" : "lineup set for this round",
        captaincy ? `captain ${P(captaincy.captain.playerId)} raw ${h(captaincy.captain.raw)}, counted ${h(captaincy.captain.counted ?? 0)}` : null,
        topScorer ? `top scorer ${P(topScorer.playerId)} counted ${h(topScorer.counted ?? 0)}` : null,
        honour ? `nights won ${honour.roundsWon} · last-place nights ${honour.spoons} · top-three streak ${honour.topThreeStreak}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    );
  }

  lines.push("", "PLAYERS");
  for (const playerId of [...mentioned].sort((a, b) => Number(P(a).slice(2)) - Number(P(b).slice(2)))) {
    lines.push(playerLine(nightOf(playerId), playerById.get(playerId), basketNews, input.fixtures, T, P));
  }

  lines.push("", "LABELS");
  if (stars.length > 0) lines.push(`STARS (by counted) · ${stars.map((entry) => `${P(entry.playerId)} ${h(entry.counted ?? 0)}`).join(" · ")}`);
  for (const entry of over) lines.push(`OVERPERFORMER · ${P(entry.playerId)} · ${signed(entry.change!)} on his average of ${formatTenths(entry.basis!.tenths)}`);
  for (const entry of under) lines.push(`UNDERPERFORMER · ${P(entry.playerId)} · ${signed(entry.change!)} on his average of ${formatTenths(entry.basis!.tenths)} · ${roleWords(entry.role)}`);
  for (const entry of dnp) {
    const reason = reasonFor(entry.playerId);
    lines.push(`DID NOT PLAY · ${P(entry.playerId)} · ${T(entry.ownerId!)} ${roleWords(entry.role)} · his club played${reason ? ` · reported ${reason}` : ""}`);
  }
  for (const { entry, place } of freeAgents) lines.push(`SURPRISE · free agent ${P(entry.playerId)} · ${ordinal(place)} best raw night of the round · owned by nobody`);
  for (const entry of benchNights) {
    lines.push(`SURPRISE · ${P(entry.playerId)} on ${T(entry.ownerId!)}'s bench · raw ${h(entry.raw)}, more than a starter · the bench half cost ${h(entry.raw - (entry.counted ?? 0))}`);
  }
  for (const entry of inactiveNights) lines.push(`SURPRISE · ${P(entry.playerId)} inactive for ${T(entry.ownerId!)} · raw ${h(entry.raw)} that counted nothing`);
  for (const entry of flops) {
    lines.push(`CAPTAIN FLOP · ${T(entry.memberId)} captained ${P(entry.captain.playerId)} (raw ${h(entry.captain.raw)}) while ${P(entry.best!.playerId)} scored raw ${h(entry.best!.raw)} · the armband cost ${h(entry.regret)}`);
  }
  for (const entry of captaincies.filter((captaincy) => captaincy.hit)) lines.push(`CAPTAIN HIT · ${T(entry.memberId)}'s captain ${P(entry.captain.playerId)} was the team's best night`);
  for (const { entry, into, of, count } of roleChanges) {
    lines.push(
      into
        ? `ROLE CHANGE · ${P(entry.playerId)} started after coming off the bench in ${count} of his previous ${of} games`
        : `ROLE CHANGE · ${P(entry.playerId)} came off the bench after starting ${count} of his previous ${of} games`,
    );
  }
  // Who passed whom is on every table line; a mover is a place change worth a sentence.
  for (const memberId of order) {
    const move = movements.get(memberId);
    if (move && Math.abs(move.moved) >= MOVED_PLACES) {
      lines.push(`MOVER · ${T(memberId)} · ${move.moved >= 0 ? "up" : "down"} ${Math.abs(move.moved)} to ${ordinal(move.rank)}`);
    }
  }

  if (newDeals.length > 0 || swing) lines.push("", "DEALS (fantasy points of players in minus players out)");
  for (const deal of newDeals) {
    lines.push(`NEW DEAL · ${dealLine(deal, T, P)}${swing?.deal === deal ? " · biggest swing of the round" : ""}`);
  }
  if (swing && !newDeals.includes(swing.deal)) lines.push(`BIGGEST SWING · ${dealLine(swing.deal, T, P)}`);

  if (next !== null && nextLines.length > 0) {
    lines.push("", `NEXT ROUND ${next} (fixtures of each team's current players; availability is today's)`);
    for (const line of nextLines) {
      const { easy, even, hard, unknown, idle } = line.counts;
      lines.push(
        [
          T(line.memberId),
          `${easy} easy, ${even} even, ${hard} hard${unknown > 0 ? `, ${unknown} not yet rated` : ""}${idle > 0 ? `, ${idle} without a game` : ""}`,
          line.out.length > 0 ? `unavailable now ${line.out.map((playerId) => `${P(playerId)} (${availability(playerId)})`).join(", ")}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      );
    }
  }

  const text = lines.join("\n");
  const numbersByToken = new Map<string, Set<number>>();
  const sharedNumbers = new Set<number>();
  for (const line of lines) {
    const found = [...line.matchAll(/(@T|#P)\d+/g)].map((match) => match[0]);
    const values = numbersIn(line);
    if (found.length === 0) for (const value of values) sharedNumbers.add(value);
    for (const token of found) {
      const set = numbersByToken.get(token) ?? new Set<number>();
      for (const value of values) set.add(value);
      numbersByToken.set(token, set);
    }
  }

  const privateNames = [
    input.leagueName,
    ...input.members.flatMap((member) => [member.teamName, member.userName]),
    ...[...mentioned].flatMap((playerId) => {
      const stored = playerById.get(playerId)?.name;
      return stored ? [displayName(stored), surname(stored)] : [];
    }),
  ].filter((name) => name.trim() !== "");

  return {
    ok: true,
    facts: {
      version: ROUND_FACTS_VERSION,
      round: R,
      text,
      refs: tokens.refs,
      privateNames: [...new Set(privateNames)],
      numbersByToken,
      sharedNumbers,
    },
  };
}

function roleWords(role: LineupRole | null): string {
  if (role === null) return "in full (no lineup)";
  return role === "sixth" ? "sixth man" : role;
}

function playerLine(
  entry: Night,
  player: FactsPlayer | undefined,
  basketNews: boolean,
  fixtures: readonly ScheduleRow[],
  T: (memberId: string) => string,
  P: (playerId: string) => string,
): string {
  const parts: string[] = [P(entry.playerId)];
  if (player) parts.push(player.position);
  const game = entry.games[0];
  const club = game?.clubCode ?? player?.clubCode ?? "";
  if (club) parts.push(club);
  parts.push(entry.ownerId ? `${T(entry.ownerId)} ${roleWords(entry.role)}` : "free agent");
  if (!entry.played) {
    parts.push(game ? "dressed, did not play" : "no game line");
  } else {
    parts.push(`raw ${formatHundredths(entry.raw)}`);
    if (entry.counted !== null) parts.push(`counted ${formatHundredths(entry.counted)}`);
    const totals = entry.games.reduce(
      (sum, line) => ({
        pir: sum.pir + line.pir,
        points: sum.points + line.points,
        rebounds: sum.rebounds + line.rebounds,
        assists: sum.assists + line.assists,
        seconds: sum.seconds + line.seconds,
      }),
      { pir: 0, points: 0, rebounds: 0, assists: 0, seconds: 0 },
    );
    parts.push(`${totals.pir} PIR`, `scored ${totals.points}, ${totals.rebounds} reb, ${totals.assists} ast`, `${minutes(totals.seconds)} min`);
    if (game?.started === "yes") parts.push("started");
    if (game?.started === "no") parts.push("off the bench");
  }
  if (game) {
    const fixture = fixtures.find((row) => row.gameCode === game.gameCode);
    const home = fixture ? fixture.localClub === game.clubCode : null;
    const opponent = fixture ? (home ? fixture.roadClub : fixture.localClub) : null;
    const result = game.teamScore > game.opponentScore ? "won" : "lost";
    parts.push(`club ${result} ${game.teamScore}-${game.opponentScore}${opponent ? ` ${home ? "at home v" : "away at"} ${opponent}` : ""}`);
  }
  if (entry.basis) {
    parts.push(
      `average before ${formatTenths(entry.basis.tenths)} over ${entry.basis.games} games (${entry.basis.source})${entry.basis.minutes !== null ? `, ${entry.basis.minutes} min` : ""}`,
    );
    if (entry.played && entry.change !== null) parts.push(`${formatSignedHundredths(entry.change)} on his average`);
  }
  return parts.join(" · ");
}

function dealLine(
  deal: { kind: string; fromRound: number; sides: readonly { memberId: string; inIds: readonly string[]; outIds: readonly string[]; round: number; toDate: number }[] },
  T: (memberId: string) => string,
  P: (playerId: string) => string,
): string {
  const kind = deal.kind === "exchange" ? "free-agent exchange" : deal.kind === "swap" ? "trade between teams" : deal.kind;
  const sides = deal.sides.map((side) => {
    const moves = [
      side.outIds.length > 0 ? `released ${side.outIds.map(P).join(", ")}` : null,
      side.inIds.length > 0 ? `signed ${side.inIds.map(P).join(", ")}` : null,
    ]
      .filter(Boolean)
      .join(", ");
    return `${T(side.memberId)} ${moves} · this round ${formatSignedHundredths(side.round)} · since round ${deal.fromRound} ${formatSignedHundredths(side.toDate)}`;
  });
  return `${kind} from round ${deal.fromRound} · ${sides.join(" · ")}`;
}
