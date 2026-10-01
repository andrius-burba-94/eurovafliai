import { displayName } from "@/lib/players/name";
import "server-only";

import {
  announceAdd,
  announceDrop,
  announceExchange,
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

import { groupTransactionHistory } from "./history";
import type { Seat } from "./plan";
import { listActiveMemberships } from "./store";

type ExpandedPlayer = {
  id: string;
  name: string;
  club_code: string;
  club_name: string;
  person_code?: string;
  position: Position;
  status?: string;
  proj_last5_games?: number;
  proj_last5_pirs?: unknown;
};

type MembershipRow = {
  id: string;
  player: string;
  member: string;
  from_round?: number | null;
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
  readonly personCode?: string;
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
  /** Availability as stored: active, injured, doubtful or left. */
  readonly status?: string;
  /** Fantasy tenths this season while on this roster; raw, before lineup multipliers. */
  readonly seasonTenths: number;
  /** Games counted in `seasonTenths`. */
  readonly games: number;
  /** The latest counted round's tenths for this player, or null if they did not play it. */
  readonly lastTenths: number | null;
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
  const code = season.replace(/[^A-Za-z0-9]/g, "");
  const lines =
    mine.length === 0
      ? []
      : await pb.collection("player_game_stats").getFullList<{ player: string; round: number; fantasy_pts: number }>({
          filter: `(${mine.map((row) => `player = '${row.player}'`).join(" || ")}) && season = "${code}"`,
          fields: "player,round,fantasy_pts",
          requestKey: null,
        });
  const latestRound = Math.max(0, ...lines.map((line) => line.round));
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
        personCode: player.person_code,
        position: player.position,
        overallNo: overallByPlayer.get(player.id) ?? null,
        last5Pirs: last5SeriesOf(player),
        fixture: fixtures.get(player.club_code) ?? null,
        status: player.status,
        ...(() => {
          const from = row.from_round && row.from_round > 0 ? row.from_round : 1;
          const owned = lines.filter((line) => line.player === player.id && line.round >= from);
          const last = owned.find((line) => line.round === latestRound);
          return {
            seasonTenths: owned.reduce((sum, line) => sum + line.fantasy_pts, 0),
            games: owned.length,
            lastTenths: last ? last.fantasy_pts : null,
          };
        })(),
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
  note?: string;
  date?: string;
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
    for (const person of people) names.set(person.id, displayName(person.name));
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
 * Recent roster events, newest first. An unambiguous free-agent drop/add pair
 * is presented as one exchange; independent writes remain separate. Player
 * names are resolved in one read after grouping, so `limit` counts events.
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
  const events = groupTransactionHistory(rows).slice(0, limit);
  for (const event of events) {
    for (const row of event.rows) {
      for (const ids of Object.values(asIdMap(row.players_in))) {
        for (const id of ids) wanted.add(id);
      }
      for (const ids of Object.values(asIdMap(row.players_out))) {
        for (const id of ids) wanted.add(id);
      }
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
    for (const player of players) names.set(player.id, displayName(player.name));
  }
  // A player whose row is gone still has to appear: a deal with a blank in it
  // is confusing, a deal that vanished is worse.
  const named = (ids: readonly string[]) =>
    ids.map((id) => names.get(id) ?? "a player");
  const team = (memberId: string) => teamNames[memberId] ?? "A team";

  return events.flatMap((event): TransactionLine[] => {
    if (event.exchange) {
      const { memberId, acquiredId, releasedId } = event.exchange;
      const row = event.rows[0]!;
      return [{
        id: row.id,
        type: "trade",
        fromRound: row.from_round,
        sentence: announceExchange({
          teamName: team(memberId),
          released: names.get(releasedId) ?? "a player",
          acquired: names.get(acquiredId) ?? "a player",
          fromRound: row.from_round,
        }),
      }];
    }
    const row = event.rows[0]!;
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

/** One side of a recorded deal: who it was, what went each way, what it has earned. */
export type DealSide = {
  readonly memberId: string;
  readonly inIds: readonly string[];
  readonly outIds: readonly string[];
  /** Live fantasy tenths since `fromRound`, lineup-weighted — `impactForMember`. */
  readonly deltaTenths: number;
};

export type LeagueDeal = {
  readonly id: string;
  /** "exchange" is a free-agent drop and add recorded as one move. */
  readonly kind: "trade" | "exchange" | "add" | "drop";
  readonly fromRound: number;
  readonly date: string;
  readonly note: string;
  readonly sides: readonly DealSide[];
};

export type DealPlayer = {
  readonly name: string;
  readonly personCode?: string;
  readonly position?: Position;
  readonly clubCode?: string;
};

export type LeagueDeals = {
  readonly deals: readonly LeagueDeal[];
  readonly players: Readonly<Record<string, DealPlayer>>;
  /** Net tenths per member across every deal they were in, and how many. */
  readonly ledger: Readonly<Record<string, { readonly netTenths: number; readonly deals: number }>>;
};

/**
 * Every recorded deal in a league, newest first, with each side's live verdict.
 * One read of transactions, the players they name and those players' box
 * scores this season; the verdict is the same `impactForMember` the team page
 * and the recap use, so the three can never disagree about a deal.
 */
export async function readLeagueDeals(leagueId: string, season: string): Promise<LeagueDeals> {
  const empty: LeagueDeals = { deals: [], players: {}, ledger: {} };
  const session = await getSession();
  if (!session) return empty;

  const pb = createUserClient(session.token);
  const rows = await pb.collection("transactions").getFullList<StoredTx>({
    filter: `league = '${leagueId}'`,
    sort: "-date,-created",
    requestKey: null,
  });
  if (rows.length === 0) return empty;

  const transactions: ImpactTransaction[] = rows.flatMap((row) =>
    row.type === "trade" || row.type === "add" || row.type === "drop"
      ? [
          {
            id: row.id,
            type: row.type,
            fromRound: row.from_round,
            playersIn: asIdMap(row.players_in),
            playersOut: asIdMap(row.players_out),
          },
        ]
      : [],
  );
  const playerIds = [
    ...new Set(transactions.flatMap((tx) => [...Object.values(tx.playersIn).flat(), ...Object.values(tx.playersOut).flat()])),
  ];
  const memberIds = [
    ...new Set(transactions.flatMap((tx) => [...Object.keys(tx.playersIn), ...Object.keys(tx.playersOut)])),
  ];
  const idFilter = playerIds.map((id) => `id = '${id}'`).join(" || ");
  const [lines, people] =
    playerIds.length === 0
      ? [[], []]
      : await Promise.all([
          pb.collection("player_game_stats").getFullList<{ player: string; round: number; fantasy_pts: number; pir: number }>({
            filter: `(${playerIds.map((id) => `player = '${id}'`).join(" || ")}) && season = "${season}"`,
            fields: "player,round,fantasy_pts,pir",
            requestKey: null,
          }),
          pb.collection("players").getFullList<{ id: string; name: string; person_code?: string; position?: Position; club_code?: string }>({
            filter: idFilter,
            fields: "id,name,person_code,position,club_code",
            requestKey: null,
          }),
        ]);

  const weights = await readLineupWeights(pb, leagueId, season, [...new Set(lines.map((line) => line.round))], memberIds);
  const impactLines = lines.map((line) => ({ playerId: line.player, round: line.round, fantasyTenths: line.fantasy_pts, pir: line.pir }));
  const deltaOf = new Map<string, number>();
  for (const memberId of memberIds) {
    for (const deal of impactForMember(memberId, transactions, impactLines, weights)) {
      deltaOf.set(`${deal.transactionId}|${memberId}`, deal.deltaTenths);
    }
  }

  const deals: LeagueDeal[] = groupTransactionHistory(rows).map((event) => {
    const first = event.rows[0]!;
    const members = [...new Set(event.rows.flatMap((row) => [...Object.keys(asIdMap(row.players_in)), ...Object.keys(asIdMap(row.players_out))]))];
    const sides = members.map((memberId) => ({
      memberId,
      inIds: event.rows.flatMap((row) => asIdMap(row.players_in)[memberId] ?? []),
      outIds: event.rows.flatMap((row) => asIdMap(row.players_out)[memberId] ?? []),
      deltaTenths: event.rows.reduce((sum, row) => sum + (deltaOf.get(`${row.id}|${memberId}`) ?? 0), 0),
    }));
    return {
      id: first.id,
      kind: event.exchange ? "exchange" : (first.type as LeagueDeal["kind"]),
      fromRound: first.from_round,
      date: first.date ?? "",
      note: first.note?.trim() ?? "",
      sides,
    };
  });

  const ledger: Record<string, { netTenths: number; deals: number }> = {};
  for (const deal of deals) {
    for (const side of deal.sides) {
      const entry = (ledger[side.memberId] ??= { netTenths: 0, deals: 0 });
      entry.netTenths += side.deltaTenths;
      entry.deals += 1;
    }
  }

  return {
    deals,
    players: Object.fromEntries(
      people.map((person) => [
        person.id,
        { name: person.name, personCode: person.person_code, position: person.position, clubCode: person.club_code },
      ]),
    ),
    ledger,
  };
}
