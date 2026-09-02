import { beforeEach, describe, expect, it } from "vitest";

import { deadlineFrom } from "@/lib/drafts/pipeline";

import { fakePb, type FakeDb, type FakeRecord } from "../../tests/unit/helpers/fake-pb";
import { sweepOnce, type SweepReport } from "./sweep";

/**
 * The sweep, against a strict PocketBase fake.
 *
 * These are the assertions draft night depends on and a browser cannot make:
 * that a member out of time gets picked for, that a member with time left does
 * not, that a pause is respected, that the two repairable states are repaired,
 * and — the two that matter most — that the sweep loses a race cleanly and
 * refuses to invent a pick it cannot justify.
 *
 * The fake enforces the real unique indexes and refuses filters it cannot
 * parse (see its own file). The same pipeline is exercised against a real
 * PocketBase in `tests/e2e/worker.spec.ts`; this suite is where the awkward
 * states live, because staging "the draft lost its deadline" in a browser is
 * far harder than staging it here.
 */

const NOW = new Date("2026-09-02T19:00:00.000Z");
/** Roster template of two: one guard, one forward. Two members, two rounds. */
const TEMPLATE = { G: 1, F: 1, C: 0 };
const PICK_SECONDS = 60;

/** `offsetMs` from NOW, in the shape PocketBase stores. */
function deadlineAt(offsetMs: number): string {
  return deadlineFrom(new Date(NOW.getTime() + offsetMs), 0);
}

type World = {
  db: FakeDb;
  log: string[];
  run(options?: {
    reported?: Set<string>;
    graceMs?: number;
    /**
     * The fake copies the data it is given, so a hook that wants to stage a
     * race has to write into *its* copy. `live.db` is that copy, filled in the
     * moment after construction and long before any hook can run.
     */
    hooks?: (live: { db: FakeDb }) => Parameters<typeof fakePb>[0]["hooks"];
  }): Promise<{ report: SweepReport; writes: string[]; db: FakeDb }>;
};

/**
 * A two-member snake draft, mid-flight. Every test bends this: the deadline,
 * the picks already made, whether autodraft is armed.
 *
 * The pool is named so that alphabetical order is the ranking — `readPool`
 * sorts by name, and until Phase 4.4 there is nothing else to rank on.
 */
function world(overrides: {
  draft?: Partial<FakeRecord>;
  members?: Partial<FakeRecord>[];
  picks?: FakeRecord[];
  players?: FakeRecord[];
  league?: Partial<FakeRecord>;
} = {}): World {
  const db: FakeDb = {
    leagues: [
      {
        id: "lg1",
        status: "drafting",
        settings: { roster_template: TEMPLATE },
        ...overrides.league,
      },
    ],
    league_members: [
      { id: "m1", league: "lg1", team_name: "First FC", autodraft_enabled: false },
      { id: "m2", league: "lg1", team_name: "Second FC", autodraft_enabled: false },
    ].map((member, index) => ({ ...member, ...overrides.members?.[index] })),
    drafts: [
      {
        id: "d1",
        league: "lg1",
        format: "snake",
        status: "live",
        order: ["m1", "m2"],
        rounds: 2,
        current_pick: 1,
        pick_seconds: PICK_SECONDS,
        deadline: deadlineAt(30_000),
        seed: "seed",
        ...overrides.draft,
      },
    ],
    picks: overrides.picks ?? [],
    players: overrides.players ?? [
      { id: "aaron", name: "Aaron", position: "G", status: "active" },
      { id: "bravo", name: "Bravo", position: "F", status: "active" },
      { id: "charlie", name: "Charlie", position: "C", status: "active" },
      { id: "dana", name: "Dana", position: "G", status: "active" },
      { id: "elin", name: "Elin", position: "F", status: "active" },
      { id: "zane", name: "Zane", position: "G", status: "active" },
    ],
  };

  const log: string[] = [];
  return {
    db,
    log,
    async run(options = {}) {
      const live: { db: FakeDb } = { db };
      const pb = fakePb({ data: db, hooks: options.hooks?.(live) });
      live.db = pb.db;
      const report = await sweepOnce({
        pb: pb.client,
        // A clock that does not move, so a deadline can be asserted exactly.
        clock: () => NOW,
        log: (message) => log.push(message),
        reported: options.reported,
        graceMs: options.graceMs,
      });
      return { report, writes: pb.writes, db: pb.db };
    },
  };
}

/** The one pick in the database, for the common assertion. */
function onlyPick(db: FakeDb): FakeRecord {
  expect(db.picks).toHaveLength(1);
  return db.picks[0];
}

