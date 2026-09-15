import "server-only";

import {
  announceAdd,
  announceDrop,
  announceImpact,
  announceTrade,
} from "@/lib/chat/messages";
import { getSession } from "@/lib/auth/session";
import type { Position } from "@/lib/engine";
import { readNextFixtures } from "@/lib/fixtures/queries";
import type { PlayerFixture } from "@/lib/fixtures/types";
import { readLineupWeights } from "@/lib/lineups/store";
import { createUserClient } from "@/lib/pb/server";
import { impactForMember, type ImpactTransaction } from "@/lib/stats/impact";
import { last5SeriesOf } from "@/lib/stats/project";

import type { Seat } from "./plan";
import { listActiveMemberships } from "./store";

type ExpandedPlayer = {
  id: string;
  name: string;
  club_code: string;
  club_name: string;
  position: Position;
  proj_last5_games?: number;
  proj_last5_pirs?: unknown;
};

type MembershipRow = {
  id: string;
  player: string;
  member: string;
  to_date?: string | null;
  expand?: { player?: ExpandedPlayer };
};

type PickRef = { player: string; overall_no: number };

/**
 * One member's current roster, with the viewer's token so the collection's
 * read rule is what scopes it.
 */
export type RosterPlayer = {
  readonly id: string;
  readonly name: string;
  readonly clubCode: string;
  readonly clubName: string;
  readonly position: Position;
  readonly overallNo: number | null;
  /**
   * This season's last five PIRs, oldest first — what the block's sparkline
   * draws. Empty before the season is under way, which draws nothing.
   */
  readonly last5Pirs: readonly number[];
  /**
   * The club's next unplayed game, or null when the schedule has nothing to say
   * — before the season's first ingest pass, and for a club whose season is
   * over. The block renders no fixture line rather than a "TBD".
   */
  readonly fixture?: PlayerFixture | null;
};

export async function readMemberRoster(
  leagueId: string,
  memberId: string,
  season: string,
): Promise<RosterPlayer[]> {
  const session = await getSession();
  if (!session) return [];

  const pb = createUserClient(session.token);
  const [memberships, drafts] = await Promise.all([
    listActiveMemberships<MembershipRow>(pb, leagueId, { expand: "player" }),
    pb.collection("drafts").getFullList<{ id: string }>({
      filter: `league = '${leagueId}' && status = 'complete'`,
      sort: "-id",
      fields: "id",
      requestKey: null,
    }),
  ]);

  const fixtures = await readNextFixtures(season, session.token);

  const mine = memberships.filter((row) => row.member === memberId);
  const draftId = drafts[0]?.id;
  const picks = draftId
    ? await pb.collection("picks").getFullList<PickRef>({
        filter: `draft = '${draftId}'`,
        fields: "player,overall_no",
        requestKey: null,
      })
    : [];
  const overallByPlayer = new Map(
    picks.map((pick) => [pick.player, pick.overall_no]),
  );

  return mine.flatMap((row) => {
    const player = row.expand?.player;
    if (!player) return [];
    return [
      {
        id: player.id,
        name: player.name,
        clubCode: player.club_code,
        clubName: player.club_name,
        position: player.position,
        overallNo: overallByPlayer.get(player.id) ?? null,
        last5Pirs: last5SeriesOf(player),
        fixture: fixtures.get(player.club_code) ?? null,
      },
    ];
  });
}

export type BoardSeat = Seat & {
  readonly name: string;
  readonly clubName: string;
};

export type FreeAgent = {
  readonly id: string;
  readonly name: string;
  readonly clubName: string;
  readonly clubCode: string;
  readonly position: Position;
  readonly normalized: string;
};

type PoolRow = {
  id: string;
  name: string;
  name_normalized?: string;
  club_code: string;
  club_name: string;
  position: Position;
  status: string;
};

/**
 * Active seats plus unsigned players — what the transaction builder needs.
 */
