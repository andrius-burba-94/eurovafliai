import { describe, expect, it } from "vitest";

import pool from "@/lib/fantasy/fixtures/pool.json";

import { clubLabel } from "./labels";

describe("clubLabel", () => {
  it("prints the broadcast code where the feed's key differs", () => {
    expect(clubLabel("ULK")).toBe("FBT");
    expect(clubLabel("IST")).toBe("EFS");
    expect(clubLabel("mad")).toBe("RMB");
  });

  it("keeps a code whose broadcast code is the same, or one it does not know", () => {
    expect(clubLabel("ASV")).toBe("ASV");
    expect(clubLabel("XYZ")).toBe("XYZ");
    expect(clubLabel(null)).toBeNull();
  });

  it("gives every club in the season's pool a distinct three-letter label", () => {
    const codes = [...new Set((pool as readonly { club_code?: string }[]).map((row) => row.club_code).filter(Boolean))] as string[];
    const labels = codes.map((code) => clubLabel(code));
    expect(new Set(labels).size).toBe(codes.length);
    for (const label of labels) expect(label).toMatch(/^[A-Z]{3}$/);
  });
});
