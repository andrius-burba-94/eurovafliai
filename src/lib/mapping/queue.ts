/**
 * What the mapping queue still holds, and the sentence that says so.
 *
 * Pure: no PocketBase, no network. `queries.ts` does the reading and calls in
 * here to decide what survives as a real question.
 *
 * The split exists for one reason. A doorbell that rings for work the page then
 * does not show is worse than no doorbell — it teaches a commissioner that the
 * notice is noise, which is the state 4.2 already shipped in. So the count and
 * the page are the *same* filter, called twice, rather than two filters that
 * agree today.
 */

export type PoolPlayerRow = {
  readonly id: string;
  readonly name: string;
  readonly name_normalized?: string;
  readonly club_code: string;
  readonly person_code?: string;
};

export type RenameBatch = {
  readonly id: string;
  readonly created: string;
  readonly applied?: boolean;
  readonly diff?: {
    readonly adds?: unknown[];
    readonly leaving?: unknown[];
    readonly renames?: {
      readonly existing?: { id?: string; name?: string; club_code?: string };
      readonly incoming?: { name?: string; person_code?: string };
      readonly confidence?: "likely" | "candidate";
      readonly reason?: string;
      readonly alternatives?: { name?: string; person_code?: string }[];
    }[];
  };
};

export type CodeBatch = {
  readonly id: string;
  readonly season: string;
  readonly created: string;
  readonly plan?: {
    readonly unmatched?: {
      readonly personCode?: string;
      readonly lines?: number[];
      readonly name?: string | null;
      readonly clubCode?: string | null;
    }[];
  };
};

export type RenameProposal = {
  readonly existingId: string;
  readonly existingName: string;
  readonly clubCode: string;
  readonly incomingName: string;
  readonly personCode: string;
  readonly confidence: "likely" | "candidate";
  readonly reason: string;
  readonly alternatives: { name: string; personCode: string }[];
};

export type StoredCheck = {
  readonly batchId: string;
  readonly checkedAt: string;
  readonly renames: RenameProposal[];
  readonly adds: number;
  readonly leaving: number;
};

/** An unmatched person code before candidates are ranked onto it. */
export type PendingCode = {
  readonly personCode: string;
  /** The name the feed used, when the source gave one. */
  readonly name: string | null;
  readonly clubCode: string | null;
  /** Game codes this person appeared in and could not be stored for. */
  readonly games: number[];
  readonly season: string;
};

export type UnmatchedCode = PendingCode & {
  /** Pool players this might be, best first. Empty when there is no name. */
  readonly candidates: {
    readonly id: string;
    readonly name: string;
    readonly clubCode: string;
    readonly hasCode: boolean;
  }[];
};

/**
 * The newest batch worth reading here.
 *
 * A *sync* also writes `roster_imports` batches and only some of them carry
 * renames, so "the newest batch" and "the newest batch with a question in it"
 * are different questions.
 */
export function newestCheckBatch<T extends RenameBatch>(
  batches: readonly T[],
): T | undefined {
  return batches.find((batch) => (batch.diff?.renames?.length ?? 0) > 0);
}

/**
 * The rename proposals in a batch that are still open questions.
 *
 * Proposals whose stored player has since gained a code, whose player is gone,
 * or whose code has since been taken are dropped: those are questions somebody
 * has already answered, and asking twice is how a surface gets ignored.
 */
export function pendingRenames(
  batch: RenameBatch | undefined,
  players: readonly PoolPlayerRow[],
): RenameProposal[] {
  if (!batch) return [];

  const byId = new Map(players.map((player) => [player.id, player]));
  const takenCodes = new Set(
    players.map((player) => player.person_code).filter(Boolean),
  );

  return (batch.diff?.renames ?? []).flatMap((proposal) => {
    const existingId = proposal.existing?.id;
    const personCode = proposal.incoming?.person_code;
    if (!existingId || !personCode) return [];

    const player = byId.get(existingId);
    if (!player || player.person_code) return [];
    if (takenCodes.has(personCode)) return [];

    return [
      {
        existingId,
        existingName: proposal.existing?.name ?? player.name,
        clubCode: proposal.existing?.club_code ?? player.club_code,
        incomingName: proposal.incoming?.name ?? "(unnamed)",
        personCode,
        confidence: (proposal.confidence === "likely"
          ? "likely"
          : "candidate") as "likely" | "candidate",
        reason: proposal.reason ?? "",
        alternatives: (proposal.alternatives ?? [])
          .filter((row) => row.person_code)
          .map((row) => ({
            name: row.name ?? "(unnamed)",
            personCode: row.person_code!,
          })),
      },
    ];
  });
}

/**
 * Every code recent imports could not attach, newest batch first.
 *
 * Deduplicated by code across batches, because the fetcher reports the same
 * unmatched code once per pass that meets it — twenty passes over one round
 * would otherwise show the same player twenty times. The game list is the
 * union, so attaching the code re-imports every game it was seen in rather
 * than only the most recent.
 */
export function pendingCodes(
  batches: readonly CodeBatch[],
  players: readonly PoolPlayerRow[],
): PendingCode[] {
  const byCode = new Set(
    players.map((player) => player.person_code).filter(Boolean),
  );

  const merged = new Map<string, PendingCode>();

  for (const batch of batches) {
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
      });
    }
  }

  return [...merged.values()];
}

/**
 * The unmatched codes a notice should actually chase: this season's.
 *
 * Measured rather than reasoned. A full E2025 backfill leaves **123** unmatched
 * codes against an E2026 pool, and none of them is work: they are last season's
 * players, who left the league and have nobody to attach to. A doorbell that
 * opened on "123 person codes belong to nobody" would be teaching the
 * commissioner to ignore it within a day — the exact failure this queue's
 * notice exists to avoid.
 *
 * A code from the season being *played* is the opposite: a live player whose
 * points are landing nowhere, which from the first game of the season is the
 * thing worth interrupting somebody for.
 *
 * `/players/mapping` deliberately still lists every season. It is the working
 * surface, where history is context; this is the notice, where history is noise.
 */
