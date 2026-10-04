import { z } from "zod";

/** BasketNews uses GraphQL, not the Fantaking REST API in `fantasy/client.ts`. */
const ENDPOINT = "https://fantasy.basketnews.com/backend/graphql";
const ID = z.string().regex(/^[a-f0-9]{24}$/);
const sourcePlayer = z.object({
  id: ID,
  firstName: z.string(),
  middleName: z.string().nullish(),
  lastName: z.string(),
  team: z.object({
    number: z.number().nullish(),
    positions: z.array(z.string()),
    team: z.object({ id: ID, translation: z.object({ name: z.string() }) }),
  }).nullish(),
});
const pick = z.object({ id: ID, playerId: ID, fantasyTeamId: ID, player: sourcePlayer });
const league = z.object({
  id: ID, title: z.string(), leagueId: ID, pointCalcSystem: z.string(),
  draftDate: z.string().nullish(), startingRound: z.number(),
  draft: z.object({ id: ID, picks: z.array(pick) }),
});
const team = z.object({ id: ID, title: z.string(), draftOrder: z.number().nullish() });
const teamReference = z.object({ id: ID, title: z.string(), leagueId: ID, fantasyLeagues: z.array(z.object({ fantasyLeagueId: ID })) });
const lineupPlayer = z.object({
  playerId: ID, player: sourcePlayer.extend({ fantasy_pts: z.number().nullish() }),
  cardIdentifier: z.string(), captain: z.boolean(),
  playedAsCardIdentifier: z.string().nullish(), playedAsCaptain: z.boolean().nullish(),
});
const lineup = z.object({ id: ID, fantasyRound: z.number(), players: z.array(lineupPlayer) });
const score = z.object({ pointsTotal: z.number(), pointsGained: z.number() });

export type BasketNewsLeague = z.infer<typeof league>;
export type BasketNewsTeam = z.infer<typeof team>;
export type BasketNewsLineup = z.infer<typeof lineup>;
export type BasketNewsScore = z.infer<typeof score>;

export class BasketNewsSessionExpired extends Error {
  constructor() { super("BasketNews session expired. Renew BASKETNEWS_COOKIE; stored league data is unchanged."); }
}

async function query<T>(
  document: string,
  variables: Record<string, string | number>,
  schema: z.ZodType<T>,
  key: string,
  cookie: string | undefined,
  doFetch: typeof fetch,
): Promise<T> {
  const response = await doFetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({ query: document, variables }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 401 || response.status === 403) throw new BasketNewsSessionExpired();
  if (!response.ok) throw new Error(`BasketNews returned HTTP ${response.status}.`);
  const body: unknown = await response.json();
  const parsed = z.object({ data: z.record(z.string(), z.unknown()).nullish(), errors: z.array(z.object({ message: z.string() })).optional() }).parse(body);
  if (parsed.errors?.some((error) => /forbidden|unauthori/i.test(error.message))) throw new BasketNewsSessionExpired();
  if (parsed.errors?.length) throw new Error(`BasketNews query failed: ${parsed.errors[0]!.message}`);
  return schema.parse(parsed.data?.[key]);
}

const LEAGUE = `query($id:String!,$league:String!){fantasyLeagueRecordFromClient(id:$id){id title leagueId pointCalcSystem draftDate startingRound draft{id picks{id playerId fantasyTeamId player{id firstName middleName lastName team(leagueId:$league,fantasyRound:0){number positions team{id translation(locale:"en"){name}}}}}}}}`;
const TEAMS = `query($id:String!){allFantasyLeagueTeamsFromClient(fantasyLeagueId:$id){id title draftOrder}}`;
const TEAM_REFERENCE = `query($id:String!){fantasyTeamRecordFromClient(fantasyTeamId:$id){id title leagueId fantasyLeagues{fantasyLeagueId}}}`;
const LINEUP = `query($team:String!,$round:Int!,$league:String!){fantasyTeamLineupRecordFromClient(fantasyTeamId:$team,fantasyRound:$round,editMode:false){id fantasyRound players{playerId cardIdentifier captain playedAsCardIdentifier playedAsCaptain player{id firstName middleName lastName team(leagueId:$league,fantasyRound:$round){number positions team{id translation(locale:"en"){name}}} fantasy_pts(leagueId:$league,pointCalcSystem:"modern",fantasyRound:$round)}}}}`;
const SCORE = `query($team:String!,$round:Int!,$league:String!){fantasyTeamScoreRecordFromClient(leagueId:$league,fantasyTeamId:$team,fantasyRound:$round){pointsTotal pointsGained}}`;

export function basketNewsTeamId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "fantasy.basketnews.com") return null;
    return ID.safeParse(parsed.pathname.match(/^\/teams\/([a-f0-9]{24})\/?$/)?.[1]).data ?? null;
  } catch { return null; }
}

export async function readBasketNewsLeague(id: string, sourceLeagueId: string, doFetch: typeof fetch = fetch): Promise<BasketNewsLeague> {
  return query(LEAGUE, { id, league: sourceLeagueId }, league, "fantasyLeagueRecordFromClient", undefined, doFetch);
}

export async function readBasketNewsTeams(id: string, doFetch: typeof fetch = fetch): Promise<BasketNewsTeam[]> {
  return query(TEAMS, { id }, z.array(team), "allFantasyLeagueTeamsFromClient", undefined, doFetch);
}

export async function readBasketNewsTeamReference(id: string, doFetch: typeof fetch = fetch): Promise<z.infer<typeof teamReference>> {
  return query(TEAM_REFERENCE, { id }, teamReference, "fantasyTeamRecordFromClient", undefined, doFetch);
}

export async function readBasketNewsLineup(
  teamId: string, roundIndex: number, sourceLeagueId: string, cookie: string | undefined, doFetch: typeof fetch = fetch,
): Promise<BasketNewsLineup> {
  return query(LINEUP, { team: teamId, round: roundIndex, league: sourceLeagueId }, lineup, "fantasyTeamLineupRecordFromClient", cookie, doFetch);
}

export async function readBasketNewsScore(
  teamId: string, roundIndex: number, sourceLeagueId: string, doFetch: typeof fetch = fetch,
): Promise<BasketNewsScore | null> {
  return query(SCORE, { team: teamId, round: roundIndex, league: sourceLeagueId }, score.nullable(), "fantasyTeamScoreRecordFromClient", undefined, doFetch);
}
