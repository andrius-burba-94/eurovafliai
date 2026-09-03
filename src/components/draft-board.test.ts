import { describe, expect, it } from "vitest";

import { boardName } from "./draft-board";

/**
 * What gets written in a slot six characters wide.
 *
 * Ingestion stores "Surname, First", so the surname is already the first field
 * — but the CSV front door (2.1b) takes whatever a league's spreadsheet says,
 * and a board that guessed at the comma-less case would write "Nando" in a slot
 * that should read "De Colo".
 */
describe("boardName", () => {
  it("takes the surname the API's format puts first", () => {
    expect(boardName("De Colo, Nando")).toBe("De Colo");
    expect(boardName("Nunn, Kendrick")).toBe("Nunn");
  });

  it("writes a comma-less name whole rather than guessing", () => {
    expect(boardName("Nando De Colo")).toBe("Nando De Colo");
    expect(boardName("Sloukas")).toBe("Sloukas");
  });

  it("survives the ragged edges of a pasted sheet", () => {
    expect(boardName("Nunn ,  Kendrick")).toBe("Nunn");
    expect(boardName("")).toBe("");
  });
});
