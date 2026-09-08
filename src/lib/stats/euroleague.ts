/**
 * The box-score feed's front door — slice 4.3.
 *
 * I/O lives here and nowhere else in this module: `scoring.ts`, `csv.ts` and
 * `plan.ts` stay pure so the rules that matter can be tested without a
 * network. `doFetch` is injectable, so the whole fetcher is tested against the
 * committed golden fixture served as if it were the feed — which means the
 * tests check the *real* payload shape rather than one I invented.
 *
 * Every finding below was confirmed by request, and the probes are in
 * docs/research/euroleague-api.md. The three that decide the code:
 *
 * 1. **`stats.valuation` is PIR**, so every row can be checked against the
 *    Euroleague's own arithmetic on the way in. A disagreement is refused, not
 *    reconciled — the same rule the pasted CSV follows, for the same reason:
 *    we cannot tell which of the two numbers is wrong.
 * 2. **`winner` is the season's champion, not the game's.** It reads `OLY` on
 *    every game of E2025, five of seven sampled games it did not play in. The
 *    win is what the ×1.1 bonus hangs on, so it is derived from
 *    `local.score` vs `road.score` and this file never reads `winner`.
 * 3. **An unplayed game answers 200 with an empty box score**, not 404, and
 *    both scores read 0. So "no data yet" and "everybody scored nothing" are
 *    the same response, and a derived winner would read 0–0 as a tie. Both
 *    guards are here: `played` gates the schedule, and a level scoreline or an
 *    empty side is refused even if `played` said otherwise.
 *
 * The normalized output is `ParsedStatRow[]` — deliberately the *same* type
 * the CSV parser produces — so the plan, the scoring and the store cannot
 * behave differently depending on where a row came from.
 */
import { z } from "zod";

import { FEED_BASE, type FeedFetch, getFeedJson, sleep } from "@/lib/euroleague/http";

import { type ParsedStatRow, type Phase, PHASES, phaseForRound } from "./csv";
import { type BoxScore, scoreGame } from "./scoring";

/** Politeness gap between game requests, as the roster sync does per club. */
const REQUEST_GAP_MS = 150;

const clubSchema = z.object({ code: z.string() });

/**
 * A schedule row, in the fields we read and no others.
 *
 * Loose on purpose. The feed sends about forty fields per game and a schema
 * that insisted on all of them would refuse a whole round because a referee's
 * photo url changed shape. This is the deliberate trade recorded in
 * `@/lib/euroleague/http`: fewer guarantees, an import that survives drift.
 */
const scheduleGameSchema = z.object({
  gameCode: z.number().int(),
  round: z.number().int(),
  played: z.boolean().nullish(),
  utcDate: z.string().nullish(),
  phaseType: z.object({ code: z.string().nullish() }).nullish(),
  local: z.object({ club: clubSchema, score: z.number().nullish() }),
  road: z.object({ club: clubSchema, score: z.number().nullish() }),
});

const scheduleSchema = z.union([
  z.object({ data: z.array(scheduleGameSchema) }),
  z.array(scheduleGameSchema),
]);

/**
 * The nineteen counted things, plus the PIR we check ourselves against.
 *
 * `.catch(0)` rather than a default: a missing cell and a null cell both mean
 * nought here, and a single absent field must not cost the other 23 players in
 * the game. `valuation` is nullable instead, because "absent" and "zero" are
 * genuinely different for the self-check — a real 0 PIR must still be checked.
 */
const number0 = z.number().nullish().transform((value) => Math.round(value ?? 0));

const statsSchema = z.object({
  valuation: z.number().nullish(),
  timePlayed: number0,
  points: number0,
  fieldGoalsMade2: number0,
  fieldGoalsAttempted2: number0,
  fieldGoalsMade3: number0,
  fieldGoalsAttempted3: number0,
  freeThrowsMade: number0,
  freeThrowsAttempted: number0,
  offensiveRebounds: number0,
  defensiveRebounds: number0,
  totalRebounds: number0,
  assistances: number0,
  steals: number0,
  turnovers: number0,
  blocksFavour: number0,
  blocksAgainst: number0,
  foulsCommited: number0,
  foulsReceived: number0,
  plusMinus: number0,
});

