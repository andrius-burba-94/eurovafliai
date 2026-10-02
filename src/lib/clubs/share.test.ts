import { describe, expect, it } from "vitest";

import { clubShares } from "./share";

describe("clubShares", () => {
  it("shares out of every club, not only the ones drawn", () => {
    const shares = clubShares(
      [
        { clubCode: "MAD", tenths: 500 },
        { clubCode: "PAN", tenths: 300 },
        { clubCode: "OLY", tenths: 200 },
      ],
      2,
    );
    expect(shares).toEqual([
      { clubCode: "MAD", percent: 50, label: "50%" },
      { clubCode: "PAN", percent: 30, label: "30%" },
    ]);
  });

  it("counts a negative night as nothing and leaves it off the bar", () => {
    const shares = clubShares(
      [
        { clubCode: "MAD", tenths: 300 },
        { clubCode: "BAR", tenths: 100 },
        { clubCode: "ASV", tenths: -40 },
      ],
      5,
    );
    expect(shares.map((share) => share.label)).toEqual(["75%", "25%"]);
  });

  it("names a sliver rather than printing 0%", () => {
    const shares = clubShares(
      [
        { clubCode: "MAD", tenths: 999 },
        { clubCode: "BAR", tenths: 4 },
      ],
      5,
    );
    expect(shares[1]!.label).toBe("<1%");
  });

  it("draws nothing for a team with no counted points", () => {
    expect(clubShares([{ clubCode: "MAD", tenths: 0 }], 5)).toEqual([]);
  });
});
