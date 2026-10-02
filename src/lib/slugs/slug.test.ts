import { describe, expect, it } from "vitest";

import { leagueSlug, looksLikeId, playerSlug, slugify, teamSlug } from "./slug";

const none = new Set<string>();

describe("slugify", () => {
  it("folds Lithuanian and other diacritics into plain letters", () => {
    expect(slugify("Monikutės Naktys")).toBe("monikutes-naktys");
    expect(slugify("Šeštadienio Tritaškiai")).toBe("sestadienio-tritaskiai");
    expect(slugify("Jonas Valančiūnas")).toBe("jonas-valanciunas");
    expect(slugify("Nikola Milutinov")).toBe("nikola-milutinov");
    expect(slugify("Đorđe Gagić")).toBe("dorde-gagic");
    expect(slugify("Kavos lyga 26–27")).toBe("kavos-lyga-26-27");
    expect(slugify("Bjørn Søren Æsir Łukasz")).toBe("bjorn-soren-aesir-lukasz");
  });

  it("drops punctuation and collapses separators", () => {
    expect(slugify("  Birka   ne Plugas!! ")).toBe("birka-ne-plugas");
    expect(slugify("Evan , Mehdi Fournier")).toBe("evan-mehdi-fournier");
    expect(slugify("Wade M. Baldwin IV")).toBe("wade-m-baldwin-iv");
    expect(slugify("🏀🏀")).toBe("");
  });

  it("keeps long names short on a word boundary", () => {
    const slug = slugify("Nwachukwu Iheukwumere Chima Moneke of the Very Long Family Name");
    expect(slug.length).toBeLessThanOrEqual(48);
    expect(slug.endsWith("-")).toBe(false);
    expect(slug.startsWith("nwachukwu-iheukwumere-chima-moneke")).toBe(true);
  });
});

describe("taken slugs", () => {
  it("numbers a second league of the same name", () => {
    expect(leagueSlug("Kavos lyga", none)).toBe("kavos-lyga");
    expect(leagueSlug("Kavos lyga", new Set(["kavos-lyga"]))).toBe("kavos-lyga-2");
    expect(leagueSlug("Kavos lyga", new Set(["kavos-lyga", "kavos-lyga-2"]))).toBe("kavos-lyga-3");
    expect(leagueSlug("!!!", none)).toBe("league");
  });

  it("keeps a team off the league's own page names", () => {
    expect(teamSlug("Stats", none)).toBe("stats-team");
    expect(teamSlug("Standings", none)).toBe("standings-team");
    expect(teamSlug("Vaflių Fabrikas", new Set(["vafliu-fabrikas"]))).toBe("vafliu-fabrikas-2");
    expect(teamSlug("", none)).toBe("team");
  });

  it("tells two players of one name apart by club, then by number", () => {
    expect(playerSlug("Nikola Milutinov", "OLY", none)).toBe("nikola-milutinov");
    expect(playerSlug("Nikola Milutinov", "OLY", new Set(["nikola-milutinov"]))).toBe("nikola-milutinov-oly");
    expect(playerSlug("Nikola Milutinov", "OLY", new Set(["nikola-milutinov", "nikola-milutinov-oly"]))).toBe("nikola-milutinov-oly-2");
    expect(playerSlug("Nikola Milutinov", null, new Set(["nikola-milutinov"]))).toBe("nikola-milutinov-2");
  });
});

describe("looksLikeId", () => {
  it("knows a record id from a slug", () => {
    expect(looksLikeId("s7bq8d0rndsrzx5")).toBe(true);
    expect(looksLikeId("kavos-lyga")).toBe(false);
    expect(looksLikeId("eurovafliai")).toBe(false);
  });
});
