import "server-only";

import { getSuperuserClient } from "@/lib/pb/superuser";
import { normalizeName } from "@/lib/rosters/normalize";
import { rankCandidates } from "@/lib/rosters/rename";

/**
 * What the mapping page needs to render — slice 4.2.
 *
 * The unmatched-code half is read from **stored `stat_imports` batches** rather
 * than recomputed: 4.3 already wrote down every code it could not attach, with
 * the games it appeared in and the name the feed used, and re-deriving that
 * would mean re-fetching box scores to learn something already recorded. This
 * is the audit trail being used as an audit trail.
 *
 * The rename half is read from **the newest stored check**, with its age shown.
 * The first draft did not read it at all, on the grounds that a stale proposal
 * invites somebody to confirm a merge against a pool that has moved — but that
 * risk is answered where it has to be answered anyway: `confirmRename`
 * re-validates against live player rows and refuses a code that has since been
 * taken. What the first draft actually produced was worse: resolve three of
 * fifteen, navigate away, come back to nothing, and pay 21 more requests to see
 * the other twelve again.
 *
 * So the page shows the last check and says when it was taken; `checkTheFeed`
 * replaces it. Both halves are then reachable without a network, which is also
 * what makes the confirm and reject guards testable in a browser.
 */

export type UnmatchedCode = {
  readonly personCode: string;
  /** The name the feed used, when the source gave one. */
  readonly name: string | null;
  readonly clubCode: string | null;
  /** Game codes this person appeared in and could not be stored for. */
  readonly games: number[];
  readonly season: string;
  /** Pool players this might be, best first. Empty when there is no name. */
  readonly candidates: {
    readonly id: string;
    readonly name: string;
    readonly clubCode: string;
    readonly hasCode: boolean;
  }[];
};

type StatBatch = {
  id: string;
  season: string;
  created: string;
  plan?: {
    unmatched?: {
      personCode?: string;
      lines?: number[];
      name?: string | null;
      clubCode?: string | null;
    }[];
  };
};

export type StoredCheck = {
  readonly batchId: string;
  readonly checkedAt: string;
  readonly renames: {
    readonly existingId: string;
    readonly existingName: string;
    readonly clubCode: string;
    readonly incomingName: string;
    readonly personCode: string;
    readonly confidence: "likely" | "candidate";
    readonly reason: string;
    readonly alternatives: { name: string; personCode: string }[];
  }[];
  readonly adds: number;
  readonly leaving: number;
};

type RosterBatch = {
  id: string;
  created: string;
  applied?: boolean;
  diff?: {
    adds?: unknown[];
    leaving?: unknown[];
    renames?: {
      existing?: { id?: string; name?: string; club_code?: string };
      incoming?: { name?: string; person_code?: string };
      confidence?: "likely" | "candidate";
      reason?: string;
      alternatives?: { name?: string; person_code?: string }[];
    }[];
  };
};

/**
 * A stored feed check — the one named, or the newest, or null.
 *
 * The newest is the default and the useful one. Reading the last few batches
 * rather than only the latest matters because a *sync* also writes batches and
 * only a mapping check carries renames, so "the newest batch" and "the newest
 * batch worth reading here" are different questions.
 *
 * `batchId` addresses one directly. That exists for two reasons and both are
 * real: a check is an audit record worth being able to return to by link, and
 * "the newest check" is **app-global** — which made two parallel specs, each
 * planting its own check, silently answer each other's questions. Every
 * app-global read in this repo has now taught the same lesson at least once
 * (`sweepOnce`, the cheat-sheet fixture, the chat fixture).
 *
 * Proposals whose stored player has since gained a code, or whose code has
 * since been taken, are dropped on the way out: those are questions somebody
 * has already answered, and asking twice is how a surface gets ignored.
 */
