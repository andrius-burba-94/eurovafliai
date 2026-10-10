import { homeEdge, marginFor, type ScheduleRow } from "@/lib/fixtures/schedule";

/**
 * A player's outlook — slice 7.2 E. Pure: lines and schedules in, figures out.
 *
 * Per upcoming game: PIR per minute × expected minutes in his current role ×
 * the opponent's strength, then the league's game's win term weighted by his
 * club's chance of winning. A window is the average over the club's next 5,
 * 10 or 15 games, so a round the club sits out adds nothing rather than a zero.
 *
 * Last season is a fallback only, never a blend (the maintainer, 7.2 E): a
 * player's rate and minutes when he has no game this season, a club's margin
 * while it has fewer than three. Opponent strength is this season's alone,
 * pulled toward neutral while the sample is small; last season's lines miss a
 * quarter of the league (players who left), which skews clubs by as much as
 * the effect being measured.
 *
 * In the Fantasy Challenge's units a BasketNews ruleset's base is Modern points
 * without their ±1.5 result term, because that term is the win term here.
 */

export type Ruleset = "euroleague" | "basketnews";
export type Run = "easy" | "even" | "hard";
export type Role = "starter" | "reserve";
export type BaseSource = "current" | "last";
export type Confidence = "high" | "medium" | "low";

export type AdvisorLine = {
  readonly player: string;
  readonly club: string;
  readonly round: number;
  readonly gameCode: number;
  readonly seconds: number;
  readonly pir: number;
  /** Modern points as stored, in hundredths, the ±1.5 result term included. */
  readonly modernHundredths: number;
  readonly won: boolean;
  /** Unknown on a line stored before the field existed. */
  readonly started: boolean | null;
};

export type SeasonInput = {
  readonly lines: readonly AdvisorLine[];
  readonly schedule: readonly ScheduleRow[];
};

export type PlayerOutlook = {
  readonly player: string;
  /** Points a game in hundredths over the next 5, 10 and 15 games; null when the club has none. */
  readonly next: readonly [number | null, number | null, number | null];
  /** The club's games left, up to 15: zero means every window is absent. */
  readonly gamesAhead: number;
  /** What a reason may cite beside the figure: the inputs the advisor used. */
  readonly ratePerMinute: number;
  readonly minutes: number;
  /** Of his last (up to 5) games in the base season, how many he started. */
  readonly startsRecent: number;
  readonly gamesRecent: number;
  /** His club's average chance of winning its next 5, or null with no game ahead. */
  readonly winChance: number | null;
  readonly role: Role;
  /** This season's games in the current role, counted back to the last change of role. */
  readonly gamesInRole: number;
  readonly baseSource: BaseSource;
  readonly runs: readonly [Run | null, Run | null, Run | null];
};

/** The games a rate and a role are read from. */
export const RECENT_GAMES = 5;
export const WINDOWS = [5, 10, 15] as const;

/**
 * Neutral games mixed into a club's record before it describes the club. Five:
 * after five real games the record carries half the weight, after twenty, four
 * fifths. Chosen, not derived.
 */
export const OPPONENT_PRIOR_GAMES = 5;

/** How far from neutral a window's opponents must be before it is an easy or a hard run. */
export const RUN_MARGIN = 0.04;

/**
 * Points of expected margin that move a win chance from a half to about 73%.
 * A logistic over margin / 7 tracks the usual ~12-point spread of a game's result.
 */
export const WIN_SCALE = 7;

export const FANTASY_WIN_BONUS = 0.1;
export const MODERN_RESULT_POINTS = 1.5;

export const CONFIDENCE_HIGH_GAMES = 5;
export const CONFIDENCE_MEDIUM_GAMES = 3;

export function runOf(strength: number): Run {
  if (strength >= 1 + RUN_MARGIN) return "easy";
  if (strength <= 1 - RUN_MARGIN) return "hard";
  return "even";
}

export function confidenceOf(outlook: Pick<PlayerOutlook, "gamesInRole" | "baseSource">): Confidence {
  if (outlook.baseSource === "last") return "low";
  if (outlook.gamesInRole >= CONFIDENCE_HIGH_GAMES) return "high";
  if (outlook.gamesInRole >= CONFIDENCE_MEDIUM_GAMES) return "medium";
  return "low";
}

