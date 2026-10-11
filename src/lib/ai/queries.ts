import "server-only";

import type { Ref } from "@/lib/nav/urls";
import { createUserClient } from "@/lib/pb/server";

import { storedReasons } from "./scout-reasons";
import type { WriteupRecord } from "./store";
import type { TokenRef } from "./tokens";
import { briefView, failureKind, writeupView, type BriefView, type WriteupView } from "./view";
import type { Voice } from "./voice";

/**
 * One round's write-up for a page — slice 7.1. Read with the viewer's token,
 * so `ai_writeups`' league-membership rule still decides who sees it; never
 * calls the model. Null when the round has no row at all.
 */

export type WriteupState = "written" | "rewriting" | "failed";

export type RoundWriteupRead = {
  /** The prose to show, or null when there is none worth showing yet. */
  readonly view: WriteupView | null;
  readonly state: WriteupState;
  readonly failure: "guard" | "google" | null;
  readonly writtenAt: string | null;
  readonly voice: Voice;
  /** Player id → address parts, for the links in the prose. */
  readonly players: Readonly<Record<string, Ref>>;
};

export async function readRoundWriteup({
  token,
  leagueId,
  season,
  round,
  teamNames,
}: {
  token: string;
  leagueId: string;
  season: string;
  round: number;
  teamNames: Readonly<Record<string, string>>;
}): Promise<RoundWriteupRead | null> {
  if (!/^[A-Za-z0-9]+$/.test(leagueId) || !/^E\d{4}$/.test(season) || !Number.isInteger(round)) return null;
  const pb = createUserClient(token);
  const rows = await pb.collection("ai_writeups").getFullList<WriteupRecord & { member: string }>({
    filter: `league = '${leagueId}' && season = "${season}" && round = ${round} && kind = 'round_summary' && member = ''`,
    requestKey: null,
  });
  const row = rows[0];
  if (!row) return null;

  const players = await playersIn(pb, row.refs);
  const view = writeupView(row.output, row.refs, { members: teamNames, players: players.names });
  const state: WriteupState =
    row.status === "pending" || row.rewrite_requested_at ? "rewriting" : row.status === "failed" ? "failed" : "written";

  return {
    view,
    state,
    failure: state === "failed" ? failureKind(row.error) : null,
    writtenAt: row.generated_at || null,
    voice: row.voice,
    players: players.refs,
  };
}

/** The players a row's refs name: their stored names, and the parts of their addresses. */
async function playersIn(pb: ReturnType<typeof createUserClient>, refs: unknown) {
  const playerIds = Object.values((refs ?? {}) as Record<string, TokenRef>).flatMap((ref) =>
    ref?.kind === "player" && /^[A-Za-z0-9]+$/.test(ref.id) ? [ref.id] : [],
  );
  const players =
    playerIds.length === 0
      ? []
      : await pb.collection("players").getFullList<{ id: string; name: string; slug?: string }>({
          filter: playerIds.map((id) => `id = '${id}'`).join(" || "),
          fields: "id,name,slug",
          requestKey: null,
        });
  return {
    names: Object.fromEntries(players.map((player) => [player.id, player.name])),
    refs: Object.fromEntries(players.map((player) => [player.id, { id: player.id, slug: player.slug } satisfies Ref])),
  };
}

/**
 * The viewer's own brief for one round — 7.3 D. Read with their token, and
 * the filter names their member as well: `ai_writeups`' rule already confines
 * a private row to its member, so no other member's brief can come back.
 * Null when there is no row, the row failed, or its output is not three lines
 * this version can show; a row being rewritten keeps showing what it had.
 */
export async function readRoundBrief({
  token,
  leagueId,
  season,
  round,
  memberId,
  teamNames,
}: {
  token: string;
  leagueId: string;
  season: string;
  round: number;
  memberId: string;
  teamNames: Readonly<Record<string, string>>;
}): Promise<{ readonly view: BriefView; readonly players: Readonly<Record<string, Ref>> } | null> {
  if (![leagueId, memberId].every((id) => /^[A-Za-z0-9]+$/.test(id)) || !/^E\d{4}$/.test(season) || !Number.isInteger(round)) {
    return null;
  }
  const pb = createUserClient(token);
  const rows = await pb.collection("ai_writeups").getFullList<WriteupRecord>({
    filter: `league = '${leagueId}' && season = "${season}" && round = ${round} && kind = 'round_brief' && member = '${memberId}'`,
    fields: "status,output,refs",
    requestKey: null,
  });
  const row = rows[0];
  if (!row || row.status === "failed") return null;
  const players = await playersIn(pb, row.refs);
  const view = briefView(row.output, row.refs, { members: teamNames, players: players.names });
  return view ? { view, players: players.refs } : null;
}

/**
 * The viewer's own scout reasons from their latest round — 7.2 G. Read with
 * their token: `ai_writeups`' rule confines a member's row to that member, so
 * nobody else's advice can come back. Only the latest round's row counts: an
 * older round's reasons are not re-guarded, so they are never a fallback.
 * Null when the member has no row at all.
 */
export async function readScoutReasons({
  token,
  leagueId,
  season,
  memberId,
}: {
  token: string;
  leagueId: string;
  season: string;
  memberId: string;
}): Promise<{
  readonly status: "pending" | "ready" | "failed";
  readonly reasons: Readonly<Record<string, string>>;
  readonly refs: Readonly<Record<string, TokenRef>>;
} | null> {
  if (![leagueId, memberId].every((id) => /^[A-Za-z0-9]+$/.test(id)) || !/^E\d{4}$/.test(season)) return null;
  const rows = await createUserClient(token)
    .collection("ai_writeups")
    .getList<WriteupRecord>(1, 1, {
      filter: `league = '${leagueId}' && season = "${season}" && kind = 'scout_moves' && member = '${memberId}'`,
      sort: "-round",
      requestKey: null,
    });
  const row = rows.items[0];
  if (!row) return null;
  const reasons = row.status === "ready" ? (storedReasons(row.output) ?? {}) : {};
  return { status: row.status, reasons, refs: (row.refs ?? {}) as Record<string, TokenRef> };
}
