import type { ScoutMove } from "@/lib/advisor/scout";
import { formatOutlook } from "@/lib/advisor/wire";
import { ROLE_MULTIPLIERS } from "@/lib/lineups/lineup";
import { displayName, surname } from "@/lib/players/name";
import { memberHonours, ON_FIRE_STREAK, type MemberHonours } from "@/lib/season/badges";
import { movementOf, neighboursOf, ordinal } from "@/lib/season/story";
import { formatHundredths, formatSignedHundredths, formatTenths } from "@/lib/stats/scoring";

import { analyseRound, byId, type Night } from "./round-analysis";
import { CAPTAIN_REGRET, MOVED_PLACES, type RoundFactsInput } from "./round-facts";
import { assignTokens, TOKEN_PATTERN, type TokenRef } from "./tokens";

/**
 * The briefs' fact sheet — slice 7.3 A. Pure.
 *
 * Everything a member's three lines may say, decided here: whether the night
 * was won, held or lost, the one or two things that decided it, who they are
 * racing, and what the next round holds. A shared header carries the table,
 * which the whole league can already see; each member's section carries the
 * rest, and that member's brief is guarded against the header and their own
 * section alone. That is what keeps a member's move worth making out of
 * everyone else's brief: it is in no other section.
 *
 * It reads the round sheet's measurements (`analyseRound`), so a brief and the
 * round write-up cannot disagree about a night.
 */

export const BRIEF_FACTS_VERSION = 2;
/** Deciders a section prints, biggest first. */
export const DECIDERS_SHOWN = 2;
/** Snapshots back the trend compares against. */
export const TREND_ROUNDS = 3;
/** The night splits into this many parts: the top one won, the bottom one lost. */
export const NIGHT_PARTS = 3;
/** A top-three streak is news only when somebody can miss the top three. */
export const STREAK_TEAMS = 4;

export type BriefFactsInput = RoundFactsInput & {
  /** Each member's moves worth making, best first, as the Scout works them out. Members with none may be left out. */
  readonly moves: readonly { readonly memberId: string; readonly moves: readonly ScoutMove[] }[];
};

export type BriefFacts = {
  readonly version: number;
  readonly round: number;
  /** The whole sheet: the header, then every member's section. */
  readonly text: string;
  /** What every brief may cite: the scoring and the table. */
  readonly header: string;
  readonly refs: Readonly<Record<string, TokenRef>>;
  /** Names the prose must not spell out. */
  readonly privateNames: readonly string[];
  readonly memberIds: readonly string[];
  /** One member's section, header excluded. */
  sectionFor(memberId: string): string;
  /** The tokens one member's brief may use: the header's and their own section's. */
  tokensFor(memberId: string): ReadonlySet<string>;
};

export type BriefFactsResult = { readonly ok: true; readonly facts: BriefFacts } | { readonly ok: false; readonly reason: string };

type Decider = {
  /** Signed hundredths: what it added to or cost the night. */
  readonly value: number;
  /** Ties on size go to the earlier kind. */
  readonly order: number;
  readonly players: readonly string[];
  readonly line: (P: (playerId: string) => string) => string;
};

/** Places at each end of the night: `k = max(1, floor(N/3))`. */
const endOf = (teams: number) => Math.max(1, Math.floor(teams / NIGHT_PARTS));

export type NightVerdict = "won" | "held" | "lost";

/** Won the top k places of the night, lost the bottom k. Recap's tag reads it too. */
export function nightVerdict(place: number, teams: number): NightVerdict {
  const k = endOf(teams);
  if (place <= k) return "won";
  if (place > teams - k) return "lost";
  return "held";
}

