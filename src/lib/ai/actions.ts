"use server";

import { requireSession } from "@/lib/auth/session";
import { serverConfig } from "@/lib/config/server";
import { parseLeagueSettings } from "@/lib/leagues/settings";
import type { LeagueRecord } from "@/lib/leagues/types";
import { revalidateLeague } from "@/lib/nav/revalidate";
import { getSuperuserClient } from "@/lib/pb/superuser";

import { readWriteup, requestRewrite } from "./store";

export type RewriteResult = {
  error: string | null;
  /** The round asked for, so a panel can tell its own request from an older one. */
  requested?: number;
};

/**
 * The commissioner's Rewrite this round (7.1, ADR-0013). It only marks the
 * row: the worker's one-minute check does the writing, so no request waits
 * on Google and only the worker ever writes prose. A round with no row has
 * nothing to rewrite — the next pass writes it anyway.
 */
export async function requestRoundRewrite(_previous: RewriteResult, formData: FormData): Promise<RewriteResult> {
  const session = await requireSession();
  const leagueId = String(formData.get("leagueId") ?? "");
  const round = Number(formData.get("round"));
  // The round's own season, from the page: Recap reads past seasons too, but
  // the worker only writes the current one, so only its rounds are rewritten.
  const season = String(formData.get("season") ?? "");
  if (!/^[A-Za-z0-9]+$/.test(leagueId) || !/^E\d{4}$/.test(season) || !Number.isInteger(round) || round < 1) {
    return { error: "That is not yours to change." };
  }
  if (season !== serverConfig().EUROLEAGUE_SEASON) {
    return { error: "Only this season's rounds can be rewritten." };
  }

  const pb = await getSuperuserClient();
  const league = await pb
    .collection("leagues")
    .getOne<LeagueRecord>(leagueId, { requestKey: null })
    .catch(() => null);
  if (!league || league.commissioner !== session.user.id) {
    return { error: "Only the commissioner can rewrite a round." };
  }
  if (!parseLeagueSettings(league.settings).ai.enabled) {
    return { error: "Write-ups are off for this league." };
  }

  const key = { leagueId, season, round, kind: "round_summary" as const, memberId: "" };
  const row = await readWriteup(pb, key);
  if (!row || row.status === "pending") {
    return { error: row ? "This round is being written now." : "This round has not been written yet." };
  }

  try {
    await requestRewrite(pb, row.id, Date.now());
  } catch {
    return { error: "Could not ask for that. Try again." };
  }
  revalidateLeague();
  return { error: null, requested: round };
}
