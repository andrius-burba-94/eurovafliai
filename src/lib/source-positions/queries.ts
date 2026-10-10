import "server-only";

import { getSession } from "@/lib/auth/session";
import type { Position } from "@/lib/engine";
import { createUserClient } from "@/lib/pb/server";
import { getSuperuserClient } from "@/lib/pb/superuser";
import { displayName } from "@/lib/players/name";

import type { PositionSource } from "./plan";

export type PositionQuestionView = {
  readonly id: string;
  readonly kind: "player" | "roster";
  readonly source: PositionSource;
  readonly leagueName: string;
  readonly player?: { readonly id: string; readonly name: string; readonly clubCode: string };
  readonly stored?: Position;
  readonly read?: Position;
  readonly teamName?: string;
  readonly roster?: readonly { readonly player: string; readonly name: string; readonly position: Position }[];
};

type QuestionRecord = {
  id: string;
  kind: "player" | "roster";
  source: PositionSource;
  stored_position?: Position | "";
  read_position?: Position | "";
  roster?: { player: string; position: Position }[] | null;
  expand?: {
    league?: { name: string };
    player?: { id: string; name: string; club_code: string };
    member?: { team_name?: string };
  };
};

/**
 * Open position questions in the leagues the viewer manages. Read with the
 * viewer's token: the collection's rule is what keeps another league's
 * questions, and a plain member, out.
 */
export async function readPositionQuestions(): Promise<PositionQuestionView[]> {
  const session = await getSession();
  if (!session) return [];
  const pb = createUserClient(session.token);
  const rows = await pb.collection("position_questions").getFullList<QuestionRecord>({
    filter: "status = 'open'",
    sort: "created",
    expand: "league,player,member",
    requestKey: null,
  });

  const rosterIds = [...new Set(rows.flatMap((row) => (row.roster ?? []).map((seat) => seat.player)))];
  const names = new Map<string, string>();
  if (rosterIds.length > 0) {
    const players = await pb.collection("players").getFullList<{ id: string; name: string }>({
      filter: rosterIds.map((id) => `id = '${id}'`).join(" || "),
      fields: "id,name",
      requestKey: null,
    });
    for (const player of players) names.set(player.id, displayName(player.name));
  }

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    source: row.source,
    leagueName: row.expand?.league?.name ?? "",
    ...(row.kind === "player" && row.expand?.player
      ? {
          player: { id: row.expand.player.id, name: displayName(row.expand.player.name), clubCode: row.expand.player.club_code },
          stored: row.stored_position || undefined,
          read: row.read_position || undefined,
        }
      : {}),
    ...(row.kind === "roster"
      ? {
          teamName: row.expand?.member?.team_name?.trim() || "A team",
          roster: (row.roster ?? []).map((seat) => ({ ...seat, name: names.get(seat.player) ?? "Unknown player" })),
        }
      : {}),
  }));
}

/**
 * How many position questions stand in the leagues this user manages: the
 * doorbell's share. Superuser, because the doorbell's other counts are; the
 * filter reproduces the collection's read rule.
 */
export async function countPositionQuestions(userId: string): Promise<number> {
  const pb = await getSuperuserClient();
  const [commissioned, deputised] = await Promise.all([
    pb.collection("leagues").getFullList<{ id: string }>({ filter: `commissioner = '${userId}'`, fields: "id", requestKey: null }),
    pb.collection("league_members").getFullList<{ league: string }>({
      filter: `user = '${userId}' && can_manage = true`,
      fields: "league",
      requestKey: null,
    }),
  ]);
  const leagues = [...new Set([...commissioned.map((row) => row.id), ...deputised.map((row) => row.league)])];
  if (leagues.length === 0) return 0;
  const open = await pb.collection("position_questions").getList(1, 1, {
    filter: `status = 'open' && (${leagues.map((id) => `league = '${id}'`).join(" || ")})`,
    fields: "id",
    requestKey: null,
  });
  return open.totalItems;
}
