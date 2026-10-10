import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakePb, type FakePb } from "../../../tests/unit/helpers/fake-pb";

vi.mock("server-only", () => ({}));

let fake: FakePb;
vi.mock("@/lib/pb/superuser", () => ({
  getSuperuserClient: async () => fake.client,
}));
vi.mock("@/lib/config/server", () => ({
  serverConfig: () => ({ EUROLEAGUE_SEASON: "E2026" }),
}));

const { countMappingQueue, readUnmatchedCodes } = await import("./queries");

/**
 * The doorbell after last season is loaded mid-season — 7.2 B.
 *
 * The E2025 backfill is about thirty-five import batches, each naming codes
 * that belong to players who have left the league. They are newer than the
 * E2026 batch that met a live player nobody has mapped, and they must not push
 * that player out of the doorbell or off the page it rings for.
 */

function batch(index: number, season: string, personCode: string) {
  return {
    id: `batch${String(index).padStart(3, "0")}`,
    season,
    created: `2026-10-10 10:${String(index).padStart(2, "0")}:00.000Z`,
    plan: { unmatched: [{ personCode, lines: [index], name: `Somebody ${personCode}`, clubCode: "AAA" }] },
  };
}

describe("the mapping doorbell beside a backfilled season", () => {
  beforeEach(() => {
    fake = fakePb({
      data: {
        roster_imports: [],
        stat_imports: [
          batch(0, "E2026", "LIVE01"),
          ...Array.from({ length: 35 }, (_, index) => batch(index + 1, "E2025", `GONE${index}`)),
        ],
        players: [{ id: "p1", name: "Ace, Aaron", person_code: "P001", club_code: "AAA" }],
        player_news: [],
        leagues: [],
        league_members: [],
        position_questions: [],
      },
    });
  });

  it("still rings for this season's unmatched code", async () => {
    const queue = await countMappingQueue("u1");
    expect(queue.codes).toBe(1);
  });

  it("still lists that code on the mapping page", async () => {
    const codes = await readUnmatchedCodes();
    expect(codes.map((code) => code.personCode)).toContain("LIVE01");
  });
});