describe("autodraft on a deadline", () => {
  it("picks for a member who has run out of time", async () => {
    const it_ = world({ draft: { deadline: deadlineAt(-5_000) } });
    const { report, db } = await it_.run();

    expect(report.autopicked).toBe(1);
    expect(onlyPick(db)).toMatchObject({
      draft: "d1",
      overall_no: 1,
      round: 1,
      slot: 1,
      member: "m1",
      // Alphabetically first and legal at an open guard slot.
      player: "aaron",
      is_auto: true,
    });
    // Pick-then-advance: the draft moved on, with a fresh clock for m2.
    expect(db.drafts[0]).toMatchObject({
      current_pick: 2,
      deadline: deadlineFrom(NOW, PICK_SECONDS),
      status: "live",
    });
    expect(it_.log[0]).toContain("First FC ← Aaron");
    expect(it_.log[0]).toContain("out of time");
  });

  it("leaves a member alone while they still have time", async () => {
    const { report, writes } = await world({
      draft: { deadline: deadlineAt(10_000) },
    }).run();

    expect(report).toMatchObject({ live: 1, autopicked: 0 });
    expect(writes).toEqual([]);
  });

  it("holds the grace period open for a pick made on zero", async () => {
    const { report, writes } = await world({
      draft: { deadline: deadlineAt(-500) },
    }).run();

    expect(report.autopicked).toBe(0);
    expect(writes).toEqual([]);
  });

  it("takes the turn once the grace has passed", async () => {
    const { report } = await world({
      draft: { deadline: deadlineAt(-500) },
    }).run({ graceMs: 0 });

    expect(report.autopicked).toBe(1);
  });

  it("never picks through a pause", async () => {
    const { report, writes } = await world({
      draft: { status: "paused", deadline: deadlineAt(-60_000) },
    }).run();

    // The filter never even returns it — pausing means nobody is on the clock.
    expect(report).toMatchObject({ live: 0, autopicked: 0 });
    expect(writes).toEqual([]);
  });
});

describe("autodraft armed on purpose", () => {
  it("picks immediately for a member who armed it, clock or no clock", async () => {
    const armed = world({
      draft: { deadline: deadlineAt(30_000) },
      members: [{ autodraft_enabled: true }],
    });
    const { report, db } = await armed.run();

    expect(report.autopicked).toBe(1);
    expect(onlyPick(db)).toMatchObject({ member: "m1", is_auto: true });
    expect(armed.log[0]).toContain("autodraft armed");
  });

  it("does not pick for the next member just because the last one was armed", async () => {
    // m1 armed, m2 not. One pick per draft per tick, and m2 has time left.
    const { db } = await world({
      draft: { deadline: deadlineAt(30_000) },
      members: [{ autodraft_enabled: true }],
    }).run();

    expect(db.picks).toHaveLength(1);
    expect(db.drafts[0].current_pick).toBe(2);
  });
});

describe("legality, through the engine", () => {
  it("walks past a top-ranked player who would not be legal", async () => {
    // m1 holds a guard already and needs a forward. Aaron (G) still leads the
    // pool alphabetically; the sweep must skip him rather than filter first.
    const { report, db } = await world({
      draft: { current_pick: 4, deadline: deadlineAt(-5_000) },
      picks: [
        { id: "p1", draft: "d1", overall_no: 1, round: 1, slot: 1, member: "m1", player: "dana" },
        { id: "p2", draft: "d1", overall_no: 2, round: 1, slot: 2, member: "m2", player: "elin" },
        { id: "p3", draft: "d1", overall_no: 3, round: 2, slot: 1, member: "m2", player: "zane" },
      ],
    }).run();

    expect(report.autopicked).toBe(1);
    const landed = db.picks.find((pick) => pick.overall_no === 4);
    expect(landed).toMatchObject({ member: "m1", player: "bravo" });
  });

  it("will not invent a pick when nothing in the pool is legal", async () => {
    // Only centers left, and this template has no center slot.
    const stuck = world({
      draft: { deadline: deadlineAt(-5_000) },
      players: [{ id: "charlie", name: "Charlie", position: "C", status: "active" }],
    });
    const { report, writes } = await stuck.run();

    expect(report).toMatchObject({ stuck: 1, autopicked: 0 });
    expect(writes).toEqual([]);
    expect(stuck.log.join(" ")).toContain("no legal player");
  });

  it("reports a draft it cannot help once, not once a second", async () => {
    const stuck = world({
      draft: { deadline: deadlineAt(-5_000) },
      players: [{ id: "charlie", name: "Charlie", position: "C", status: "active" }],
    });
    const reported = new Set<string>();
    await stuck.run({ reported });
    await stuck.run({ reported });
    await stuck.run({ reported });

    expect(stuck.log).toHaveLength(1);
  });

  it("complains again about a draft that was fixed and broke again", async () => {
    // Reported once, not once and never again: a commissioner who repairs a
    // pool and later hits the same wall deserves to hear about it a second
    // time. The set is what remembers, so the sweep has to forget on the way
    // past a draft it could move.
    const stuck = world({
      draft: { deadline: deadlineAt(-5_000) },
      players: [{ id: "charlie", name: "Charlie", position: "C", status: "active" }],
    });
    const reported = new Set<string>();

    await stuck.run({ reported });
    expect(stuck.log).toHaveLength(1);

    // A guard turns up in the pool, the pick lands, and the complaint is spent.
    stuck.db.players.push({ id: "dana", name: "Dana", position: "G", status: "active" });
    await stuck.run({ reported });

    // Back to a pool with nothing legal in it, and the sweep says so again.
    stuck.db.players = [
      { id: "charlie", name: "Charlie", position: "C", status: "active" },
    ];
    await stuck.run({ reported });
    expect(stuck.log.filter((line) => line.includes("no legal player"))).toHaveLength(2);
  });

  it("does not autodraft a player who has left the Euroleague", async () => {
    const gone = world({
      draft: { deadline: deadlineAt(-5_000) },
      players: [
        { id: "aaron", name: "Aaron", position: "G", status: "left" },
        { id: "dana", name: "Dana", position: "G", status: "active" },
      ],
    });
    const { db } = await gone.run();

    expect(onlyPick(db).player).toBe("dana");
  });
});

