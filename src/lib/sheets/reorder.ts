import type { SheetRanking } from "./ranking";

/**
 * Editing a cheat sheet by hand — the arithmetic, and nothing else.
 *
 * Pure and framework-free, like `store.ts` and for a related reason: this
 * function runs **twice for every edit**. Once on the client, optimistically, so
 * a row moves under a finger without waiting for a round trip; and once on the
 * server, authoritatively, against the sheet as it is actually stored. One
 * function, so the two cannot diverge — the discipline `commitPick` established
 * for a human pick and an autodraft.
 *
 * It lives here rather than in `src/lib/engine/` deliberately. The engine is the
 * draft's referee and its purity is enforced because a draft's fairness depends
 * on it; a cheat sheet is one member's private preference and no rule of the
 * draft reads this file. Putting it in the engine would widen what "the engine"
 * means for no gain.
 *
 * ## Why an operation and not an array
 *
 * The wire carries `move b to 8`, not the whole new ranking. A client that
 * posted an array would silently replace a sheet edited in another tab with its
 * own stale view of it — and PocketBase has no transactions to notice. An
 * operation is applied to whatever is stored *now*, so a late or replayed
 * request lands somewhere sensible instead of clobbering. It is also why every
 * function here tolerates an operation that no longer makes sense: a player
 * already removed, a rank past the end. Those are reachable, not defensive
 * padding.
 *
 * ## The model: a break is a place, not a label
 *
 * `tiers` holds counts of players *before* each break, so moving a player past
 * one **changes that player's tier and leaves the break alone**. The
 * alternative — a tier that travels with the player — re-groups the entire
 * sheet around a single move, which is the failure `ranking.ts` argues against
 * where the type is declared. A *removal* is the one edit that does move the
 * breaks, because every rank above it shifts down by one.
 */

export type SheetOperation =
  /** Put this player at this rank, 1-based, and shuffle the rest around them. */
  | { readonly kind: "move"; readonly playerId: string; readonly toRank: number }
  /**
   * Move this player `by` places — negative is better, toward rank 1.
   *
   * A nudge is **relative on purpose**, and the distinction is not cosmetic.
   * `↑` was first written as `move to rank - 1`, computed on the client from the
   * rank it had last rendered — so two quick presses both resolved to the same
   * absolute rank and the second one did nothing at all. Relative, each nudge
   * composes against whatever the sheet actually is when it arrives, whether
   * that is the optimistic state being replayed here or the stored sheet on the
   * server. Found by an E2E spec that pressed the button twice.
   */
  | { readonly kind: "nudge"; readonly playerId: string; readonly by: number }
  /** Take this player off the sheet entirely. */
  | { readonly kind: "remove"; readonly playerId: string }
  /**
   * Toggle a tier break so that this rank starts a tier. Pressing it on a rank
   * that already starts one clears that break, which is what makes a break
   * movable by hand: clear it here, set it there.
   */
  | { readonly kind: "break"; readonly atRank: number };

/** A break is only meaningful strictly inside the sheet — `asBreaks` agrees. */
const tidyBreaks = (breaks: readonly number[], size: number): number[] =>
  [...new Set(breaks)].filter((brk) => brk > 0 && brk < size).sort((a, b) => a - b);

export function applyOperation(
  sheet: SheetRanking,
  operation: SheetOperation,
): SheetRanking {
  switch (operation.kind) {
    case "move":
      return move(sheet, operation.playerId, operation.toRank);
    case "nudge": {
      const at = sheet.ranking.indexOf(operation.playerId);
      if (at === -1) return sheet;
      // Clamped, not wrapped and not refused: `↑` on rank 1 is a control
      // somebody can press and the honest answer is that the sheet did not
      // move.
      const toRank = Math.min(
        Math.max(at + 1 + operation.by, 1),
        sheet.ranking.length,
      );
      return move(sheet, operation.playerId, toRank);
    }
    case "remove":
      return remove(sheet, operation.playerId);
    case "break":
      return toggleBreak(sheet, operation.atRank);
  }
}

function move(
  sheet: SheetRanking,
  playerId: string,
  toRank: number,
): SheetRanking {
  const from = sheet.ranking.indexOf(playerId);
  const to = toRank - 1;
  // A clamp, not a throw. `↑` on #1 is a control somebody can press, and the
  // honest answer is that the sheet did not move — not an error box.
  if (from === -1 || to < 0 || to >= sheet.ranking.length || to === from) {
    return sheet;
  }

  const ranking = [...sheet.ranking];
  ranking.splice(from, 1);
  ranking.splice(to, 0, playerId);
  // The breaks are untouched on purpose. See the model note above: this is the
  // whole reason `tiers` holds places rather than labels.
  return { ranking, tiers: [...sheet.tiers] };
}

function remove(sheet: SheetRanking, playerId: string): SheetRanking {
  const index = sheet.ranking.indexOf(playerId);
  if (index === -1) return sheet;

  const ranking = sheet.ranking.filter((id) => id !== playerId);
  const rank = index + 1;
  // Every break at or above the removed rank comes down by one, because every
  // player above it did. `tidyBreaks` then drops a break that has been pushed
  // to 0 or past the new end — a break describing a tier with nobody in it.
  const tiers = tidyBreaks(
    sheet.tiers.map((brk) => (brk >= rank ? brk - 1 : brk)),
    ranking.length,
  );
  return { ranking, tiers };
}

function toggleBreak(sheet: SheetRanking, atRank: number): SheetRanking {
  // "A break so that rank N starts a tier" is a break after N-1 players. Rank 1
  // therefore asks for a break at 0, which describes nothing; the row does not
  // offer the control, and this is the second line of defence.
  const brk = atRank - 1;
  if (brk <= 0 || brk >= sheet.ranking.length) return sheet;

  const has = sheet.tiers.includes(brk);
  const tiers = tidyBreaks(
    has ? sheet.tiers.filter((each) => each !== brk) : [...sheet.tiers, brk],
    sheet.ranking.length,
  );
  return { ranking: [...sheet.ranking], tiers };
}