export async function readTransactionBoard(leagueId: string): Promise<{
  seats: BoardSeat[];
  freeAgents: FreeAgent[];
} | null> {
  const session = await getSession();
  if (!session) return null;

  const pb = createUserClient(session.token);
  const [memberships, pool] = await Promise.all([
    listActiveMemberships<MembershipRow>(pb, leagueId, { expand: "player" }),
    pb.collection("players").getFullList<PoolRow>({
      filter: "status != 'left'",
      fields: "id,name,name_normalized,club_code,club_name,position,status",
      requestKey: null,
    }),
  ]);

  const seats: BoardSeat[] = memberships.flatMap((row) => {
    const player = row.expand?.player;
    if (!player) return [];
    return [
      {
        id: row.id,
        member: row.member,
        player: player.id,
        position: player.position,
        name: player.name,
        clubName: player.club_name,
      },
    ];
  });
  const owned = new Set(seats.map((seat) => seat.player));
  const freeAgents = pool
    .filter((player) => !owned.has(player.id))
    .map((player) => ({
      id: player.id,
      name: player.name,
      clubName: player.club_name,
      clubCode: player.club_code,
      position: player.position,
      normalized: player.name_normalized ?? player.name,
    }));

  return { seats, freeAgents };
}

export type DealView = {
  readonly id: string;
  readonly sentence: string;
  readonly impactSentence: string;
  readonly deltaTenths: number;
  readonly deltaPir: number;
  readonly byRound: readonly {
    readonly round: number;
    readonly deltaTenths: number;
  }[];
};

type StoredTx = {
  id: string;
  type: string;
  from_round: number;
  members: unknown;
  players_in: unknown;
  players_out: unknown;
};

function asIdMap(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!Array.isArray(value)) continue;
    out[key] = value.filter((id): id is string => typeof id === "string");
  }
  return out;
}

function asMemberIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === "string");
}

/**
 * Live deltas for one roster, scored from this Euroleague season's box scores.
 */
export async function readMemberDeals(
  leagueId: string,
  memberId: string,
  season: string,
  teamNames: Readonly<Record<string, string>>,
): Promise<DealView[]> {
  const session = await getSession();
  if (!session) return [];

  const pb = createUserClient(session.token);
  const rows = await pb.collection("transactions").getFullList<StoredTx>({
    filter: `league = '${leagueId}'`,
    requestKey: null,
  });
  const transactions: (ImpactTransaction & { members: string[] })[] =
    rows.flatMap((row) => {
      if (row.type !== "trade" && row.type !== "add" && row.type !== "drop") {
        return [];
      }
      return [
        {
          id: row.id,
          type: row.type,
          fromRound: row.from_round,
          members: asMemberIds(row.members),
          playersIn: asIdMap(row.players_in),
          playersOut: asIdMap(row.players_out),
        },
      ];
    });

  const playerIds = [
    ...new Set(
      transactions.flatMap((tx) => [
        ...(tx.playersIn[memberId] ?? []),
        ...(tx.playersOut[memberId] ?? []),
      ]),
    ),
  ];
  const lines =
    playerIds.length === 0
      ? []
      : await pb.collection("player_game_stats").getFullList<{
          player: string;
          round: number;
          fantasy_pts: number;
          pir: number;
        }>({
          filter: `(${playerIds.map((id) => `player = '${id}'`).join(" || ")}) && season = "${season}"`,
          fields: "player,round,fantasy_pts,pir",
          requestKey: null,
        });

  const names = new Map<string, string>();
  if (playerIds.length > 0) {
    const people = await pb.collection("players").getFullList<{
      id: string;
      name: string;
    }>({
      filter: playerIds.map((id) => `id = '${id}'`).join(" || "),
      fields: "id,name",
      requestKey: null,
    });
    for (const person of people) names.set(person.id, person.name);
  }

  const weights = await readLineupWeights(
    pb,
    leagueId,
    season,
    [...new Set(lines.map((line) => line.round))],
    [memberId],
  );
  const scored = impactForMember(
    memberId,
    transactions,
    lines.map((line) => ({
      playerId: line.player,
      round: line.round,
      fantasyTenths: line.fantasy_pts,
      pir: line.pir,
    })),
    weights,
  );

  const label = (id: string) => names.get(id) ?? id;
  const team = (id: string) => teamNames[id] ?? id;

  return scored.map((deal) => {
    const tx = transactions.find((row) => row.id === deal.transactionId);
    const other =
      tx?.members.find((id) => id !== memberId) ??
      [
        ...Object.keys(tx?.playersIn ?? {}),
        ...Object.keys(tx?.playersOut ?? {}),
      ].find((id) => id !== memberId) ??
      "";
    const sentence =
      deal.type === "trade"
        ? announceTrade({
            teamA: team(memberId),
            teamB: team(other),
            sent: deal.outIds.map(label),
            received: deal.inIds.map(label),
            fromRound: deal.fromRound,
          })
        : deal.type === "drop"
          ? announceDrop({
              teamName: team(memberId),
              players: deal.outIds.map(label),
              fromRound: deal.fromRound,
            })
          : announceAdd({
              teamName: team(memberId),
              players: deal.inIds.map(label),
              fromRound: deal.fromRound,
            });
    return {
      id: deal.transactionId,
      sentence,
      impactSentence: announceImpact({
        type: deal.type,
        deltaTenths: deal.deltaTenths,
      }),
      deltaTenths: deal.deltaTenths,
      deltaPir: deal.deltaPir,
      byRound: deal.byRound.map((row) => ({
        round: row.round,
        deltaTenths: row.deltaTenths,
      })),
    };
  });
}