describe("the repairs nobody else would notice", () => {
  it("finishes an advance that never happened", async () => {
    const { report, db } = await world({
      draft: { current_pick: 1, deadline: deadlineAt(30_000) },
      picks: [
        { id: "p1", draft: "d1", overall_no: 1, round: 1, slot: 1, member: "m1", player: "dana" },
      ],
    }).run();

    expect(report.repaired).toBe(1);
    expect(db.drafts[0].current_pick).toBe(2);
    // The repair advances; it does not pick. m2 has a full clock.
    expect(db.picks).toHaveLength(1);
  });

  it("does not hand the next member an expired clock", async () => {
    // The repair writes a fresh deadline; the record in hand still carries the
    // old one. Believing it read the *previous* member's expired clock as this
    // member's, and took their whole turn in the same tick.
    const repaired = world({
      draft: { current_pick: 1, deadline: deadlineAt(-5_000) },
      picks: [
        { id: "p1", draft: "d1", overall_no: 1, round: 1, slot: 1, member: "m1", player: "dana" },
      ],
    });
    const { report, db } = await repaired.run();

    expect(report).toMatchObject({ repaired: 1, autopicked: 0 });
    expect(db.picks).toHaveLength(1);
    expect(db.drafts[0].deadline).toBe(deadlineFrom(NOW, PICK_SECONDS));
  });

  it("does not advance twice when the repair itself finishes the draft", async () => {
    // Every slot filled and `current_pick` pointing at the last one: the repair
    // completes the draft, and a second advance in the same tick pushed
    // `current_pick` past the end and wrote the league's status twice.
    const finished = world({
      draft: { current_pick: 4, deadline: deadlineAt(-5_000) },
      picks: [
        { id: "p1", draft: "d1", overall_no: 1, round: 1, slot: 1, member: "m1", player: "dana" },
        { id: "p2", draft: "d1", overall_no: 2, round: 1, slot: 2, member: "m2", player: "elin" },
        { id: "p3", draft: "d1", overall_no: 3, round: 2, slot: 1, member: "m2", player: "zane" },
        { id: "p4", draft: "d1", overall_no: 4, round: 2, slot: 2, member: "m1", player: "bravo" },
      ],
    });
    const { report, writes, db } = await finished.run();

    expect(report).toMatchObject({ repaired: 1, finished: 0, autopicked: 0 });
    expect(db.drafts[0]).toMatchObject({ status: "complete", current_pick: 5 });
    expect(db.leagues[0].status).toBe("season");
    expect(writes).toEqual(["update drafts:d1", "update leagues:lg1"]);
  });

  it("closes a draft whose every slot is filled", async () => {
    const { report, db } = await world({
      draft: { current_pick: 5, deadline: deadlineAt(-60_000) },
      picks: [
        { id: "p1", draft: "d1", overall_no: 1, round: 1, slot: 1, member: "m1", player: "dana" },
        { id: "p2", draft: "d1", overall_no: 2, round: 1, slot: 2, member: "m2", player: "elin" },
        { id: "p3", draft: "d1", overall_no: 3, round: 2, slot: 1, member: "m2", player: "zane" },
        { id: "p4", draft: "d1", overall_no: 4, round: 2, slot: 2, member: "m1", player: "bravo" },
      ],
    }).run();

    expect(report.finished).toBe(1);
    expect(db.drafts[0]).toMatchObject({ status: "complete", deadline: "" });
    // The league follows the draft — the pair of writes 2.4 left repairable.
    expect(db.leagues[0].status).toBe("season");
  });

  it("restarts a clock that went missing, rather than picking on the spot", async () => {
    const restarted = world({ draft: { deadline: "" } });
    const { report, db } = await restarted.run();

    expect(report.clocksRestarted).toBe(1);
    expect(db.drafts[0].deadline).toBe(deadlineFrom(NOW, PICK_SECONDS));
    expect(db.picks).toEqual([]);
    expect(restarted.log.join(" ")).toContain("restarted the clock");
  });

  it("leaves a board with a hole in it for the commissioner", async () => {
    // Pick 1 missing, everything after it made, the draft pointing past the
    // last slot: an interrupted rollback, most likely. Nobody is on the clock
    // and the draft can never complete — and guessing what belongs at pick 1
    // is still not the worker's call.
    const holed = world({
      draft: { current_pick: 5, deadline: deadlineAt(-60_000) },
      picks: [
        { id: "p2", draft: "d1", overall_no: 2, round: 1, slot: 2, member: "m2", player: "elin" },
        { id: "p3", draft: "d1", overall_no: 3, round: 2, slot: 1, member: "m2", player: "zane" },
        { id: "p4", draft: "d1", overall_no: 4, round: 2, slot: 2, member: "m1", player: "bravo" },
      ],
    });
    const { report, writes } = await holed.run();

    expect(report).toMatchObject({ stuck: 1, autopicked: 0, finished: 0 });
    expect(writes).toEqual([]);
    expect(holed.log.join(" ")).toContain("gap in the board");
  });
});

