import { z } from "zod";

/**
 * Every refusal the API can return. A closed set on purpose: the app branches
 * on `code` (and on `reason` for a conflict) and only ever displays `message`,
 * which is the same sentence the web shows, so neither client parses prose.
 */
export const API_ERROR_CODES = [
  "unauthenticated",
  "forbidden",
  "not_found",
  "invalid",
  "conflict",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const API_ERROR_STATUS: Record<ApiErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  invalid: 422,
  conflict: 409,
};

/** Why a well-formed request lost to the state of the league. */
export const CONFLICT_REASONS = [
  "not_your_turn",
  "player_taken",
  "raced",
  "draft_paused",
  "draft_finished",
  "no_draft",
  "roster_full",
  "player_left",
  "league_locked",
  "slow_down",
] as const;

export const apiErrorSchema = z.object({
  code: z.enum(API_ERROR_CODES),
  reason: z.enum(CONFLICT_REASONS).optional(),
  message: z.string(),
  /** The player a refusal is about, so the row that was tapped can say it too. */
  playerId: z.string().optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