/** A recorded transaction, said the way the league already hears it. */
export type TransactionLine = {
  readonly id: string;
  readonly type: "trade" | "add" | "drop";
  readonly fromRound: number;
  readonly sentence: string;
};

/**
 * The league's recent transactions, newest first — the dashboard's news panel.
 *
 * ## Why it borrows the chat's sentences
 *
 * 5.2 already announces every recorded deal in chat, through `announceTrade` /
 * `announceAdd` / `announceDrop`. Those functions are reused verbatim here
 * rather than a second phrasing being written for the panel: a dashboard that
 * described the same deal in different words from the transcript six inches to
 * its right would read as two different events, and the league would have to
 * work out whether it was one. One voice, two surfaces.
 *
 * Players are resolved in a single read of the ids the transactions actually
 * mention, not of the whole pool: this runs on the lobby, which is the page
 * everybody opens.
 */
export async function readRecentTransactions(
  leagueId: string,
  teamNames: Readonly<Record<string, string>>,
  limit = 6,
): Promise<TransactionLine[]> {
  const session = await getSession();
  if (!session) return [];

  const pb = createUserClient(session.token);
  const rows = await pb.collection("transactions").getFullList<StoredTx>({
    filter: `league = '${leagueId}'`,
    sort: "-date,-created",
    requestKey: null,
  });
  if (rows.length === 0) return [];

  const wanted = new Set<string>();
  for (const row of rows.slice(0, limit)) {
    for (const ids of Object.values(asIdMap(row.players_in))) {
      for (const id of ids) wanted.add(id);
    }
    for (const ids of Object.values(asIdMap(row.players_out))) {
      for (const id of ids) wanted.add(id);
    }
  }

  const names = new Map<string, string>();
  if (wanted.size > 0) {
    const players = await pb
      .collection("players")
      .getFullList<{ id: string; name: string }>({
        filter: [...wanted].map((id) => `id = '${id}'`).join(" || "),
        fields: "id,name",
        requestKey: null,
      });
    for (const player of players) names.set(player.id, player.name);
  }
  // A player whose row is gone still has to appear: a deal with a blank in it
  // is confusing, a deal that vanished is worse.
  const named = (ids: readonly string[]) =>
    ids.map((id) => names.get(id) ?? "a player");
  const team = (memberId: string) => teamNames[memberId] ?? "A team";

  return rows.slice(0, limit).flatMap((row): TransactionLine[] => {
    const incoming = asIdMap(row.players_in);
    const outgoing = asIdMap(row.players_out);
    const members = Object.keys({ ...incoming, ...outgoing });

    if (row.type === "add" || row.type === "drop") {
      const memberId = members[0];
      if (!memberId) return [];
      const players = named(
        row.type === "add"
          ? (incoming[memberId] ?? [])
          : (outgoing[memberId] ?? []),
      );
      if (players.length === 0) return [];
      const sentence =
        row.type === "add"
          ? announceAdd({
              teamName: team(memberId),
              players,
              fromRound: row.from_round,
            })
          : announceDrop({
              teamName: team(memberId),
              players,
              fromRound: row.from_round,
            });
      return [
        { id: row.id, type: row.type, fromRound: row.from_round, sentence },
      ];
    }

    if (row.type !== "trade") return [];
    const [a, b] = members;
    if (!a || !b) return [];
    return [
      {
        id: row.id,
        type: "trade" as const,
        fromRound: row.from_round,
        sentence: announceTrade({
          teamA: team(a),
          teamB: team(b),
          sent: named(outgoing[a] ?? []),
          received: named(incoming[a] ?? []),
          fromRound: row.from_round,
        }),
      },
    ];
  });
}
