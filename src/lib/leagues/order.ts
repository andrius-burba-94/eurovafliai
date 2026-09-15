/**
 * Is this order already the one on the board?
 *
 * Re-applying a roll recomputes the same numbers from the stored seed, so the
 * write is idempotent by design — but the *announcement* was not. Every press
 * of "Re-apply the roll" told the league the order "was rolled", in wording
 * identical to a genuine draw, which is how a working replay came to look like
 * a shuffle that never changes: one production lobby collected fifty identical
 * roll announcements and the commissioner reasonably concluded rolling was
 * broken.
 *
 * So this is the predicate that keeps a no-op quiet. It compares the order
 * about to be written against the positions already stored, and it is pure
 * because it is the interesting half: the announcement decision is what the
 * tests are about, not the PocketBase writes around it.
 *
 * A partial save is deliberately *not* a replay — some member still carries the
 * wrong number, so re-applying does move the board and the league should hear
 * about it.
 */
export function orderAlreadyApplied(
  order: readonly string[],
  members: readonly { id: string; draft_position?: number }[],
): boolean {
  // No order is not "already applied": an empty roll has nothing to compare
  // against, and staying silent would hide a real first draw.
  if (order.length === 0) return false;

  const positionById = new Map(
    members.map((member) => [member.id, member.draft_position]),
  );
  return order.every((id, index) => positionById.get(id) === index + 1);
}
