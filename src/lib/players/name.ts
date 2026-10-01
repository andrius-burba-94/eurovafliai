/**
 * How a player's name is shown, as opposed to how it is stored.
 *
 * Ingestion stores "Surname, First" (`rosters/normalize.ts`), which is the
 * order matching, search and sorting are built on and the order exports keep.
 * People read "First Surname", so every screen goes through `displayName`.
 *
 * A name with no comma is passed through whole rather than guessed at: the CSV
 * front door takes whatever a league's spreadsheet says, and "Nando De Colo"
 * must not become "Colo, Nando De" or "De".
 */
export function displayName(stored: string): string {
  const comma = stored.indexOf(",");
  if (comma === -1) return stored.trim();
  const last = stored.slice(0, comma).trim();
  const first = stored.slice(comma + 1).trim();
  return first ? `${first} ${last}` : last;
}

/** The surname alone, for a slot too narrow for the rest. */
export function surname(stored: string): string {
  const comma = stored.indexOf(",");
  return comma === -1 ? stored.trim() : stored.slice(0, comma).trim();
}
