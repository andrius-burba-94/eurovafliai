import { describe, expect, it } from "vitest";

import { diffRosters } from "./diff";
import { normalizeName } from "./normalize";
import type { ExistingPlayer, NormalizedPlayer } from "./types";

function incoming(
  over: Partial<NormalizedPlayer> & { name: string },
): NormalizedPlayer {
  return {
    name_normalized: normalizeName(over.name),
    club_code: "ZAL",
    club_name: "Zalgiris Kaunas",
    position: "G",
    status: "active",
    person_code: null,
    source: "api",
    dorsal: "",
    ...over,
  };
}

function existing(
  over: Partial<ExistingPlayer> & { id: string; name: string },
): ExistingPlayer {
  return {
    ...incoming(over),
    manual_lock: false,
    ...over,
  };
}

describe("diffRosters — matching", () => {
  it("matches on person_code even when the club changed", () => {
    // A transfer. The code is the identity, so this is one player who moved,
    // not a departure plus an arrival.
    const diff = diffRosters({
      current: [
        existing({ id: "p1", name: "Sirvydis, Deividas", person_code: "0042", club_code: "ZAL" }),
      ],
      incoming: [
        incoming({ name: "Sirvydis, Deividas", person_code: "0042", club_code: "MAD", club_name: "Real Madrid" }),
      ],
    });

    expect(diff.adds).toHaveLength(0);
    expect(diff.leaving).toHaveLength(0);
    expect(diff.changes).toHaveLength(1);
    expect(diff.changes[0]?.fields).toMatchObject({ club_code: "MAD" });
  });

  it("matches on normalized name plus club when there is no code", () => {
    // The common path, not the edge case: 13% of E2026 players have no code.
    const diff = diffRosters({
      current: [existing({ id: "p1", name: "SIRVYDIS, DEIVIDAS" })],
      incoming: [incoming({ name: "Deividas Sirvydis", dorsal: "7" })],
    });

    expect(diff.adds).toHaveLength(0);
    expect(diff.changes).toHaveLength(1);
    // The *display* name changes too, and that is deliberate: the two front
    // doors write names in different formats ("SURNAME, FIRSTNAME" from the
    // API, whatever a spreadsheet feels like), and whichever one is the
    // authority owns how a name is spelled on the board. The folded key is
    // unchanged, which is why this is one player and not two.
    expect(diff.changes[0]?.fields).toEqual({
      name: "Deividas Sirvydis",
      dorsal: "7",
    });
    expect(diff.changes[0]?.before).toMatchObject({ name: "SIRVYDIS, DEIVIDAS" });
  });

  it("reads a codeless player who changed club as a departure and an arrival", () => {
    // Documented consequence of the blueprint's matching rule, not an accident:
    // without a code there is nothing to tie the two rows together. The
    // preview shows both, and a later sync that fills the code in will match
    // properly from then on.
    const diff = diffRosters({
      current: [existing({ id: "p1", name: "Nowell, Jaylen", club_code: "BES" })],
      incoming: [incoming({ name: "Nowell, Jaylen", club_code: "PAN", club_name: "Panathinaikos" })],
    });

    expect(diff.adds).toHaveLength(1);
    expect(diff.leaving).toEqual([
      { id: "p1", name: "Nowell, Jaylen", club_code: "BES" },
    ]);
  });

  it("refuses two incoming rows that would collide on the same key", () => {
    // The unique index would reject the second write anyway; catching it here
    // means the commissioner sees it in the preview instead of a failed apply.
    const diff = diffRosters({
      current: [],
      incoming: [
        incoming({ name: "Jones, Chris", person_code: "77" }),
        incoming({ name: "Jones, Chris", person_code: "77", club_code: "MIL" }),
      ],
    });

    expect(diff.adds).toHaveLength(1);
    expect(diff.problems.join(" ")).toMatch(/twice|duplicate/i);
  });
});

describe("diffRosters — person codes are never lost", () => {
  it("keeps an existing code when the incoming row has none", () => {
    // The merge rule the blueprint states, and the research says has to work
    // API→API as well as CSV→API: a re-sync must never blank a code that a
    // stats join depends on.
    const diff = diffRosters({
      current: [existing({ id: "p1", name: "Hall, Donta", person_code: "0099" })],
      incoming: [incoming({ name: "Hall, Donta", person_code: null })],
    });

    expect(diff.changes).toHaveLength(0);
  });

  it("fills in a code that was missing", () => {
    const diff = diffRosters({
      current: [existing({ id: "p1", name: "Burnell, Jason", person_code: null })],
      incoming: [incoming({ name: "Burnell, Jason", person_code: "0123" })],
    });

    expect(diff.changes[0]?.fields).toEqual({ person_code: "0123" });
  });

  it("does not silently replace one code with a different one", () => {
    // Two different codes on a name+club match means the match itself is
    // suspect — a namesake, or a feed error. Overwriting would corrupt the
    // stats join for whichever player is real.
    const diff = diffRosters({
      current: [existing({ id: "p1", name: "Jones, Chris", person_code: "0001" })],
      incoming: [incoming({ name: "Jones, Chris", person_code: "0002" })],
    });

    expect(diff.changes).toHaveLength(0);
    expect(diff.adds).toHaveLength(0);
    expect(diff.problems.join(" ")).toMatch(/0001|0002/);
  });
});

