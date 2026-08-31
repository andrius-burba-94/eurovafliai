/**
 * The lobby's rules: who may rename a team, who may kick, who may declare
 * themselves ready.
 *
 * Pure — no PocketBase, no I/O, no session. The server actions in `./actions.ts`
 * read the world, ask these functions, and only then write. Keeping the decision
 * separate from the fetching is what makes "can the commissioner kick himself?"
 * a unit test rather than an integration test.
 *
 * Every verdict carries a reason rather than a bare boolean, matching
 * `canAcceptMember` in ./settings.ts: the caller always has to tell a human why
 * the door is shut.
 */

import type { Member, MemberRecord } from "./types";

/** Matches the `team_name` column's `max: 40` — see 1788124600. */
export const MAX_TEAM_NAME_LENGTH = 40;

/**
 * How the lobby's member list is read — the one definition of it.
 *
 * Two callers run this against PocketBase in two different places: the server
 * component on first render, and the realtime client component after every
 * subscription event. Written out twice they would be free to drift, and the
 * symptom would be a lobby that renders one way on load and another way the
 * moment somebody joins.
 */
export function memberListQuery(leagueId: string) {
  return {
    // Single-quoted filter value: PocketBase rejects double quotes.
    filter: `league = '${leagueId}'`,
    expand: "user",
    // No `created` index on this collection, so sort by id — monotonic enough
    // for a stable join order.
    sort: "id",
    // Without this React StrictMode auto-cancels the duplicate request in dev
    // and you debug a phantom.
    requestKey: null,
  };
}

export type Verdict = { ok: true } | { ok: false; reason: string };

/**
 * A `league_members` record as the lobby renders it.
 *
 * Lives here, in the pure module, rather than in `./queries.ts`, because two
 * callers need it and they run in different places: the server component's
 * first render, and the realtime client component's every refresh after that.
 * A second copy in the browser would be a copy free to drift, and the symptom
 * would be a lobby that renders one way on load and another way the moment
 * somebody joins.
 *
 * `name` falls back through the display name and then the email, but a
 * co-member's email is never actually readable — PocketBase only returns it to
 * the record's owner unless `emailVisibility` is set — so in practice the email
 * rung is only ever reached for yourself. "Unknown member" is the honest last
 * resort, and after 1788181100_users_read_co_members.js it means a user record
 * with no name at all rather than a read rule refusing the expand (issue #15).
 */
export function toMember(
  record: MemberRecord,
  context: { commissionerUserId: string; viewerUserId: string },
): Member {
  const user = record.expand?.user;
  return {
    id: record.id,
    userId: record.user,
    name: user?.name || user?.email || "Unknown member",
    teamName: record.team_name || "",
    isCommissioner: record.user === context.commissionerUserId,
    isYou: record.user === context.viewerUserId,
    isReady: Boolean(record.is_ready),
    // PocketBase stores an unset number as 0, never null — the trap
    // `draft_position` was made optional for in 1788124600. 0 is not a slot, so
    // it reads as "not positioned yet".
    draftPosition: record.draft_position ? record.draft_position : null,
  };
}

/**
 * Who is asking, and about whom.
 *
 * Both are *user* ids rather than membership ids. A membership id would be the
 * natural key for the row being changed, but the question these functions
 * answer is about people — "is this me?", "am I the commissioner?" — and user
 * ids are what the session carries.
 */
export type LobbyActor = {
  actorUserId: string;
  targetUserId: string;
  actorIsCommissioner: boolean;
  /** The league's coarse lifecycle — see CONTEXT.md. */
  leagueStatus: string;
};

/**
 * Collapse whitespace and trim. Names are read aloud on draft night and shown
 * in a fixed-width slot, so "  The   Ballers " and "The Ballers" are the same
 * name and only one of them fits.
 */
export function normalizeTeamName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/**
 * Validate a submitted team name.
 *
 * Empty is legal and means "clear it": the lobby then falls back to the
 * member's own display name, which is a better default than an empty slot.
 */
export function validateTeamName(
  raw: string,
): { ok: true; value: string } | { ok: false; reason: string } {
  const value = normalizeTeamName(raw);
  if (value.length > MAX_TEAM_NAME_LENGTH) {
    return {
      ok: false,
      reason: `Team names stop at ${MAX_TEAM_NAME_LENGTH} characters.`,
    };
  }
  return { ok: true, value };
}

/** The lobby exists only while the league is still gathering members. */
function requireSetup(leagueStatus: string): Verdict {
  if (leagueStatus !== "setup") {
    return {
      ok: false,
      reason:
        leagueStatus === "drafting"
          ? "The draft has started."
          : "This league has left the lobby.",
    };
  }
  return { ok: true };
}

/**
 * Rename a team: your own always, anyone's if you run the league.
 *
 * The commissioner's power here is real and intentional — someone has to be
 * able to fix the friend who typed something unreadable at 23:00 — but the
 * common case is a member naming their own team on their own phone.
 */
export function canRenameTeam(actor: LobbyActor): Verdict {
  const stage = requireSetup(actor.leagueStatus);
  if (!stage.ok) return stage;

  if (actor.actorUserId === actor.targetUserId) return { ok: true };
  if (actor.actorIsCommissioner) return { ok: true };
  return { ok: false, reason: "You can only rename your own team." };
}

/**
 * Kick a member: commissioner only, and never themselves.
 *
 * Self-kick is refused rather than quietly allowed because a league whose
 * commissioner is not a member is a state the rest of the app does not model —
 * `ensureCommissionerMembership` would simply put them back on the next page
 * load, so honouring it would be a lie.
 */
export function canKickMember(actor: LobbyActor): Verdict {
  const stage = requireSetup(actor.leagueStatus);
  if (!stage.ok) return stage;

  if (!actor.actorIsCommissioner) {
    return { ok: false, reason: "Only the commissioner can remove a member." };
  }
  if (actor.actorUserId === actor.targetUserId) {
    return {
      ok: false,
      reason: "You run this league — you cannot remove yourself from it.",
    };
  }
  return { ok: true };
}

/**
 * Mark yourself ready — and only yourself, commissioner included.
 *
 * Readiness is an attestation that you are at your phone, so a commissioner
 * ticking it on someone else's behalf would drain it of the one meaning it has.
 */
export function canMarkReady(actor: LobbyActor): Verdict {
  const stage = requireSetup(actor.leagueStatus);
  if (!stage.ok) return stage;

  if (actor.actorUserId !== actor.targetUserId) {
    return { ok: false, reason: "Only you can say you are ready." };
  }
  return { ok: true };
}
