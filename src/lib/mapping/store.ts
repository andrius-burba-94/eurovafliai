import type PocketBase from "pocketbase";

import type { CodeBatch } from "./queue";

/**
 * The newest box-score import batches, for the person codes they could not
 * attach. Framework-free: the doorbell, the mapping page and the worker's
 * roster sync read the same window.
 *
 * Pass a season to read only its batches. A window over every season is not
 * enough once last season is loaded mid-season (7.2 B): its thirty-odd batches
 * are newer than this season's, and they would push a live player's unmatched
 * code out of the window — the doorbell would go quiet and the sync would stop
 * re-importing his lines.
 */
export async function readCodeBatches(
  pb: PocketBase,
  { season, limit = 20 }: { season?: string; limit?: number } = {},
): Promise<CodeBatch[]> {
  const page = await pb.collection("stat_imports").getList<CodeBatch>(1, limit, {
    ...(season ? { filter: `season = "${season.replace(/[^A-Za-z0-9]/g, "")}"` } : {}),
    sort: "-created",
    requestKey: null,
  });
  return page.items;
}
