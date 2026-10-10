import { sleep } from "@/lib/euroleague/http";

import { parseCurrentMatchday, parseRoundLineup, type OfficialLineup } from "./lineup";
import {
  parseGameConfig,
  parseLeagueMoves,
  parseLeagueRosters,
  parsePlayerPoolPage,
  type FantasyMove,
  type FantasyPlayer,
  type FantasyTeam,
} from "./parse";

/**
 * The reads the sync makes from the official game's backend.
 *
 * Framework-free and `doFetch`-injectable, like the Euroleague client. Its own
 * small retry rather than `fetchWithRetry`, which sends no headers and folds
 * every status into one message: this one must say "the token was refused"
 * distinctly, because that is the one failure a person has to fix.
 */

export const FANTASY_API = "https://fantaking-api.dunkest.com/api/v1";

/** The official game's ids for the EuroLeague and its Draft Mode. */
const GAME_LEAGUE = 10;
const DRAFT_GAME_MODE = 2;

export class FantasyTokenRefused extends Error {
  constructor() {
    super("The Fantasy Challenge refused the token. Copy a fresh one from a signed-in browser.");
    this.name = "FantasyTokenRefused";
  }
}

const RETRY = new Set([429, 500, 502, 503, 504]);
const ATTEMPTS = 3;
const TIMEOUT_MS = 20_000;

async function getJson(
  path: string,
  token: string,
  doFetch: typeof fetch,
  what: { forbidden: string; failed: string },
): Promise<unknown> {
  const url = `${FANTASY_API}${path}`;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const response = await doFetch(url, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        "user-agent": "Mozilla/5.0 (Eurovafliai roster sync)",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.ok) return response.json();
    if (response.status === 401) throw new FantasyTokenRefused();
    if (response.status === 403 || response.status === 404) {
      throw new Error(`${what.forbidden} (${response.status}).`);
    }
    if (!RETRY.has(response.status) || attempt === ATTEMPTS) {
      throw new Error(`The Fantasy Challenge answered ${response.status} for ${what.failed}.`);
    }
    await sleep(2_000 * attempt);
  }
  throw new Error("unreachable");
}

export async function fetchLeagueRosters(
  token: string,
  leagueId: string,
  doFetch: typeof fetch = fetch,
): Promise<FantasyTeam[]> {
  const raw = await getJson(`/fantasy-leagues/${encodeURIComponent(leagueId)}/rosters`, token, doFetch, {
    forbidden: `The Fantasy Challenge token cannot see league ${leagueId}`,
    failed: `league ${leagueId}`,
  });
  return parseLeagueRosters(raw);
}

/**
 * Every move the league's teams made for one matchday, oldest first: the order
 * the sync replays them in, so a player traded and then released inside one
 * window is recorded with both teams that held him.
 */
export async function fetchLeagueMoves(
  token: string,
  leagueId: string,
  matchdayId: number,
  doFetch: typeof fetch = fetch,
): Promise<FantasyMove[]> {
  const raw = await getJson(`/fantasy-leagues/${encodeURIComponent(leagueId)}/fantasy-trades?matchday=${matchdayId}`, token, doFetch, {
    forbidden: `The Fantasy Challenge token cannot see league ${leagueId}'s moves`,
    failed: `league ${leagueId}'s moves for matchday ${matchdayId}`,
  });
  return parseLeagueMoves(raw).sort((a, b) => a.id - b.id);
}

/**
 * One team's lineup for one matchday, as anyone in its league may see it.
 *
 * `/roster/preview`, not `/roster`: the latter is the owner's edit view and
 * answers 403 for every other manager's team.
 */
export async function fetchRoundLineup(
  token: string,
  fantasyTeamId: string,
  matchdayId: number,
  doFetch: typeof fetch = fetch,
): Promise<OfficialLineup> {
  const raw = await getJson(
    `/fantasy-teams/${encodeURIComponent(fantasyTeamId)}/matchdays/${matchdayId}/roster/preview`,
    token,
    doFetch,
    {
      forbidden: `The Fantasy Challenge will not show team ${fantasyTeamId}'s lineup`,
      failed: `team ${fantasyTeamId}'s lineup`,
    },
  );
  return parseRoundLineup(raw);
}

/**
 * The matchday the official game is on, read from the token owner's team in
 * the linked league. The game lists no matchdays, so every other round's id is
 * counted from this one.
 */
export async function fetchCurrentMatchday(
  token: string,
  fantasyLeagueId: string,
  doFetch: typeof fetch = fetch,
): Promise<{ id: number; number: number }> {
  const raw = await getJson(
    `/user/fantasy-teams?league=${GAME_LEAGUE}&game_mode=${DRAFT_GAME_MODE}`,
    token,
    doFetch,
    { forbidden: "The Fantasy Challenge will not list the token owner's teams", failed: "the token owner's teams" },
  );
  return parseCurrentMatchday(raw, fantasyLeagueId);
}

/** Big enough that the whole pool (356 rows on 9 October 2026) is one page. */
const POOL_PAGE = 500;

/**
 * Every player the game lists today, with its position: the current
 * matchday's list, every page. Coaches are dropped.
 */
export async function fetchPlayerPool(token: string, doFetch: typeof fetch = fetch): Promise<FantasyPlayer[]> {
  const config = parseGameConfig(
    await getJson(`/leagues/${GAME_LEAGUE}/config`, token, doFetch, {
      forbidden: "The Fantasy Challenge will not show its game config",
      failed: "the game config",
    }),
  );
  const players: FantasyPlayer[] = [];
  for (let page = 1, last = 1; page <= last; page += 1) {
    const read = parsePlayerPoolPage(
      await getJson(
        `/players-lists/${config.playersListId}/matchdays/${config.matchdayId}/players?per_page=${POOL_PAGE}&page=${page}`,
        token,
        doFetch,
        { forbidden: "The Fantasy Challenge will not list its player pool", failed: `the player pool, page ${page}` },
      ),
    );
    players.push(...read.players);
    last = read.lastPage;
  }
  return players;
}
