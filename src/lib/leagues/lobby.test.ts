import { describe, expect, it } from "vitest";

import {
  MAX_TEAM_NAME_LENGTH,
  canKickMember,
  canMarkReady,
  canRenameTeam,
  isManager,
  normalizeTeamName,
  validateTeamName,
} from "./lobby";

/** The commissioner of a league still in setup. */
const boss = {
  actorUserId: "u_boss",
  targetUserId: "u_boss",
  actorIsCommissioner: true,
  leagueStatus: "setup",
};
/** An ordinary member, looking at their own row. */
const member = {
  actorUserId: "u_member",
  targetUserId: "u_member",
  actorIsCommissioner: false,
  leagueStatus: "setup",
};

describe("normalizeTeamName", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeTeamName("  The   Ballers ")).toBe("The Ballers");
  });

  it("leaves an already-clean name alone", () => {
    expect(normalizeTeamName("Motiejus Ballers")).toBe("Motiejus Ballers");
  });

  it("turns whitespace-only into empty, not a blank-looking name", () => {
    expect(normalizeTeamName("   ")).toBe("");
    expect(normalizeTeamName("\t\n ")).toBe("");
  });
});

describe("validateTeamName", () => {
  it("accepts a normal name, normalized", () => {
    const result = validateTeamName("  Rimas   Crew  ");
    expect(result).toEqual({ ok: true, value: "Rimas Crew" });
  });

  it("accepts empty as 'clear it', not as an error", () => {
    // The lobby then falls back to the member's display name, which beats an
    // empty slot.
    expect(validateTeamName("")).toEqual({ ok: true, value: "" });
    expect(validateTeamName("   ")).toEqual({ ok: true, value: "" });
  });

  it("accepts a name exactly at the column's limit", () => {
    const exact = "x".repeat(MAX_TEAM_NAME_LENGTH);
    expect(validateTeamName(exact)).toEqual({ ok: true, value: exact });
  });

  it("refuses one character past the limit", () => {
    const result = validateTeamName("x".repeat(MAX_TEAM_NAME_LENGTH + 1));
    expect(result.ok).toBe(false);
  });

  it("measures the name after normalizing, not before", () => {
    // Padding is not length. This would fail if the check ran on the raw input.
    const padded = `  ${"x".repeat(MAX_TEAM_NAME_LENGTH)}  `;
    expect(validateTeamName(padded).ok).toBe(true);
  });
});

describe("canRenameTeam", () => {
  it("lets a member rename their own team", () => {
    expect(canRenameTeam(member)).toEqual({ ok: true });
  });

  it("lets the commissioner rename anyone's team", () => {
    expect(canRenameTeam({ ...boss, targetUserId: "u_someone_else" })).toEqual({
      ok: true,
    });
  });

  it("refuses a member renaming someone else's team", () => {
    const verdict = canRenameTeam({ ...member, targetUserId: "u_other" });
    expect(verdict.ok).toBe(false);
  });

  it("refuses once the draft has started", () => {
    const verdict = canRenameTeam({ ...member, leagueStatus: "drafting" });
    expect(verdict).toEqual({ ok: false, reason: "The draft has started." });
  });

  it("refuses in every non-setup status, commissioner included", () => {
    for (const leagueStatus of ["drafting", "season", "complete"]) {
      expect(canRenameTeam({ ...boss, leagueStatus }).ok).toBe(false);
    }
  });
});

describe("canKickMember", () => {
  it("lets the commissioner kick another member", () => {
    expect(canKickMember({ ...boss, targetUserId: "u_other" })).toEqual({
      ok: true,
    });
  });

  it("refuses a member kicking anyone", () => {
    expect(canKickMember({ ...member, targetUserId: "u_other" }).ok).toBe(
      false,
    );
  });

  it("refuses a member kicking the commissioner", () => {
    expect(canKickMember({ ...member, targetUserId: "u_boss" }).ok).toBe(false);
  });

  it("refuses the commissioner kicking themselves", () => {
    // `ensureCommissionerMembership` would put them straight back on the next
    // page load, so allowing it would be a lie.
    const verdict = canKickMember(boss);
    expect(verdict.ok).toBe(false);
  });

  it("refuses once the league has left setup", () => {
    for (const leagueStatus of ["drafting", "season", "complete"]) {
      expect(
        canKickMember({ ...boss, targetUserId: "u_other", leagueStatus }).ok,
      ).toBe(false);
    }
  });
});

describe("canMarkReady", () => {
  it("lets a member mark themselves ready", () => {
    expect(canMarkReady(member)).toEqual({ ok: true });
  });

  it("lets the commissioner mark themselves ready", () => {
    expect(canMarkReady(boss)).toEqual({ ok: true });
  });

  it("refuses the commissioner marking someone else ready", () => {
    // Readiness is an attestation that you are at your phone. Ticking it for
    // someone else drains it of its only meaning.
    const verdict = canMarkReady({ ...boss, targetUserId: "u_other" });
    expect(verdict.ok).toBe(false);
  });

  it("refuses a member marking anyone else ready", () => {
    expect(canMarkReady({ ...member, targetUserId: "u_other" }).ok).toBe(false);
  });

  it("refuses outside setup", () => {
    expect(canMarkReady({ ...member, leagueStatus: "drafting" }).ok).toBe(
      false,
    );
  });
});

describe("deputies — the commissioner's delegated powers", () => {
  const base = {
    actorUserId: "u1",
    targetUserId: "u2",
    actorIsCommissioner: false,
    leagueStatus: "setup",
  };

  it("treats a granted member as a manager, and everyone else as not", () => {
    expect(isManager({ ...base, actorCanManage: true })).toBe(true);
    expect(isManager({ ...base })).toBe(false);
    // The commissioner's authority is derived, never stored — so it holds even
    // with no can_manage flag anywhere.
    expect(isManager({ ...base, actorIsCommissioner: true })).toBe(true);
  });

  it("lets a deputy rename another member's team", () => {
    expect(canRenameTeam({ ...base, actorCanManage: true }).ok).toBe(true);
    expect(canRenameTeam(base).ok).toBe(false);
  });

  it("lets a deputy remove a member", () => {
    expect(canKickMember({ ...base, actorCanManage: true }).ok).toBe(true);
  });

  it("does not let a deputy remove the commissioner who appointed them", () => {
    const verdict = canKickMember({
      ...base,
      actorCanManage: true,
      targetIsCommissioner: true,
    });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok)
      expect(verdict.reason).toMatch(/commissioner cannot be removed/i);
  });

  it("still refuses a deputy marking somebody else ready", () => {
    // Readiness is an attestation that you are at your phone. Delegating league
    // management does not delegate being present.
    expect(canMarkReady({ ...base, actorCanManage: true }).ok).toBe(false);
  });

  it("gives a deputy no powers once the draft has started", () => {
    const drafting = {
      ...base,
      actorCanManage: true,
      leagueStatus: "drafting",
    };
    expect(canRenameTeam(drafting).ok).toBe(false);
    expect(canKickMember(drafting).ok).toBe(false);
  });
});