export async function readLatestCheck(
  batchId?: string,
): Promise<StoredCheck | null> {
  const pb = await getSuperuserClient();

  let batch: RosterBatch | undefined;
  if (batchId) {
    batch =
      (await pb
        .collection("roster_imports")
        .getOne<RosterBatch>(batchId, { requestKey: null })
        .catch(() => undefined)) ?? undefined;
    if ((batch?.diff?.renames?.length ?? 0) === 0) batch = undefined;
  } else {
    const batches = await pb
      .collection("roster_imports")
      .getList<RosterBatch>(1, 10, { sort: "-created", requestKey: null });
    batch = batches.items.find(
      (candidate) => (candidate.diff?.renames?.length ?? 0) > 0,
    );
  }
  if (!batch) return null;

  const players = await pb
    .collection("players")
    .getFullList<PoolPlayer>({ requestKey: null });
  const byId = new Map(players.map((player) => [player.id, player]));
  const takenCodes = new Set(
    players.map((player) => player.person_code).filter(Boolean),
  );

  const renames = (batch.diff?.renames ?? []).flatMap((proposal) => {
    const existingId = proposal.existing?.id;
    const personCode = proposal.incoming?.person_code;
    if (!existingId || !personCode) return [];

    const player = byId.get(existingId);
    // Gone from the pool, or already answered — either way, not a question.
    if (!player || player.person_code) return [];
    if (takenCodes.has(personCode)) return [];

    return [
      {
        existingId,
        existingName: proposal.existing?.name ?? player.name,
        clubCode: proposal.existing?.club_code ?? player.club_code,
        incomingName: proposal.incoming?.name ?? "(unnamed)",
        personCode,
        confidence: proposal.confidence === "likely" ? "likely" : "candidate",
        reason: proposal.reason ?? "",
        alternatives: (proposal.alternatives ?? [])
          .filter((row) => row.person_code)
          .map((row) => ({
            name: row.name ?? "(unnamed)",
            personCode: row.person_code!,
          })),
      } as const,
    ];
  });

  return {
    batchId: batch.id,
    checkedAt: batch.created,
    renames,
    adds: batch.diff?.adds?.length ?? 0,
    leaving: batch.diff?.leaving?.length ?? 0,
  };
}

type PoolPlayer = {
  id: string;
  name: string;
  name_normalized?: string;
  club_code: string;
  person_code?: string;
};

/**
 * Every code recent imports could not attach, newest batch first.
 *
 * Deduplicated by code across batches, because the fetcher reports the same
 * unmatched code once per pass that meets it — twenty passes over one round
 * would otherwise show the same player twenty times. The game list is the
 * union, so attaching the code re-imports every game it was seen in rather
 * than only the most recent.
 */
export async function readUnmatchedCodes(limit = 20): Promise<UnmatchedCode[]> {
  const pb = await getSuperuserClient();

  const batches = await pb
    .collection("stat_imports")
    .getList<StatBatch>(1, limit, { sort: "-created", requestKey: null });

  const players = await pb
    .collection("players")
    .getFullList<PoolPlayer>({ requestKey: null });

  const byCode = new Set(
    players.map((player) => player.person_code).filter(Boolean),
  );

  const merged = new Map<string, UnmatchedCode>();

  for (const batch of batches.items) {
    for (const entry of batch.plan?.unmatched ?? []) {
      const personCode = entry.personCode;
      if (!personCode) continue;
      // Somebody has since mapped it, here or through a roster sync. A resolved
      // question must not keep being asked.
      if (byCode.has(personCode)) continue;

      const existing = merged.get(personCode);
      const games = [
        ...new Set([...(existing?.games ?? []), ...(entry.lines ?? [])]),
      ].sort((a, b) => a - b);

      merged.set(personCode, {
        personCode,
        name: existing?.name ?? entry.name ?? null,
        clubCode: existing?.clubCode ?? entry.clubCode ?? null,
        games,
        season: existing?.season ?? batch.season,
        candidates: [],
      });
    }
  }

  return [...merged.values()].map((entry) => ({
    ...entry,
    candidates: suggest(entry, players),
  }));
}

/**
 * Pool players an unmatched code might belong to.
 *
 * Ranked by the same fuse helper the rename pass uses, and **restricted to
 * players with no code of their own** — a player who already has a code is not
 * a candidate for a second one, and offering them would invite exactly the
 * two-codes-on-one-player state the pipeline refuses elsewhere.
 *
 * Club narrows it when the source told us one. It usually did: a box score
 * knows which side a line was on.
 */
function suggest(
  entry: UnmatchedCode,
  players: PoolPlayer[],
): UnmatchedCode["candidates"] {
  if (!entry.name) return [];

  const codeless = players.filter((player) => !player.person_code);
  const pool = entry.clubCode
    ? codeless.filter((player) => player.club_code === entry.clubCode)
    : codeless;
  if (pool.length === 0) return [];

  const ranked = rankCandidates(
    normalizeName(entry.name),
    pool.map((player) => ({
      key: player.name_normalized ?? normalizeName(player.name),
      value: player,
    })),
  );

  return ranked.slice(0, 6).map((player) => ({
    id: player.id,
    name: player.name,
    clubCode: player.club_code,
    hasCode: Boolean(player.person_code),
  }));
}
