import { describe, expect, it } from "vitest";

import { positionSentence } from "./positions";

/**
 * The one list-join in the app.
 *
 * It existed only inside `roster-radar.tsx` until 3.4a needed the same
 * sentence and wrote a second one that joined with `" and "` — so three
 * positions came out as "5 G and 5 F and 3 C". These are the cases that
 * mistake would have passed.
 */
describe("positionSentence", () => {
  it("joins three with commas and a final 'and'", () => {
    expect(positionSentence({ G: 5, F: 5, C: 3 })).toBe(
      "5 guards, 5 forwards and 3 centers",
    );
  });

  it("joins two with 'and' alone", () => {
    expect(positionSentence({ G: 5, C: 3 })).toBe("5 guards and 3 centers");
  });

  it("says one on its own", () => {
    expect(positionSentence({ C: 3 })).toBe("3 centers");
  });

  it("agrees the noun with the number", () => {
    expect(positionSentence({ G: 1, F: 2 })).toBe("1 guard and 2 forwards");
  });

  it("omits a zero rather than printing '0 guards'", () => {
    expect(positionSentence({ G: 0, F: 2, C: 0 })).toBe("2 forwards");
  });

  it("falls back to the caller's word when everything is zero", () => {
    expect(positionSentence({ G: 0, F: 0, C: 0 })).toBe("nothing");
    expect(positionSentence({}, "none of them")).toBe("none of them");
  });

  it("keeps the position order of the roster template, not the caller's", () => {
    expect(positionSentence({ C: 3, G: 5 })).toBe("5 guards and 3 centers");
  });

  it("says center, not centre", () => {
    // 3.2 drifted to the British spelling and had to be corrected across the
    // app; PRODUCT.md, the blueprint and the Euroleague API all say Center.
    expect(positionSentence({ C: 1 })).not.toContain("centre");
  });
});

describe("keepZeros — when a nought is the point", () => {
  it("keeps a zero when asked, so the missing position is named", () => {
    // The defect this option exists for: the cheat sheet said "You have ranked
    // 4 guards and 1 center" while a full roster "needs 5 guards, 5 forwards
    // and 3 centers" — dropping the one position the member had none of, which
    // is the one that strands autodraft.
    expect(
      positionSentence({ G: 4, F: 0, C: 1 }, "nothing", { keepZeros: true }),
    ).toBe("4 guards, 0 forwards and 1 center");
  });

  it("still drops zeros by default, which is what the radar wants", () => {
    expect(positionSentence({ G: 4, F: 0, C: 1 })).toBe("4 guards and 1 center");
  });

  it("says every nought rather than falling back to the empty phrase", () => {
    expect(
      positionSentence({ G: 0, F: 0, C: 0 }, "nothing", { keepZeros: true }),
    ).toBe("0 guards, 0 forwards and 0 centers");
  });

  it("omits a position that is absent rather than zero", () => {
    // `undefined` still means "not part of this sentence" — the cheat sheet
    // builds its object from the positions that are actually short.
    expect(
      positionSentence({ G: 0, C: 2 }, "nothing", { keepZeros: true }),
    ).toBe("0 guards and 2 centers");
  });
});
