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

export const leagueSettingsSchema = z.object({
  roster_template: rosterTemplateSchema.default(DEFAULT_ROSTER_TEMPLATE),
  max_members: z.number().int().min(MIN_MEMBERS).max(MAX_MEMBERS).default(MAX_MEMBERS),
});

export type RosterTemplate = z.infer<typeof rosterTemplateSchema>;
export type LeagueSettings = z.infer<typeof leagueSettingsSchema>;

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
