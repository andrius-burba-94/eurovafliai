import { describe, expect, it } from "vitest";

import { fakePb } from "../../../tests/unit/helpers/fake-pb";

import {
  readCurrentPlayers,
  readRosterAuthority,
  runRosterImport,
} from "./apply";
import type { NormalizedPlayer } from "./types";

/**
 * The roster import's write step. `diff.test.ts` proves what a diff contains;
 * this file proves what `runRosterImport` does with one — which source may
 * write, in what order, and what a refused row costs.
 */

function player(over: Partial<NormalizedPlayer> = {}): NormalizedPlayer {
  return {
    name: "Vezenkov, Sasha",
    name_normalized: "sasha vezenkov",
    club_code: "OLY",
    club_name: "Olympiacos",
    position: "F",
    status: "active",
    person_code: "001",
    source: "api",
    dorsal: "14",
    ...over,
  };
}

const existing = {
  id: "p_sasha",
  name: "Vezenkov, Sasha",
  name_normalized: "sasha vezenkov",
  club_code: "OLY",
  club_name: "Olympiacos",
  position: "F",
  status: "active",
  person_code: "001",
  source: "api",
  manual_lock: false,
  dorsal: "14",
};

describe("readCurrentPlayers / readRosterAuthority", () => {
  it("converts PocketBase's empty text back into the pipeline's null", async () => {
    const { client } = fakePb({
      data: {
        players: [{ ...existing, person_code: "", manual_lock: undefined }],
      },
    });
    const [row] = await readCurrentPlayers(client);
    expect(row?.person_code).toBeNull();
    expect(row?.manual_lock).toBe(false);
  });

  it("defaults the authority to the API when the settings row is missing", async () => {
    const { client } = fakePb({ data: { app_settings: [] } });
    expect(await readRosterAuthority(client)).toBe("api");
    const csv = fakePb({
      data: { app_settings: [{ id: "s", roster_authority: "csv" }] },
    });
    expect(await readRosterAuthority(csv.client)).toBe("csv");
  });
});

describe("runRosterImport", () => {
  it("applies an authoritative import: batch first, players, verdict last", async () => {
    const fake = fakePb({
      data: {
        app_settings: [{ id: "s", roster_authority: "api" }],
        players: [existing, { ...existing, id: "p_gone", name: "Gone, Player", name_normalized: "gone player", person_code: "002" }],
      },
    });

    const outcome = await runRosterImport({
      pb: fake.client,
      incoming: [
        player({ dorsal: "7" }),
        player({
          name: "New, Player",
          name_normalized: "new player",
          person_code: null,
          club_code: "ZAL",
          club_name: "Zalgiris",
        }),
      ],
      source: "api",
      season: "2026-27",
    });

    expect(outcome.applied).toBe(true);
    expect(outcome.written).toEqual({ added: 1, changed: 1, left: 1 });
    expect(outcome.failures).toEqual([]);

    // The audit record is the first write and the verdict is the last.
    expect(fake.writes[0]).toBe("create roster_imports");
    expect(fake.writes.at(-1)).toMatch(/^update roster_imports:/);

    const added = fake.rows("players").find((row) => row.name === "New, Player");
    // null is the pipeline's "no code"; PocketBase wants "".
    expect(added).toMatchObject({ person_code: "", manual_lock: false, source: "api" });
    expect(fake.rows("players").find((row) => row.id === "p_gone")?.status).toBe("left");
    expect(fake.rows("players").find((row) => row.id === "p_sasha")?.dorsal).toBe("7");

    const batch = fake.rows("roster_imports")[0];
    expect(batch?.applied).toBe(true);
    expect(batch?.log).toMatch(/api → applied/);
    expect(batch?.log).toMatch(/\+1 added, ~1 changed, 1 marked left/);
  });

  it("stores a report-only batch for the source that lacks authority", async () => {
    const fake = fakePb({
      data: {
        app_settings: [{ id: "s", roster_authority: "api" }],
        players: [existing],
      },
    });

    const outcome = await runRosterImport({
      pb: fake.client,
      incoming: [player({ dorsal: "7" })],
      source: "csv",
      season: "2026-27",
    });

    expect(outcome.applied).toBe(false);
    expect(outcome.authority).toBe("api");
    expect(outcome.diff.changes).toHaveLength(1);
    expect(outcome.written).toEqual({ added: 0, changed: 0, left: 0 });
    // The diff is recorded; nothing in `players` moved.
    expect(fake.rows("players")[0]?.dorsal).toBe("14");
    expect(fake.writes).toEqual([
      "create roster_imports",
      "update roster_imports:roster_imports_1",
    ]);
    expect(fake.rows("roster_imports")[0]?.log).toMatch(/report-only/);
  });

  it("writes nothing for an unchanged roster", async () => {
    const fake = fakePb({
      data: {
        app_settings: [{ id: "s", roster_authority: "api" }],
        players: [existing],
      },
    });
    const outcome = await runRosterImport({
      pb: fake.client,
      incoming: [player()],
      source: "api",
      season: "2026-27",
    });
    expect(outcome.written).toEqual({ added: 0, changed: 0, left: 0 });
    expect(fake.writes.filter((write) => write.includes("players"))).toEqual([]);
  });

  it("records a refused row in the batch and carries on", async () => {
    const fake = fakePb({
      data: {
        app_settings: [{ id: "s", roster_authority: "api" }],
        players: [],
      },
      hooks: {
        beforeCreate(collection, data) {
          if (collection === "players" && data.name === "Bad, Row") {
            throw { response: { message: "Failed to create record." } };
          }
        },
      },
    });

    const outcome = await runRosterImport({
      pb: fake.client,
      incoming: [
        player({ name: "Bad, Row", name_normalized: "bad row", person_code: "9" }),
        player(),
      ],
      source: "api",
      season: "2026-27",
      problems: ["line 3: unreadable"],
    });

    expect(outcome.written.added).toBe(1);
    expect(outcome.failures).toEqual([
      "add Bad, Row (OLY): Failed to create record.",
    ]);
    const batch = fake.rows("roster_imports")[0];
    expect(batch?.applied).toBe(true);
    expect(batch?.log).toMatch(/1 problems, 1 write failures/);
    expect(batch?.log).toMatch(/add Bad, Row/);
  });
});
