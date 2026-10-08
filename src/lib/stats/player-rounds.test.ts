import { describe, expect, it } from "vitest";

import { fakePb } from "../../../tests/unit/helpers/fake-pb";

import { impactForMember } from "./impact";
import { mergeBasketNewsLines, readLeaguePlayerRounds } from "./player-rounds";

describe("mergeBasketNewsLines", () => {
  it("sums a round's games, converts hundredths to tenths, and lets the official value win", () => {
    const lines = mergeBasketNewsLines(
      [{ player: "rostered", round: 4, fantasy_pts: 210 }],
      [
        { player: "rostered", round: 4, rawHundredths: 1800, pir: 15 },
        { player: "rostered", round: 4, rawHundredths: 0, pir: 2 },
        { player: "free-agent", round: 4, rawHundredths: 1250, pir: 11 },
        { player: "free-agent", round: 4, rawHundredths: 300, pir: 3 },
      ],
    );
    expect(lines).toEqual([
      { player: "rostered", round: 4, fantasy_pts: 210, pir: 17, club_code: undefined },
      { player: "free-agent", round: 4, fantasy_pts: 155, pir: 14, club_code: undefined },
    ]);
  });

  it("keeps an official value the feed has not caught up with", () => {
    expect(mergeBasketNewsLines([{ player: "p", round: 5, fantasy_pts: 99 }], [])).toEqual([
      { player: "p", round: 5, fantasy_pts: 99, pir: 0 },
    ]);
  });
});

/**
 * One deal, both rulesets: Ausys released `gone` in round 4 for `arrival`.
 * `gone` went to free agency, so no lineup ever records him again — and he
 * must keep counting against the deal anyway.
 */
function league(basketNews: boolean) {
  return fakePb({
    data: {
      player_game_stats: [
        { id: "g1", player: "gone", season: "E2026", round: 4, game_code: 1, fantasy_pts: 120, basketnews_raw_pts: 1400, pir: 12, club_code: "IST" },
        { id: "g2", player: "gone", season: "E2026", round: 5, game_code: 2, fantasy_pts: 200, basketnews_raw_pts: 2300, pir: 20, club_code: "IST" },
        { id: "a1", player: "arrival", season: "E2026", round: 4, game_code: 1, fantasy_pts: 90, basketnews_raw_pts: 1000, pir: 9, club_code: "IST" },
        { id: "a2", player: "arrival", season: "E2026", round: 5, game_code: 2, fantasy_pts: 60, basketnews_raw_pts: 700, pir: 6, club_code: "IST" },
      ],
      round_lineups: basketNews
        ? [
            {
              id: "l4",
              league: "bn",
              member: "ausys",
              season: "E2026",
              round: 4,
              basketnews_result: { players: [{ playerId: "arrival", rawHundredths: 1050 }] },
            },
          ]
        : [],
    },
  });
}

describe("readLeaguePlayerRounds", () => {
  it.each([
    { ruleset: "EuroLeague", basketNews: false, inTenths: 90 + 60, outTenths: 120 + 200 },
    // Official 10.5 for the arrival's round 4; the feed for everything else.
    { ruleset: "BasketNews", basketNews: true, inTenths: 105 + 70, outTenths: 140 + 230 },
  ])("keeps a released player scoring against the deal in $ruleset", async ({ basketNews, inTenths, outTenths }) => {
    const pb = league(basketNews);
    const lines = await readLeaguePlayerRounds(pb.client, {
      leagueId: "bn",
      season: "E2026",
      basketNews,
      players: ["gone", "arrival"],
    });
    const [deal] = impactForMember(
      "ausys",
      [{ id: "tx", type: "add", fromRound: 4, playersIn: { ausys: ["arrival"] }, playersOut: { ausys: ["gone"] } }],
      lines.map((line) => ({ playerId: line.player, round: line.round, fantasyTenths: line.fantasy_pts, pir: line.pir })),
    );
    expect(deal).toMatchObject({ inTenths, outTenths, deltaTenths: inTenths - outTenths });
    expect(deal?.byRound.map((row) => row.round)).toEqual([4, 5]);
  });

  it("narrows to one round", async () => {
    const lines = await readLeaguePlayerRounds(league(true).client, { leagueId: "bn", season: "E2026", basketNews: true, round: 5 });
    expect(lines.map((line) => [line.player, line.round, line.fantasy_pts])).toEqual([
      ["gone", 5, 230],
      ["arrival", 5, 70],
    ]);
  });
});