function byWhen(a: AdvisorLine, b: AdvisorLine): number {
  return a.round - b.round || a.gameCode - b.gameCode;
}

function pointsOf(line: AdvisorLine, ruleset: Ruleset): number {
  if (ruleset === "euroleague") return line.pir;
  return (line.modernHundredths - (line.won ? 1 : -1) * MODERN_RESULT_POINTS * 100) / 100;
}

/** What each club gives up relative to the league, this season, shrunk toward 1. */
export function opponentStrengths(season: SeasonInput): Map<string, number> {
  const pirByGameClub = new Map<string, number>();
  for (const line of season.lines) {
    const key = `${line.gameCode}|${line.club}`;
    pirByGameClub.set(key, (pirByGameClub.get(key) ?? 0) + line.pir);
  }
  // The ingest marks a fixture played before it fetches the box score; until
  // the lines land, the game would read as both clubs conceding nothing.
  const scored = new Set(season.lines.map((line) => line.gameCode));
  const played = season.schedule.filter((row) => row.played && scored.has(row.gameCode));
  const conceded = new Map<string, { pir: number; games: number }>();
  let total = 0;
  for (const row of played) {
    for (const [club, opponent] of [
      [row.localClub, row.roadClub],
      [row.roadClub, row.localClub],
    ] as const) {
      const pir = pirByGameClub.get(`${row.gameCode}|${opponent}`) ?? 0;
      const entry = conceded.get(club) ?? { pir: 0, games: 0 };
      conceded.set(club, { pir: entry.pir + pir, games: entry.games + 1 });
      total += pir;
    }
  }
  const strengths = new Map<string, number>();
  const average = played.length === 0 ? 0 : total / (played.length * 2);
  if (average <= 0) return strengths;
  for (const [club, { pir, games }] of conceded) {
    const raw = pir / games / average;
    strengths.set(club, (raw * games + OPPONENT_PRIOR_GAMES) / (games + OPPONENT_PRIOR_GAMES));
  }
  return strengths;
}

/** The chance `club` wins `game`, from both sides' margins and the home edge. */
function winChance(game: ScheduleRow, club: string, current: SeasonInput, last: SeasonInput): number {
  const opponent = game.localClub === club ? game.roadClub : game.localClub;
  const margin = (side: string) => marginFor(current.schedule, side) ?? marginFor(last.schedule, side) ?? 0;
  const edge = homeEdge(current.schedule) || homeEdge(last.schedule);
  const expected = margin(club) - margin(opponent) + (game.localClub === club ? edge : -edge);
  return 1 / (1 + Math.exp(-expected / WIN_SCALE));
}

type Base = {
  rate: number;
  minutes: number;
  role: Role;
  gamesInRole: number;
  source: BaseSource;
  startsRecent: number;
  gamesRecent: number;
};

function averageMinutes(lines: readonly AdvisorLine[]): number {
  return lines.reduce((sum, line) => sum + line.seconds, 0) / lines.length / 60;
}

function roleOf(lines: readonly AdvisorLine[]): { role: Role; streak: number } {
  const known = lines.filter((line) => line.started !== null);
  const latest = known.at(-1);
  if (!latest) return { role: "reserve", streak: 0 };
  let streak = 0;
  for (let index = known.length - 1; index >= 0 && known[index]!.started === latest.started; index -= 1) streak += 1;
  return { role: latest.started ? "starter" : "reserve", streak };
}

function inRole(lines: readonly AdvisorLine[], role: Role): AdvisorLine[] {
  return lines.filter((line) => line.started === (role === "starter"));
}