const boxSideSchema = z.object({
  players: z
    .array(
      z.object({
        player: z.object({
          person: z.object({
            code: z.string().nullish(),
            alias: z.string().nullish(),
            name: z.string().nullish(),
          }),
        }),
        stats: statsSchema,
      }),
    )
    .nullish(),
});

const boxScoreSchema = z.object({
  local: boxSideSchema,
  road: boxSideSchema,
});

export type ScheduledGame = {
  readonly gameCode: number;
  readonly round: number;
  readonly phase: Phase;
  readonly played: boolean;
  readonly localClub: string;
  readonly roadClub: string;
  readonly localScore: number;
  readonly roadScore: number;
  readonly utcDate: string | null;
};

function readPhase(code: string | null | undefined, round: number): Phase {
  const upper = (code ?? "").toUpperCase();
  return PHASES.includes(upper as Phase) ? (upper as Phase) : phaseForRound(round);
}

/**
 * The whole season's schedule — one request, ~400 games.
 *
 * One request rather than a round at a time, because the pass that consumes it
 * asks "what is played and not stored", which is a question about the season
 * and not about a round. That is what makes the fetcher self-healing: a game
 * missed for any reason — downtime, a failed parse, a fortnight of the worker
 * being off — is simply still in the answer next time.
 */
export async function fetchSeasonSchedule({
  season,
  doFetch = fetch,
  onProgress,
}: {
  season: string;
  doFetch?: FeedFetch;
  onProgress?: (message: string) => void;
}): Promise<ScheduledGame[]> {
  const body = await getFeedJson(
    `${FEED_BASE}/${season}/games?limit=500`,
    doFetch,
    onProgress,
  );
  const parsed = scheduleSchema.parse(body);
  const games = Array.isArray(parsed) ? parsed : parsed.data;

  return games.map((game) => ({
    gameCode: game.gameCode,
    round: game.round,
    phase: readPhase(game.phaseType?.code, game.round),
    played: game.played === true,
    localClub: game.local.club.code,
    roadClub: game.road.club.code,
    localScore: game.local.score ?? 0,
    roadScore: game.road.score ?? 0,
    utcDate: game.utcDate ?? null,
  }));
}

export type FetchedGame = {
  readonly game: ScheduledGame;
  readonly rows: ParsedStatRow[];
  /** One sentence per row we would not store, and why. */
  readonly problems: string[];
  /** How many rows carried the official PIR and agreed with our own sum. */
  readonly checkedAgainstPir: number;
};

/**
 * A game's box score, normalized and self-checked.
 *
 * Refuses the whole game — rather than storing half of it — when the response
 * is one of the two shapes that mean "there is nothing here yet": an empty
 * side, or a level scoreline. Everything else is per row, so one unreadable
 * player does not cost the other 23.
 *
 * `line` on each row is the *game code*, not a line number: these rows never
 * came from a sheet, and a message saying "line 1" about the feed would send
 * somebody looking at a file that does not exist.
 */
