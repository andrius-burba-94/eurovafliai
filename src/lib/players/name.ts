/**
 * How a player's name is shown, as opposed to how it is stored.
 *
 * Ingestion stores "Surname, First" (`rosters/normalize.ts`), which is the
 * order matching, search and sorting are built on and the order exports keep.
 * People read "First Surname", so every screen goes through `displayName`.
 * A few players are known by names shorter than the feed's passport names.
 * Those presentation names stay here; ingestion still matches the feed's
 * original `name` and `name_normalized`.
 *
 * A name with no comma is passed through whole rather than guessed at: the CSV
 * front door takes whatever a league's spreadsheet says, and "Nando De Colo"
 * must not become "Colo, Nando De" or "De".
 */
const familiarNames: Record<string, { display: string; surname: string }> = {
  "James, Michael Perry": { display: "Mike James", surname: "James" },
  "Dozier Jr, Perry Linnard": { display: "PJ Dozier", surname: "Dozier" },
  "Shorts Vtori, Timothy Neocartes": { display: "TJ Shorts", surname: "Shorts" },
  "Tucker, Talen Jalee": { display: "Talen Horton-Tucker", surname: "Horton-Tucker" },
  "Durisic, Nikola": { display: "Nikola Djurisic", surname: "Djurisic" },
  "Len, Oleksii": { display: "Alex Len", surname: "Len" },
  "Lawson, Anthony": { display: "A.J. Lawson", surname: "Lawson" },
  "Dunston Jr, Bryant Kevin": { display: "Bryant Dunston", surname: "Dunston" },
  "Smith Jr, Nicholas Terrell": { display: "Nick Smith Jr", surname: "Smith Jr" },
};

export function displayName(stored: string): string {
  const familiar = familiarNames[stored];
  if (familiar) return familiar.display;
  const comma = stored.indexOf(",");
  if (comma === -1) return stored.trim();
  const last = stored.slice(0, comma).trim();
  const first = stored.slice(comma + 1).trim();
  return first ? `${first} ${last}` : last;
}

/** The surname alone, for a slot too narrow for the rest. */
export function surname(stored: string): string {
  const familiar = familiarNames[stored];
  if (familiar) return familiar.surname;
  const comma = stored.indexOf(",");
  return comma === -1 ? stored.trim() : stored.slice(0, comma).trim();
}
