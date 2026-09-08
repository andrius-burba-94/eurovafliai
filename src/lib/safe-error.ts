/** A deliberate, user-facing refusal thrown through a shared helper. */
export class SafeActionError extends Error {
  override readonly name = "SafeActionError";
}

export function getSafeActionError(
  error: unknown,
  fallback: string,
): string {
  if (!(error instanceof SafeActionError)) return fallback;
  return error.message.length <= 200 && !error.message.includes("\n")
    ? error.message
    : fallback;
}
