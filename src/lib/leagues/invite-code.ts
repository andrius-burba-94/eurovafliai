/**
 * Invite codes. Pure — the caller supplies randomness, so this is testable and
 * the same function serves the server action and any future seed script.
 *
 * A code gets read aloud across a room and typed on a phone keyboard, which
 * drives every choice here: uppercase only, a short fixed length, and an
 * alphabet with the characters people confuse removed.
 */

/**
 * Deliberately missing: I, O, 0, 1, L, U, V.
 *
 * - `I`/`1`/`L` and `O`/`0` are the classic misreads, in both directions.
 * - `U` and `V` are hard to distinguish when spoken aloud, which is the main
 *   way a code travels here ("join with EURO26").
 *
 * What is left is 29 characters, all unambiguous written and spoken.
 */
export const INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTWXYZ23456789";

export const INVITE_CODE_LENGTH = 6;

/**
 * The number of distinct codes: 29^6 ≈ 594 million. For a handful of leagues
 * that makes a collision vanishingly unlikely — but never impossible, which is
 * why `leagues.invite_code` carries a unique index and the caller retries.
 */
export function inviteCodeSpaceSize(
  length: number = INVITE_CODE_LENGTH,
): number {
  return INVITE_ALPHABET.length ** length;
}

/**
 * Build a code from a random source.
 *
 * `random` returns floats in [0, 1) — `Math.random` in a test, and
 * `crypto`-backed randomness in production via `generateInviteCode`. Injecting
 * it keeps this deterministic under test.
 */
export function buildInviteCode(
  random: () => number,
  length: number = INVITE_CODE_LENGTH,
): string {
  if (!Number.isInteger(length) || length < 1) {
    throw new Error(`Invite code length must be a positive integer, got ${length}`);
  }

  let code = "";
  for (let i = 0; i < length; i += 1) {
    const index = Math.floor(random() * INVITE_ALPHABET.length);
    // A `random` that returns exactly 1, or drifts slightly over, would index
    // past the end and yield "undefined" characters. Clamp rather than trust.
    code += INVITE_ALPHABET[Math.min(index, INVITE_ALPHABET.length - 1)];
  }
  return code;
}

/**
 * Fold user input into the canonical form before comparing it to a stored code.
 *
 * People type codes in lower case, paste them with a trailing newline, and write
 * them down in pairs with a hyphen or space. All of that should still join the
 * league, so case, whitespace and separators are normalised away.
 *
 * Confusable characters are deliberately NOT remapped. Because the alphabet
 * excludes them, a typed `0`, `1` or `I` cannot be a valid code in the first
 * place, and guessing what the sender meant would risk joining the wrong league.
 * Such input fails `isPlausibleInviteCode` and gets an error instead.
 */
export function normalizeInviteCode(input: string): string {
  return input.toUpperCase().replace(/[\s_-]/g, "");
}

/** True when a code could exist — cheap rejection before touching the database. */
export function isPlausibleInviteCode(
  code: string,
  length: number = INVITE_CODE_LENGTH,
): boolean {
  if (code.length !== length) return false;
  return [...code].every((char) => INVITE_ALPHABET.includes(char));
}

/**
 * A cryptographically random code. Not `Math.random`: an invite code is the only
 * thing standing between a stranger and a league's lobby, so it should not be
 * predictable from previously issued codes.
 */
export function generateInviteCode(
  length: number = INVITE_CODE_LENGTH,
): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let i = 0;
  return buildInviteCode(() => bytes[i++] / 2 ** 32, length);
}
