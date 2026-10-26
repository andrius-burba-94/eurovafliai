import { describe, expect, it } from "vitest";
import { fakePb } from "../../../tests/unit/helpers/fake-pb";
import koloko from "../../../tests/fixtures/basketnews-koloko.json";
import { basketNewsPlayer } from "./client";
import { approveSourcePlayer, completeSourcePlayerRecovery, confirmSourcePlayers, recoverSourcePlayers, rememberSourcePlayers } from "./registrations";
import { diffRosters } from "@/lib/rosters/diff";
import { readCurrentPlayers } from "@/lib/rosters/apply";
import { normalizeName } from "@/lib/rosters/normalize";
import type { NormalizedPlayer } from "@/lib/rosters/types";

const player = basketNewsPlayer(koloko);
const NOW = new Date("2026-10-23T09:00:00Z");
const official: NormalizedPlayer = {
  name: "Koloko, Christian", name_normalized: normalizeName("Christian Koloko"), club_code: "RED", club_name: player.club.name,
  position: "C", status: "active", person_code: "014999", source: "api", dorsal: "35",
};
const teammate = { ...official, id: "teammate", name: "Moneke, Chima", name_normalized: normalizeName("Chima Moneke"), person_code: "014000", basketnews_id: "", manual_lock: false };
function database() {
  return fakePb({ data: {
    players: [teammate], leagues: [{ id: "league", season: "2026-27", basketnews_team_id: "team" }],
    source_player_questions: [], fantasy_syncs: [],
  } });
}
const approval = { leagueId: "league", season: "E2026", userId: "manager", sourceId: player.id, freshPool: [player] };

describe("source player registration", () => {
  it("keeps one question across repeated reads and several leagues, without creating a player", async () => {
    const db = database();
    await rememberSourcePlayers(db.client, "league", "E2026", [player]);
    await rememberSourcePlayers(db.client, "second", "E2026", [player]);
    await rememberSourcePlayers(db.client, "league", "E2026", [player]);
    expect(db.rows("source_player_questions")).toHaveLength(1);
    expect(db.rows("source_player_questions")[0]?.leagues).toEqual(["league", "second"]);
    expect(db.rows("players")).toHaveLength(1);
  });

  it("approves the fresh listing without a jersey or invented code, and retries without duplicates", async () => {
    const db = database();
    const id = await approveSourcePlayer(db.client, approval);
    expect(await approveSourcePlayer(db.client, approval)).toBe(id);
    expect(db.rows("players")).toHaveLength(2);
    expect(db.rows("players").find((row) => row.id === id)).toMatchObject({ basketnews_id: player.id, person_code: "", dorsal: "", awaiting_registration: true, source: "manual" });
    expect(db.rows("fantasy_syncs")).toHaveLength(1);
    const current = await readCurrentPlayers(db.client);
    expect(diffRosters({ current, incoming: [{ ...teammate, source: "api" }] }).leaving).toEqual([]);
    expect(diffRosters({ current, incoming: [teammate, official] }).changes.find((row) => row.id === id)?.fields.person_code).toBe(official.person_code);
  });

  it("does not approve a player absent from the fresh source pool", async () => {
    const db = database();
    await expect(approveSourcePlayer(db.client, { ...approval, freshPool: [] })).rejects.toThrow("no longer lists");
    expect(db.rows("players")).toHaveLength(1);
  });

  it("refuses a possible existing namesake instead of creating another player", async () => {
    const db = database();
    db.rows("players").push({ ...teammate, id: "namesake", name: "Koloko, Christopher", name_normalized: normalizeName("Christopher Koloko") });
    await expect(approveSourcePlayer(db.client, approval)).rejects.toThrow("needs mapping");
    expect(db.rows("players")).toHaveLength(2);
  });

  it("confirms later official registration on the same player id", async () => {
    const db = database();
    const id = await approveSourcePlayer(db.client, approval);
    await db.client.collection("players").update(id, { person_code: official.person_code });
    await confirmSourcePlayers(db.client, "E2026", [official], NOW);
    expect(db.rows("players").find((row) => row.id === id)).toMatchObject({ awaiting_registration: false, person_code: official.person_code });
    expect(db.rows("source_player_questions")[0]).toMatchObject({ player: id, status: "confirmed", checked_at: NOW.toISOString() });
    expect(db.rows("players")).toHaveLength(2);
  });

  it("automatically confirms an imported official player without prior manual approval", async () => {
    const db = database();
    await rememberSourcePlayers(db.client, "league", "E2026", [player]);
    db.rows("players").push({ ...official, id: "registered", manual_lock: false });
    await confirmSourcePlayers(db.client, "E2026", [official], NOW);
    expect(db.rows("source_player_questions")[0]).toMatchObject({ status: "confirmed", player: "registered" });
    expect(db.rows("players").find((row) => row.id === "registered")?.basketnews_id).toBe(player.id);
    expect(db.rows("fantasy_syncs")).toHaveLength(1);
  });

  it("waits on ambiguous official matches and respects locked players", async () => {
    const db = database();
    await rememberSourcePlayers(db.client, "league", "E2026", [player]);
    db.rows("players").push({ ...official, id: "locked", manual_lock: true });
    await confirmSourcePlayers(db.client, "E2026", [official, { ...official, person_code: "other" }], NOW);
    expect(db.rows("source_player_questions")[0]?.status).toBe("pending");
    await confirmSourcePlayers(db.client, "E2026", [official], NOW);
    expect(db.rows("source_player_questions")[0]?.status).toBe("pending");
    expect(db.rows("players").find((row) => row.id === "locked")?.basketnews_id).toBeUndefined();
  });

  it("retains a failed queue operation and finishes it on an unchanged pass", async () => {
    let fail = true;
    const db = fakePb({ data: database().db, hooks: { beforeCreate(collection) { if (collection === "fantasy_syncs" && fail) { fail = false; throw new Error("queue unavailable"); } } } });
    await expect(approveSourcePlayer(db.client, approval)).rejects.toThrow("queue unavailable");
    expect(db.rows("source_player_questions")[0]).toMatchObject({ status: "approved", recovery_pending: true });
    const id = db.rows("players").find((row) => row.basketnews_id === player.id)!.id;
    await recoverSourcePlayers(db.client, "E2026");
    expect(db.rows("source_player_questions")[0]?.recovery_pending).toBe(true);
    await completeSourcePlayerRecovery(db.client, "E2026", "league");
    expect(db.rows("source_player_questions")[0]).toMatchObject({ player: id, recovery_pending: false });
    expect(db.rows("fantasy_syncs")).toHaveLength(1);
  });

  it("the official poll resumes a saved manual approval after player creation failed", async () => {
    let fail = true;
    const db = fakePb({ data: database().db, hooks: { beforeCreate(collection) { if (collection === "players" && fail) { fail = false; throw new Error("storage unavailable"); } } } });
    await expect(approveSourcePlayer(db.client, approval)).rejects.toThrow("storage unavailable");
    expect(db.rows("source_player_questions")[0]).toMatchObject({ approved_by: "manager", status: "pending", recovery_pending: true });
    await confirmSourcePlayers(db.client, "E2026", [], NOW, {
      teamReference: async () => ({ id: "team", title: "Team", leagueId: "competition", fantasyLeagues: [] }),
      playerPool: async () => [player],
    });
    expect(db.rows("players").filter((row) => row.basketnews_id === player.id)).toHaveLength(1);
    expect(db.rows("source_player_questions")[0]?.status).toBe("approved");
    expect(db.rows("fantasy_syncs")).toHaveLength(1);
  });
});
