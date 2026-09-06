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
