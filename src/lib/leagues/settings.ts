import { z } from "zod";

/**
 * League settings — the `leagues.settings` JSON column, validated.
 *
 * Everything the league might want to tweak lives here rather than in code, per
 * the blueprint: the roster template, the participant cap, and later the scoring
 * weights and trade rules. Reading it through a schema means a league created
 * before a field existed still loads, with the default filled in.
 */

/**
 * 5 Guards, 5 Forwards, 3 Centers = 13 players, and therefore 13 draft rounds.
 * The league's default, never hardcoded at a call site: blueprint §10 leaves open
 * whether 12 participants should drop to 11-man rosters, and that must stay a
 * settings change rather than a code change.
 */
export const DEFAULT_ROSTER_TEMPLATE = { G: 5, F: 5, C: 3 } as const;

/** 8–10 expected, 12 the hard cap (decision D9). */
export const MAX_MEMBERS = 12;
export const MIN_MEMBERS = 2;

export const rosterTemplateSchema = z.object({
  G: z.number().int().min(0),
  F: z.number().int().min(0),
  C: z.number().int().min(0),
});

/**
 * Seconds on the clock per pick. 60 is the default a room of friends can live
 * with; the bounds exist because 5 seconds is a prank and an hour is a slow
 * draft, which is a Phase 6 preset rather than a number typed into this form.
 */
export const DEFAULT_PICK_SECONDS = 60;
export const MIN_PICK_SECONDS = 15;
export const MAX_PICK_SECONDS = 600;

/**
 * How the order repeats across rounds. `keeper` is deliberately absent: the
 * engine refuses to know a format it has no `buildPickOrder` tests for (§5 of
 * the draft-engine invariants), and keeper is Phase 6.
 */
export const DRAFT_FORMATS = ["linear", "snake", "snake3rr"] as const;

/**
 * How the member order is decided. Orthogonal to format — any mode feeds
 * `buildPickOrder` for any format.
 *
 * `reverse_standings` is listed and not yet implementable: it derives the order
 * from last season's final `standings_snapshots`, which Phase 4 creates. It
 * stays in the vocabulary so the setting does not have to change shape later,
 * and the action refuses it with that reason rather than silently rolling.
 */
export const ORDER_MODES = ["roll", "manual", "reverse_standings"] as const;

export const leagueSettingsSchema = z.object({
  roster_template: rosterTemplateSchema.default(DEFAULT_ROSTER_TEMPLATE),
  max_members: z
    .number()
    .int()
    .min(MIN_MEMBERS)
    .max(MAX_MEMBERS)
    .default(MAX_MEMBERS),
  /** Snake is what a friend group expects unless it says otherwise. */
  format: z.enum(DRAFT_FORMATS).default("snake"),
  pick_seconds: z
    .number()
    .int()
    .min(MIN_PICK_SECONDS)
    .max(MAX_PICK_SECONDS)
    .default(DEFAULT_PICK_SECONDS),
  order_mode: z.enum(ORDER_MODES).default("roll"),
  /**
   * The seed the order was rolled from, set when the commissioner rolls.
   *
   * Stored so the roll is replayable: the reveal can be replayed from it, a
   * member who missed it sees the same roll, and a half-written roll is
   * repairable by recomputing rather than re-rolling — which would change who
   * drafts first after the fact.
   */
  roll_seed: z.string().default(""),
});

export type RosterTemplate = z.infer<typeof rosterTemplateSchema>;
export type LeagueSettings = z.infer<typeof leagueSettingsSchema>;
export type DraftFormat = (typeof DRAFT_FORMATS)[number];
export type OrderMode = (typeof ORDER_MODES)[number];

/**
 * Read settings off a record. Unknown or malformed JSON falls back to the
 * defaults rather than throwing: a lobby that renders with default settings is
 * a far better failure than a league nobody can open.
 */
export function parseLeagueSettings(input: unknown): LeagueSettings {
  const result = leagueSettingsSchema.safeParse(input ?? {});
  return result.success ? result.data : leagueSettingsSchema.parse({});
}

/** Total roster slots, which is also the number of draft rounds. */
export function rosterSize(template: RosterTemplate): number {
  return template.G + template.F + template.C;
}

/**
 * Whether another member can join. Returns a reason rather than a bare boolean,
 * because the caller has to tell a human why the door is shut.
 */
export function canAcceptMember(
  settings: LeagueSettings,
  currentMemberCount: number,
  status: string,
): { ok: true } | { ok: false; reason: string } {
  if (status !== "setup") {
    return {
      ok: false,
      reason:
        status === "drafting"
          ? "That league is already drafting."
          : "That league is no longer accepting members.",
    };
  }
  if (currentMemberCount >= settings.max_members) {
    return {
      ok: false,
      reason: `That league is full (${settings.max_members} members).`,
    };
  }
  return { ok: true };
}