function baseFor(current: readonly AdvisorLine[], last: readonly AdvisorLine[], ruleset: Ruleset): Base | null {
  const source: BaseSource = current.length > 0 ? "current" : "last";
  const lines = source === "current" ? current : last;
  if (lines.length === 0) return null;

  const recent = lines.slice(-RECENT_GAMES);
  const seconds = recent.reduce((sum, line) => sum + line.seconds, 0);
  const rate = recent.reduce((sum, line) => sum + pointsOf(line, ruleset), 0) / (seconds / 60);

  const { role, streak } = roleOf(lines);
  // With no start known for him there is no role to read minutes in, and a
  // guessed one would hand a starter last season's bench minutes.
  const known = streak > 0;
  const sameRole = known ? inRole(lines, role).slice(-RECENT_GAMES) : [];
  const lastRole = known ? inRole(last, role) : [];
  const minutes = sameRole.length > 0
    ? averageMinutes(sameRole)
    : lastRole.length > 0
      ? averageMinutes(lastRole)
      : averageMinutes(recent);
  return {
    rate,
    minutes,
    role,
    gamesInRole: source === "current" ? streak : 0,
    source,
    startsRecent: recent.filter((line) => line.started === true).length,
    gamesRecent: recent.length,
  };
}

export function outlooksFor({
  ruleset,
  players,
  current,
  last,
}: {
  ruleset: Ruleset;
  players: readonly { readonly id: string; readonly club: string }[];
  current: SeasonInput;
  last: SeasonInput;
}): PlayerOutlook[] {
  const playedLines = (season: SeasonInput) => {
    const byPlayer = new Map<string, AdvisorLine[]>();
    for (const line of [...season.lines].filter((row) => row.seconds > 0).sort(byWhen)) {
      byPlayer.set(line.player, [...(byPlayer.get(line.player) ?? []), line]);
    }
    return byPlayer;
  };
  const thisSeason = playedLines(current);
  const lastSeason = playedLines(last);
  const strengths = opponentStrengths(current);
  const upcoming = current.schedule
    .filter((row) => !row.played)
    .sort((a, b) => a.round - b.round || a.gameCode - b.gameCode);
  const latestPlayed = new Map<string, number>();
  for (const row of current.schedule.filter((game) => game.played)) {
    for (const club of [row.localClub, row.roadClub]) {
      latestPlayed.set(club, Math.max(latestPlayed.get(club) ?? 0, row.round));
    }
  }

  const outlooks: PlayerOutlook[] = [];
  for (const player of players) {
    const base = baseFor(thisSeason.get(player.id) ?? [], lastSeason.get(player.id) ?? [], ruleset);
    if (!base) continue;
    const latest = latestPlayed.get(player.club) ?? 0;
    // An unplayed game from before the club's latest one was postponed: it is
    // not next, whatever its round number says.
    const games = upcoming
      .filter((row) => (row.localClub === player.club || row.roadClub === player.club) && row.round > latest)
      .slice(0, WINDOWS[WINDOWS.length - 1]);
    const perGame = games.map((game) => {
      const opponent = game.localClub === player.club ? game.roadClub : game.localClub;
      const strength = strengths.get(opponent) ?? 1;
      const p = winChance(game, player.club, current, last);
      const expected = base.rate * base.minutes * strength;
      const value = ruleset === "euroleague"
        ? expected * (1 + FANTASY_WIN_BONUS * p)
        : expected + MODERN_RESULT_POINTS * (2 * p - 1);
      return { value, strength, p };
    });
    const windowOf = (size: number) => {
      const slice = perGame.slice(0, size);
      if (slice.length === 0) return { next: null, run: null };
      const mean = (pick: (entry: (typeof perGame)[number]) => number) =>
        slice.reduce((sum, entry) => sum + pick(entry), 0) / slice.length;
      return { next: Math.round(mean((entry) => entry.value) * 100), run: runOf(mean((entry) => entry.strength)) };
    };
    const [five, ten, fifteen] = WINDOWS.map(windowOf) as [ReturnType<typeof windowOf>, ReturnType<typeof windowOf>, ReturnType<typeof windowOf>];
    outlooks.push({
      player: player.id,
      next: [five.next, ten.next, fifteen.next],
      gamesAhead: games.length,
      ratePerMinute: base.rate,
      minutes: base.minutes,
      startsRecent: base.startsRecent,
      gamesRecent: base.gamesRecent,
      winChance:
        perGame.length === 0
          ? null
          : perGame.slice(0, WINDOWS[0]).reduce((sum, entry) => sum + entry.p, 0) / Math.min(perGame.length, WINDOWS[0]),
      role: base.role,
      gamesInRole: base.gamesInRole,
      baseSource: base.source,
      runs: [five.run, ten.run, fifteen.run],
    });
  }
  return outlooks;
}
