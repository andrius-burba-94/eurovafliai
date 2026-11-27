/**
 * Integer tenths as a human reads them: `33` → `"3.3"`, `-11` → `"-1.1"`.
 *
 * The one place tenths become a decimal, and it happens in a string rather
 * than in a number so nothing downstream can accumulate the error this whole
 * scheme exists to avoid.
 */
export function formatTenths(tenths: number): string {
  const sign = tenths < 0 ? "-" : "";
  const absolute = Math.abs(tenths);
  return `${sign}${Math.trunc(absolute / 10)}.${absolute % 10}`;
}

/** A signed fantasy total for deltas. Hyphen, never an em dash. */
export function formatSignedTenths(tenths: number): string {
  if (tenths < 0) return formatTenths(tenths);
  return `+${formatTenths(tenths)}`;
}

/**
 * A team total in integer hundredths, printed the way the official game prints
 * it: `16460` → `"164.6"`, `12115` → `"121.15"`, `14300` → `"143.0"`. The
 * second decimal appears only when a bench half put something there, so a
 * table of whole tenths reads exactly as it did before hundredths existed.
 */
export function formatHundredths(hundredths: number): string {
  const sign = hundredths < 0 ? "-" : "";
  const absolute = Math.abs(hundredths);
  const whole = Math.trunc(absolute / 100);
  const cents = absolute % 100;
  const decimals = cents % 10 === 0 ? String(cents / 10) : String(cents).padStart(2, "0");
  return `${sign}${whole}.${decimals}`;
}

export function formatSignedHundredths(hundredths: number): string {
  if (hundredths < 0) return formatHundredths(hundredths);
  return `+${formatHundredths(hundredths)}`;
}