describe("diffRosters — manual_lock", () => {
  it("blocks a change to a locked player and says which fields", () => {
    const diff = diffRosters({
      current: [
        existing({ id: "p1", name: "Hall, Donta", position: "C", manual_lock: true }),
      ],
      incoming: [incoming({ name: "Hall, Donta", position: "F", dorsal: "5" })],
    });

    expect(diff.changes).toHaveLength(0);
    expect(diff.blocked).toEqual([
      { id: "p1", name: "Hall, Donta", fields: ["position", "dorsal"] },
    ]);
  });

  it("does not mark a locked player as leaving either", () => {
    // A lock is the commissioner saying "this row is mine". Marking it `left`
    // would be an ingest overruling that from the other direction.
    const diff = diffRosters({
      current: [existing({ id: "p1", name: "Ghost, Player", manual_lock: true })],
      incoming: [],
    });

    expect(diff.leaving).toHaveLength(0);
    expect(diff.blocked[0]?.fields).toContain("status");
  });

  it("leaves a locked player alone when nothing would change", () => {
    const diff = diffRosters({
      current: [existing({ id: "p1", name: "Hall, Donta", manual_lock: true })],
      incoming: [incoming({ name: "Hall, Donta" })],
    });

    expect(diff.blocked).toHaveLength(0);
    expect(diff.changes).toHaveLength(0);
  });
});

describe("diffRosters — departures and idempotency", () => {
  it("marks a player the source no longer lists as leaving", () => {
    const diff = diffRosters({
      current: [existing({ id: "p1", name: "Gone, Guy" })],
      incoming: [incoming({ name: "Stayed, Sam" })],
    });

    expect(diff.adds.map((a) => a.name)).toEqual(["Stayed, Sam"]);
    expect(diff.leaving.map((l) => l.id)).toEqual(["p1"]);
  });

  it("does not re-mark someone who already left", () => {
    const diff = diffRosters({
      current: [existing({ id: "p1", name: "Gone, Guy", status: "left" })],
      incoming: [],
    });

    expect(diff.leaving).toHaveLength(0);
  });

  it("brings a player who left and came back to active", () => {
    const diff = diffRosters({
      current: [existing({ id: "p1", name: "Back, Bob", status: "left" })],
      incoming: [incoming({ name: "Back, Bob", status: "active" })],
    });

    expect(diff.changes[0]?.fields).toEqual({ status: "active" });
  });

  it("is empty for an unchanged roster, so re-running an apply writes nothing", () => {
    // Idempotence is the property that makes "re-sync on demand through
    // September" (blueprint 2.1) safe to do as often as you like.
    const current = [
      existing({ id: "p1", name: "Sirvydis, Deividas", person_code: "0042", dorsal: "7" }),
      existing({ id: "p2", name: "Ulanovas, Edgaras", position: "F" }),
    ];
    const diff = diffRosters({
      current,
      // Strip the two fields an incoming row does not carry. Written as a
      // pick rather than a destructure because this repo's eslint does not
      // exempt underscore-prefixed bindings, and it sits at zero warnings.
      incoming: current.map((row) => ({
        name: row.name,
        name_normalized: row.name_normalized,
        club_code: row.club_code,
        club_name: row.club_name,
        position: row.position,
        status: row.status,
        person_code: row.person_code,
        source: row.source,
        dorsal: row.dorsal,
      })),
    });

    expect(diff).toMatchObject({
      adds: [],
      changes: [],
      leaving: [],
      blocked: [],
      problems: [],
    });
  });

  it("never reports an injury status as a change, since the source cannot know", () => {
    // The API has no injury feed: everything it sends is `active`. If that
    // overwrote a commissioner's "injured", every sync would quietly heal the
    // squad — so an incoming `active` never demotes a local status that is
    // more specific.
    const diff = diffRosters({
      current: [existing({ id: "p1", name: "Sore, Sam", status: "injured" })],
      incoming: [incoming({ name: "Sore, Sam", status: "active" })],
    });

    expect(diff.changes).toHaveLength(0);
  });
});
