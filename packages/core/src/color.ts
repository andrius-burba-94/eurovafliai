/**
 * The one OKLCH converter. The design tokens are written in OKLCH; the web's
 * contrast test measures them through this, and React Native, which renders
 * no OKLCH, gets its colours converted through the same arithmetic.
 */
export type Oklch = [number, number, number];

/** OKLCH → linear sRGB, per the Oklab spec. */
export function oklchToLinearRgb([l, c, h]: Oklch) {
  const hRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);
  const L = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const M = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const S = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ].map((v) => Math.min(Math.max(v, 0), 1));
}