describe("races and failures", () => {
  it("loses a race cleanly when a human picks on zero", async () => {
    const raced = world({ draft: { deadline: deadlineAt(-5_000) } });
    const { report, db } = await raced.run({
      hooks: (live) => ({
        // Between the sweep's read and its write, the member's own pick lands.
        beforeCreate(collection, data) {
          if (collection !== "picks") return;
          live.db.picks.push({
            id: "human",
            draft: "d1",
            overall_no: data.overall_no as number,
            round: 1,
            slot: 1,
            member: "m1",
            player: "zane",
            is_auto: false,
          });
        },
      }),
    });

    expect(report).toMatchObject({ raced: 1, autopicked: 0 });
    // The human's pick stands, and the sweep wrote nothing over it.
    expect(onlyPick(db)).toMatchObject({ id: "human", is_auto: false });
    expect(raced.log.join(" ")).toContain("taken first");
  });

  it("leaves a draft that was paused while the tick was reading", async () => {
    // The real window `rollbackDraft` pauses first to close: the sweep read the
    // draft as live, and half a dozen queries later it is not. Staged here by
    // pausing it as the pool is read, which is the last read before the write.
    const paused = world({ draft: { deadline: deadlineAt(-5_000) } });
    const { report, db } = await paused.run({
      hooks: (live) => ({
        beforeList(collection) {
          if (collection === "players") live.db.drafts[0].status = "paused";
        },
      }),
    });

    expect(report).toMatchObject({ moved: 1, autopicked: 0 });
    expect(db.picks).toEqual([]);
    expect(paused.log.join(" ")).toContain("moved under the sweep");
  });

  it("keeps sweeping the other drafts when one throws", async () => {
    const two = world({ draft: { deadline: deadlineAt(-5_000) } });
    two.db.drafts.push({
      ...two.db.drafts[0],
      id: "d2",
      league: "lg2",
    });
    two.db.leagues.push({
      id: "lg2",
      status: "drafting",
      settings: { roster_template: TEMPLATE },
    });

    const { report, db } = await two.run({
      hooks: () => ({
        beforeList(collection, filter) {
          if (collection === "picks" && filter.includes("d1")) {
            throw new Error("PocketBase said no");
          }
        },
      }),
    });

    expect(report).toMatchObject({ live: 2, failed: 1, autopicked: 1 });
    expect(db.picks.every((pick) => pick.draft === "d2")).toBe(true);
    expect(two.log.join(" ")).toContain("PocketBase said no");
  });
});

describe("a quiet tick", () => {
  let quiet: World;
  beforeEach(() => {
    quiet = world({ draft: { deadline: deadlineAt(30_000) } });
  });

  it("writes nothing and says nothing", async () => {
    const { writes } = await quiet.run();
    expect(writes).toEqual([]);
    expect(quiet.log).toEqual([]);
  });

  it("does not read the pool it does not need", async () => {
    // 324 players, once a second, forever, for nothing. The pool is read only
    // when a pick is actually about to be made.
    const reads: string[] = [];
    await quiet.run({
      hooks: () => ({ beforeList: (collection) => reads.push(collection) }),
    });
    expect(reads).not.toContain("players");
  });
});
