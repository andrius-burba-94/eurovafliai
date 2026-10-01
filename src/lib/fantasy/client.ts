import { sleep } from "@/lib/euroleague/http";

import { parseLeagueRosters, type FantasyTeam } from "./parse";

/**
 * The one read the sync makes from the official game's backend.
 *
 * Framework-free and `doFetch`-injectable, like the Euroleague client. Its own
 * small retry rather than `fetchWithRetry`, which sends no headers and folds
 * every status into one message: this one must say "the token was refused"
 * distinctly, because that is the one failure a person has to fix.
 */

export const FANTASY_API = "https://fantaking-api.dunkest.com/api/v1";

export class FantasyTokenRefused extends Error {
  constructor() {
    super("The Fantasy Challenge refused the token. Copy a fresh one from a signed-in browser.");
    this.name = "FantasyTokenRefused";
  }
}

const RETRY = new Set([429, 500, 502, 503, 504]);
const ATTEMPTS = 3;
const TIMEOUT_MS = 20_000;

export async function fetchLeagueRosters(
  token: string,
  leagueId: string,
  doFetch: typeof fetch = fetch,
): Promise<FantasyTeam[]> {
  const url = `${FANTASY_API}/fantasy-leagues/${encodeURIComponent(leagueId)}/rosters`;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const response = await doFetch(url, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        "user-agent": "Mozilla/5.0 (Eurovafliai roster sync)",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.ok) return parseLeagueRosters(await response.json());
    if (response.status === 401) throw new FantasyTokenRefused();
    if (response.status === 403 || response.status === 404) {
      throw new Error(`The Fantasy Challenge token cannot see league ${leagueId} (${response.status}).`);
    }
    if (!RETRY.has(response.status) || attempt === ATTEMPTS) {
      throw new Error(`The Fantasy Challenge answered ${response.status} for league ${leagueId}.`);
    }
    await sleep(2_000 * attempt);
  }
  throw new Error("unreachable");
}