export function codesWorthChasing(
  codes: readonly PendingCode[],
  season: string,
): PendingCode[] {
  return codes.filter((code) => code.season === season);
}

/** A stored news item, as this module needs it — 9.4. */
export type NewsItemRow = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly club_name?: string;
  readonly headline: string;
  readonly published?: string;
  readonly player?: string;
  readonly url?: string;
};

/** A published name nobody in the pool answers to. */
export type UnmatchedNewsName = {
  readonly slug: string;
  readonly name: string;
  readonly clubName: string;
  /** Stored items about them, all of which attach when the slug is answered. */
  readonly items: number;
  /** The newest item's date, `YYYY-MM-DD`, or empty. */
  readonly latest: string;
  readonly latestHeadline: string;
  readonly url: string;
};

/**
 * Published names the pool cannot resolve — 9.4's half of this queue.
 *
 * Grouped by the publisher's **slug**, because the slug is what the next item
 * will arrive under: answering it once attaches every item about that player,
 * past and future. A slug that any stored row already attaches is not a
 * question, even when other rows under it are still unattached — that is a
 * half-applied answer, and `attachSlug` finishes it rather than asking again.
 */
export function pendingNewsNames(
  items: readonly NewsItemRow[],
): UnmatchedNewsName[] {
  const answered = new Set(
    items.filter((item) => item.player).map((item) => item.slug),
  );

  const open = new Map<string, UnmatchedNewsName>();
  for (const item of items) {
    if (item.player || answered.has(item.slug)) continue;
    const seen = open.get(item.slug);
    const published = item.published ?? "";
    const newer = !seen || published > seen.latest;
    open.set(item.slug, {
      slug: item.slug,
      name: newer ? item.name : seen.name,
      clubName: newer ? (item.club_name ?? "") : seen.clubName,
      items: (seen?.items ?? 0) + 1,
      latest: newer ? published : seen.latest,
      latestHeadline: newer ? item.headline : seen.latestHeadline,
      url: newer ? (item.url ?? "") : seen.url,
    });
  }

  return [...open.values()].sort((a, b) => b.latest.localeCompare(a.latest));
}

/**
 * How long an unanswered published name stays worth interrupting somebody for.
 *
 * The same argument `codesWorthChasing` makes about a backfill season's codes:
 * a name from six weeks ago that matched nobody is usually somebody who is not
 * in this competition — a departed player, or one the publisher covers and the
 * Euroleague does not register. Ringing about them for ever is how a doorbell
 * gets ignored. The mapping page still lists all of them; only the count is
 * filtered, which is the same split the codes half already uses.
 */
export const NEWS_CHASE_DAYS = 30;

export function newsWorthChasing(
  names: readonly UnmatchedNewsName[],
  now: Date,
  days = NEWS_CHASE_DAYS,
): UnmatchedNewsName[] {
  const cutoff = new Date(now.getTime() - days * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return names.filter((name) => name.latest >= cutoff);
}

/** How much unanswered mapping work is standing. */
export type MappingQueue = {
  /** Players the feed may have re-registered under a new name. */
  readonly renames: number;
  /**
   * Person codes from **this season's** box scores that belong to nobody in
   * the pool. A backfill season's leftovers are not counted — see
   * `codesWorthChasing`.
   */
  readonly codes: number;
  /**
   * Names in recent injury or transfer news that match nobody in the pool —
   * see `newsWorthChasing`.
   */
  readonly news: number;
};

export const EMPTY_QUEUE: MappingQueue = { renames: 0, codes: 0, news: 0 };

export function queueTotal(queue: MappingQueue): number {
  return queue.renames + queue.codes + queue.news;
}

/**
 * One sentence a commissioner can act on, or `null` when nothing is standing.
 *
 * Null rather than "nothing to do" because a doorbell that rings to say the
 * door is empty is the thing people learn to ignore. The caller renders
 * nothing at all.
 *
 * It always ends on the cost, because the number alone does not say why it
 * matters: an unanswered rename is a player whose box scores cannot attach,
 * and from the first game of the season that is points going missing rather
 * than a stale spelling. 9.4's half costs something different — an injury
 * nobody is shown — so the closing clause names whichever costs are actually
 * standing rather than asserting one of them about all three.
 */
export function queueSentence(queue: MappingQueue): string | null {
  if (queueTotal(queue) === 0) return null;

  const parts: string[] = [];
  if (queue.renames > 0) {
    parts.push(
      queue.renames === 1
        ? "One player in the pool may have been re-registered under a new name."
        : `${queue.renames} players in the pool may have been re-registered under new names.`,
    );
  }
  if (queue.codes > 0) {
    parts.push(
      queue.codes === 1
        ? "One person code from this season's box scores belongs to nobody in the pool."
        : `${queue.codes} person codes from this season's box scores belong to nobody in the pool.`,
    );
  }
  if (queue.news > 0) {
    parts.push(
      queue.news === 1
        ? "One name in recent injury news matches nobody in the pool."
        : `${queue.news} names in recent injury news match nobody in the pool.`,
    );
  }

  const costs: string[] = [];
  if (queue.renames > 0 || queue.codes > 0) {
    costs.push("those players' box scores cannot attach");
  }
  if (queue.news > 0) {
    costs.push("their injuries show up nowhere in the app");
  }

  return `${parts.join(" ")} Until somebody answers them, ${costs.join(" and ")}.`;
}
