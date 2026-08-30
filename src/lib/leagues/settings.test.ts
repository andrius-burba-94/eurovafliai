import { describe, expect, it } from "vitest";

import {
  DEFAULT_ROSTER_TEMPLATE,
  MAX_MEMBERS,
  canAcceptMember,
  parseLeagueSettings,
  rosterSize,
} from "./settings";

describe("parseLeagueSettings", () => {
  it("fills in defaults for a league created before a field existed", () => {
    const settings = parseLeagueSettings({});
    expect(settings.roster_template).toEqual(DEFAULT_ROSTER_TEMPLATE);
    expect(settings.max_members).toBe(MAX_MEMBERS);
  });

  it("keeps values a league has actually set", () => {
    const settings = parseLeagueSettings({
      roster_template: { G: 4, F: 4, C: 3 },
      max_members: 8,
    });
    expect(settings.roster_template).toEqual({ G: 4, F: 4, C: 3 });
    expect(settings.max_members).toBe(8);
  });

  it("falls back to defaults rather than throwing on malformed JSON", () => {
    // A lobby rendering with default settings beats a league nobody can open.
    for (const bad of [null, undefined, "nonsense", 42, [], { max_members: 99 }]) {
      expect(parseLeagueSettings(bad).max_members).toBe(MAX_MEMBERS);
    }
  });
});

describe("rosterSize", () => {
  it("is 13 for the league default, which is also the round count", () => {
    expect(rosterSize(DEFAULT_ROSTER_TEMPLATE)).toBe(13);
  });

  it("follows the template rather than a hardcoded 13", () => {
    expect(rosterSize({ G: 4, F: 4, C: 3 })).toBe(11);
  });
});

describe("canAcceptMember", () => {
  const settings = parseLeagueSettings({});

  it("accepts a member while the lobby is open and has room", () => {
    expect(canAcceptMember(settings, 0, "setup")).toEqual({ ok: true });
    expect(canAcceptMember(settings, MAX_MEMBERS - 1, "setup")).toEqual({ ok: true });
  });

  it("refuses at the cap, and says the cap", () => {
    const result = canAcceptMember(settings, MAX_MEMBERS, "setup");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain(String(MAX_MEMBERS));
  });

  it("refuses once the draft has started, with a distinct reason", () => {
    const drafting = canAcceptMember(settings, 3, "drafting");
    expect(drafting.ok).toBe(false);
    if (!drafting.ok) expect(drafting.reason).toMatch(/already drafting/);

    const season = canAcceptMember(settings, 3, "season");
    expect(season.ok).toBe(false);
    if (!season.ok) expect(season.reason).toMatch(/no longer accepting/);
  });

  it("honours a league's own lower cap", () => {
    const small = parseLeagueSettings({ max_members: 4 });
    expect(canAcceptMember(small, 4, "setup").ok).toBe(false);
  });
});