export async function fetchGameBoxScore({
  season,
  game,
  doFetch = fetch,
  onProgress,
}: {
  season: string;
  game: ScheduledGame;
  doFetch?: FeedFetch;
  onProgress?: (message: string) => void;
}): Promise<FetchedGame> {
  const body = await getFeedJson(
    `${FEED_BASE}/${season}/games/${game.gameCode}/stats`,
    doFetch,
    onProgress,
  );
  const box = boxScoreSchema.parse(body);

  const problems: string[] = [];
  const rows: ParsedStatRow[] = [];
  let checkedAgainstPir = 0;

  const sides = [
    { side: box.local, club: game.localClub, own: game.localScore, other: game.roadScore },
    { side: box.road, club: game.roadClub, own: game.roadScore, other: game.localScore },
  ];

  if (sides.some(({ side }) => (side.players ?? []).length === 0)) {
    return {
      game,
      rows: [],
      problems: [
        `Game ${game.gameCode} (round ${game.round}) has an empty box score. An unplayed game answers 200 with no players rather than 404, so this is "not yet", not "nobody scored".`,
      ],
      checkedAgainstPir: 0,
    };
  }

  if (game.localScore === game.roadScore) {
    return {
      game,
      rows: [],
      problems: [
        `Game ${game.gameCode} (round ${game.round}) is level at ${game.localScore}. No Euroleague game ends level, so the scoreline is not final — and a derived win cannot be read off a tie.`,
      ],
      checkedAgainstPir: 0,
    };
  }

  for (const { side, club, own, other } of sides) {
    for (const entry of side.players ?? []) {
      const personCode = entry.player.person.code ?? "";
      const who =
        entry.player.person.alias ?? entry.player.person.name ?? "(unnamed)";
      if (!personCode) {
        problems.push(
          `Game ${game.gameCode}: ${who} (${club}) has no person code, so there is no player to attach the line to.`,
        );
        continue;
      }

      const stats = entry.stats;
      const box: BoxScore = {
        timePlayed: stats.timePlayed,
        points: stats.points,
        fieldGoalsMade2: stats.fieldGoalsMade2,
        fieldGoalsAttempted2: stats.fieldGoalsAttempted2,
        fieldGoalsMade3: stats.fieldGoalsMade3,
        fieldGoalsAttempted3: stats.fieldGoalsAttempted3,
        freeThrowsMade: stats.freeThrowsMade,
        freeThrowsAttempted: stats.freeThrowsAttempted,
        offensiveRebounds: stats.offensiveRebounds,
        defensiveRebounds: stats.defensiveRebounds,
        totalRebounds: stats.totalRebounds,
        assistances: stats.assistances,
        steals: stats.steals,
        turnovers: stats.turnovers,
        blocksFavour: stats.blocksFavour,
        blocksAgainst: stats.blocksAgainst,
        foulsCommited: stats.foulsCommited,
        foulsReceived: stats.foulsReceived,
        plusMinus: stats.plusMinus,
      };

      const won = own > other;
      if (stats.valuation !== null && stats.valuation !== undefined) {
        const stated = Math.round(stats.valuation);
        const { base } = scoreGame(box, won);
        if (base !== stated) {
          // The feed brought its own PIR and it disagrees with the components
          // beside it. One of them is wrong and we cannot tell which, so the
          // row is not stored — and this is the assertion that would catch a
          // rulebook change on the night it happened.
          problems.push(
            `Game ${game.gameCode}: ${who} (${club}) — the feed's PIR ${stated} does not match the ${base} its own numbers add up to.`,
          );
          continue;
        }
        checkedAgainstPir += 1;
      }

      rows.push({
        personCode,
        gameCode: game.gameCode,
        round: game.round,
        phase: game.phase,
        clubCode: club,
        teamScore: own,
        opponentScore: other,
        won,
        box,
        line: game.gameCode,
      });
    }
  }

  return { game, rows, problems, checkedAgainstPir };
}

/**
 * Fetch several games, politely.
 *
 * Sequential with a gap, like the roster sync's twenty clubs: the feed has a
 * rate limit and ten games a round is nothing next to it, provided nobody
 * fires them all at once. A game that throws — a network blip, a shape we
 * cannot read at all — is reported and the rest still land, because ten games
 * are ten independent nights and one of them failing is not a reason to have
 * none of them.
 */
export async function fetchGameBoxScores({
  season,
  games,
  doFetch = fetch,
  onProgress,
}: {
  season: string;
  games: readonly ScheduledGame[];
  doFetch?: FeedFetch;
  onProgress?: (message: string) => void;
}): Promise<{ fetched: FetchedGame[]; failed: string[] }> {
  const fetched: FetchedGame[] = [];
  const failed: string[] = [];

  for (const [index, game] of games.entries()) {
    if (index > 0) await sleep(REQUEST_GAP_MS);
    try {
      fetched.push(await fetchGameBoxScore({ season, game, doFetch, onProgress }));
    } catch (error) {
      failed.push(
        `Game ${game.gameCode} (round ${game.round}): ${(error as Error).message}`,
      );
    }
  }

  return { fetched, failed };
}
