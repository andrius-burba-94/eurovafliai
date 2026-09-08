/**
 * PocketBase's unique-index refusal, recognised from the code it actually
 * sends — not from a substring of the message.
 *
 * Lives apart from `pipeline.ts` so memberships (and anyone else who writes
 * after a pick) can share it without a cycle: the pipeline materializes
 * memberships when a draft completes.
 */
export function isUniqueViolation(error: unknown): boolean {
  const data = (
    error as {
      response?: { data?: Record<string, { code?: string } | undefined> };
    }
  )?.response?.data;
  if (!data) return false;
  // PocketBase's own code, confirmed against a live 0.39 instance: a duplicate
  // on the composite index comes back 400 with `validation_not_unique` on each
  // field of the index. Substring-matching a stringified error instead would
  // read an unrelated failure as "someone else already did it" and swallow it.
  return Object.values(data).some(
    (field) => field?.code === "validation_not_unique",
  );
}
