import { describe, expect, it } from "vitest";

import { displayName, surname } from "./name";

describe("displayName", () => {
  it("puts the first name first", () => {
    expect(displayName("Vezenkov, Alexander")).toBe("Alexander Vezenkov");
    expect(displayName("Valančiūnas, Jonas")).toBe("Jonas Valančiūnas");
  });

  it("keeps a multi-part surname together", () => {
    expect(displayName("De Colo, Nando")).toBe("Nando De Colo");
    expect(displayName("Moneke, Nwachukwu Iheukwumere Chima")).toBe("Nwachukwu Iheukwumere Chima Moneke");
  });

  it("writes a comma-less name whole rather than guessing", () => {
    expect(displayName("Nando De Colo")).toBe("Nando De Colo");
    expect(displayName("Sloukas")).toBe("Sloukas");
  });

  it("survives the ragged edges of a pasted sheet", () => {
    expect(displayName("Nunn ,  Kendrick ")).toBe("Kendrick Nunn");
    expect(displayName("Nunn,")).toBe("Nunn");
    expect(displayName("")).toBe("");
  });
});

/**
 * What gets written in a slot six characters wide: the surname the stored
 * format puts first, or a comma-less name whole.
 */
describe("surname", () => {
  it("takes the surname the API's format puts first", () => {
    expect(surname("De Colo, Nando")).toBe("De Colo");
    expect(surname("Nunn, Kendrick")).toBe("Nunn");
  });

  it("writes a comma-less name whole rather than guessing", () => {
    expect(surname("Nando De Colo")).toBe("Nando De Colo");
    expect(surname("Sloukas")).toBe("Sloukas");
  });

  it("survives the ragged edges of a pasted sheet", () => {
    expect(surname("Nunn ,  Kendrick")).toBe("Nunn");
    expect(surname("")).toBe("");
  });
});
