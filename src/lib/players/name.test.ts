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

  it("shows familiar player names while leaving feed names available for matching", () => {
    expect([
      "James, Michael Perry",
      "Dozier Jr, Perry Linnard",
      "Shorts Vtori, Timothy Neocartes",
      "Tucker, Talen Jalee",
      "Durisic, Nikola",
      "Len, Oleksii",
      "Lawson, Anthony",
      "Dunston Jr, Bryant Kevin",
      "Smith Jr, Nicholas Terrell",
    ].map(displayName)).toEqual([
      "Mike James",
      "PJ Dozier",
      "TJ Shorts",
      "Talen Horton-Tucker",
      "Nikola Djurisic",
      "Alex Len",
      "A.J. Lawson",
      "Bryant Dunston",
      "Nick Smith Jr",
    ]);
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

  it("uses the familiar surname on compact player labels", () => {
    expect(surname("Dozier Jr, Perry Linnard")).toBe("Dozier");
    expect(surname("Tucker, Talen Jalee")).toBe("Horton-Tucker");
    expect(surname("Durisic, Nikola")).toBe("Djurisic");
    expect(surname("Smith Jr, Nicholas Terrell")).toBe("Smith Jr");
  });
});