export function buildBriefFacts(input: BriefFactsInput): BriefFactsResult {
  const analysed = analyseRound(input);
  if (!analysed.ok) return analysed;
  const { round: R, basketNews, snapshots, current, memberIds: allIds, teamNames, playerById, sourceOf, rostered, clubOf, clubPlayed, isUnder, captaincies, deals, nextFor } =
    analysed.analysis;
  const inTable = new Set(current.table.map((row) => row.memberId));
  const memberIds = allIds.filter((memberId) => inTable.has(memberId));

  // Recap's ladder: ties go to the lower member id, so the brief and Recap agree on a place.
  const ladder = [...current.table].sort((a, b) => b.roundHundredths - a.roundHundredths || byId(a.memberId, b.memberId));
  const prior = snapshots.filter((snap) => snap.round < R);
  const honoursNow = new Map(memberHonours(snapshots).map((row) => [row.memberId, row]));
  const honoursBefore = new Map(memberHonours(prior).map((row) => [row.memberId, row]));

  const decidersOf = (memberId: string): Decider[] => {
    const own = rostered.filter((entry) => entry.ownerId === memberId);
    const lineup = (sourceOf.get(memberId) ?? "absent") !== "absent";
    const expected = (entry: Night) => (entry.basis ? entry.basis.tenths * 10 * (entry.role ? ROLE_MULTIPLIERS[entry.role] : 1) : null);
    const candidates: Decider[] = [];

    const captaincy = lineup ? captaincies.find((entry) => entry.memberId === memberId) : undefined;
    if (captaincy && captaincy.best && captaincy.regret >= CAPTAIN_REGRET) {
      const { captain, best, regret } = captaincy;
      candidates.push({
        value: -regret,
        order: 0,
        players: [captain.playerId, best.playerId],
        line: (P) => `captain flop · captained ${P(captain.playerId)} while ${P(best.playerId)} scored more`,
      });
    } else if (captaincy) {
      const { captain } = captaincy;
      candidates.push({
        value: (captain.counted ?? 0) - captain.raw,
        order: 0,
        players: [captain.playerId],
        line: (P) => `captain bonus · ${P(captain.playerId)}`,
      });
    }

    // A recorded captain's night is the captain decider's: never both slots for one night.
    const top = [...own].filter((entry) => entry.playerId !== captaincy?.captain.playerId).sort((a, b) => (b.counted ?? 0) - (a.counted ?? 0) || byId(a.playerId, b.playerId))[0];
    const topExpected = top ? expected(top) : null;
    if (top && top.basis && topExpected !== null && (top.counted ?? 0) > topExpected) {
      const basis = top.basis;
      candidates.push({
        value: (top.counted ?? 0) - topExpected,
        order: 1,
        players: [top.playerId],
        line: (P) => `top counted scorer · ${P(top.playerId)} counted ${formatHundredths(top.counted ?? 0)}, his average ${formatTenths(basis.tenths)}`,
      });
    }

    const under = own
      .filter(isUnder)
      .map((entry) => ({ entry, cost: (entry.counted ?? entry.raw) - (expected(entry) ?? 0) }))
      .sort((a, b) => a.cost - b.cost || byId(a.entry.playerId, b.entry.playerId))[0];
    if (under) {
      const { entry, cost } = under;
      candidates.push({
        value: cost,
        order: 2,
        players: [entry.playerId],
        line: (P) => `underperformer · ${P(entry.playerId)} ${formatHundredths(entry.raw)} on his average of ${formatTenths(entry.basis!.tenths)}`,
      });
    }

    const bench = lineup
      ? own
          .filter((entry) => entry.role === "bench" && entry.raw > (entry.counted ?? 0))
          .sort((a, b) => b.raw - (b.counted ?? 0) - (a.raw - (a.counted ?? 0)) || byId(a.playerId, b.playerId))[0]
      : undefined;
    if (bench) {
      candidates.push({
        value: (bench.counted ?? 0) - bench.raw,
        order: 3,
        players: [bench.playerId],
        line: (P) => `bench half lost · ${P(bench.playerId)} on the bench`,
      });
    }

    const missing = own.filter((entry) => !entry.played && (expected(entry) ?? 0) > 0);
    if (missing.length > 0) {
      const noGame = missing.filter((entry) => entry.games.length === 0 && !clubPlayed(clubOf(entry.playerId))).map((entry) => entry.playerId);
      const absent = missing.map((entry) => entry.playerId).filter((playerId) => !noGame.includes(playerId));
      candidates.push({
        value: -missing.reduce((sum, entry) => sum + (expected(entry) ?? 0), 0),
        order: 4,
        players: [...noGame, ...absent],
        line: (P) =>
          [
            "short-handed",
            noGame.length > 0 ? `no game ${noGame.map(P).join(", ")}` : null,
            absent.length > 0 ? `did not play ${absent.map(P).join(", ")}` : null,
            "their averages",
          ]
            .filter(Boolean)
            .join(" · "),
      });
    }

    const deal = deals
      .flatMap((entry) => entry.sides.filter((side) => side.memberId === memberId && side.round !== 0).map((side) => ({ deal: entry, side })))
      .sort((a, b) => Math.abs(b.side.round) - Math.abs(a.side.round))[0];
    if (deal) {
      const { side } = deal;
      candidates.push({
        value: side.round,
        order: 5,
        players: [...side.outIds, ...side.inIds],
        line: (P) =>
          [
            `deal from round ${deal.deal.fromRound}`,
            [side.outIds.length > 0 ? `released ${side.outIds.map(P).join(", ")}` : null, side.inIds.length > 0 ? `signed ${side.inIds.map(P).join(", ")}` : null]
              .filter(Boolean)
              .join(", "),
            "this round",
          ].join(" · "),
      });
    }

    return candidates
      .filter((candidate) => candidate.value !== 0)
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value) || a.order - b.order)
      .slice(0, DECIDERS_SHOWN);
  };

  const moveOf = new Map(input.moves.flatMap((entry) => (entry.moves[0] ? [[entry.memberId, entry.moves[0]] as const] : [])));

  type Plan = { memberId: string; deciders: Decider[]; move: ScoutMove | null };
  const plans: Plan[] = memberIds.map((memberId) => ({ memberId, deciders: decidersOf(memberId), move: moveOf.get(memberId) ?? null }));

  // ---- tokens -----------------------------------------------------------------
  const mentioned = plans.flatMap((plan) => [
    ...plan.deciders.flatMap((decider) => decider.players),
    ...(plan.move ? [plan.move.drop.id, plan.move.add.id] : []),
  ]);
  const tokens = assignTokens(memberIds, mentioned);
  const T = (memberId: string) => tokens.member.get(memberId) ?? "@T?";
  const P = (playerId: string) => tokens.player.get(playerId) ?? "#P?";
  const h = formatHundredths;

  // ---- header -------------------------------------------------------------------
  const unit = basketNews ? "BasketNews Modern points" : "EuroLeague fantasy points";
  const k = endOf(ladder.length);
  const order = [...memberIds].sort((a, b) => (movementOf(snapshots, a, teamNames)?.rank ?? 99) - (movementOf(snapshots, b, teamNames)?.rank ?? 99));
  const header = [
    `BRIEF FACTS · version ${BRIEF_FACTS_VERSION} · Euroleague round ${R} · ${memberIds.length} teams`,
    `META · values are ${unit}${basketNews ? ", with BasketNews's own captain and bench roles" : " (PIR, plus a tenth on a club win), with the lineup's captain double and bench half"}`,
    `META · a night is won from 1st to ${ordinal(k)} on the night, lost from ${ordinal(ladder.length - k + 1)} down, held in between`,
    "META · a decider is something that moved a team's night: + added to it, - cost it",
    "",
    `TABLE AFTER ROUND ${R} (season totals)`,
    ...order.map((memberId) => {
      const move = movementOf(snapshots, memberId, teamNames)!;
      const below = neighboursOf(snapshots, memberId, teamNames)?.below;
      return [`${T(memberId)} · ${ordinal(move.rank)} · total ${h(move.totalHundredths)}`, below ? `${h(below.lead)} ahead of ${T(below.memberId)}` : null]
        .filter(Boolean)
        .join(" · ");
    }),
  ].join("\n");

  // ---- sections -------------------------------------------------------------------
  const sections = new Map<string, string>();
  for (const plan of plans) {
    const { memberId } = plan;
    const lines = [`TEAM ${T(memberId)}`];
    const place = ladder.findIndex((row) => row.memberId === memberId) + 1;
    lines.push(`NIGHT · ${ordinal(place)} of ${ladder.length} on the night · ${h(ladder[place - 1]!.roundHundredths)} · ${nightVerdict(place, ladder.length)}`);
    for (const decider of plan.deciders) lines.push(`DECIDER · ${decider.line(P)} · ${formatSignedHundredths(decider.value)}`);

    const neighbours = neighboursOf(snapshots, memberId, teamNames);
    if (neighbours && (neighbours.above || neighbours.below)) {
      const { above, below } = neighbours;
      lines.push(
        [
          "STANDING",
          above ? `${h(above.gap)} behind ${T(above.memberId)}` : `leads ${T(below!.memberId)} by ${h(below!.lead)}`,
          above && below ? `${h(below.lead)} ahead of ${T(below.memberId)}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      );
    }

    const then = prior.length >= TREND_ROUNDS ? prior.at(-TREND_ROUNDS)! : null;
    const rankThen = then ? movementOf([then], memberId, teamNames)?.rank : undefined;
    const rankNow = movementOf(snapshots, memberId, teamNames)?.rank;
    if (then && rankThen !== undefined && rankNow !== undefined) {
      const moved = rankThen - rankNow;
      const word = moved >= MOVED_PLACES ? "rising" : moved <= -MOVED_PLACES ? "falling" : "steady";
      lines.push(`TREND · ${word} · ${ordinal(rankThen)} after round ${then.round}, ${ordinal(rankNow)} now`);
    }

    const honour = honourLine(honoursBefore.get(memberId), honoursNow.get(memberId), ladder.length);
    if (honour) lines.push(`HONOUR · ${honour}`);

    // No availability and no count of players without a game: who plays is
    // rarely known until close to tip-off, and Lineup already shows the fixtures.
    const run = nextFor(memberId);
    const next = [
      run
        ? `${run.counts.easy} easy, ${run.counts.even} even, ${run.counts.hard} hard${run.counts.unknown > 0 ? `, ${run.counts.unknown} not yet rated` : ""}`
        : null,
      plan.move
        ? `best move: drop ${P(plan.move.drop.id)}, add ${P(plan.move.add.id)} · +${formatOutlook(plan.move.gain)} ${basketNews ? "Modern points" : "fantasy points"} a game over the next 5`
        : null,
    ].filter(Boolean);
    if (next.length > 0) lines.push([input.nextRound !== null ? `NEXT ROUND ${input.nextRound}` : "NEXT", ...next].join(" · "));
    sections.set(memberId, lines.join("\n"));
  }

  const headerTokens = new Set([...header.matchAll(TOKEN_PATTERN)].map((match) => match[0]));
  const tokensFor = new Map(
    memberIds.map((memberId) => [memberId, new Set([...headerTokens, ...[...(sections.get(memberId) ?? "").matchAll(TOKEN_PATTERN)].map((match) => match[0])])]),
  );

  const moveNames = new Map(input.moves.flatMap((entry) => entry.moves.flatMap((move) => [[move.drop.id, move.drop.name] as const, [move.add.id, move.add.name] as const])));
  const privateNames = [
    input.leagueName,
    ...input.members.flatMap((member) => [member.teamName, member.userName]),
    ...[...tokens.player.keys()].flatMap((playerId) => {
      const stored = playerById.get(playerId)?.name ?? moveNames.get(playerId);
      return stored ? [displayName(stored), surname(stored)] : [];
    }),
  ].filter((name) => name.trim() !== "");

  return {
    ok: true,
    facts: {
      version: BRIEF_FACTS_VERSION,
      round: R,
      text: [header, ...memberIds.map((memberId) => sections.get(memberId)!)].join("\n\n"),
      header,
      refs: tokens.refs,
      privateNames: [...new Set(privateNames)],
      memberIds,
      sectionFor: (memberId) => sections.get(memberId) ?? "",
      tokensFor: (memberId) => tokensFor.get(memberId) ?? new Set(),
    },
  };
}

/**
 * Only what changed this round: a night won, a last place, a long streak grown
 * or ended. With three teams or fewer everyone is always top three, so a
 * streak says nothing there.
 */
function honourLine(before: MemberHonours | undefined, now: MemberHonours | undefined, teams: number): string | null {
  if (!now) return null;
  const was = before ?? { roundsWon: 0, spoons: 0, topThreeStreak: 0 };
  const streaks = teams >= STREAK_TEAMS;
  const parts = [
    now.roundsWon > was.roundsWon ? `nights won now ${now.roundsWon}` : null,
    now.spoons > was.spoons ? `last-place nights now ${now.spoons}` : null,
    streaks && now.topThreeStreak >= ON_FIRE_STREAK && now.topThreeStreak > was.topThreeStreak ? `top-three streak now ${now.topThreeStreak}` : null,
    streaks && was.topThreeStreak >= ON_FIRE_STREAK && now.topThreeStreak === 0 ? `top-three streak of ${was.topThreeStreak} ended` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}
