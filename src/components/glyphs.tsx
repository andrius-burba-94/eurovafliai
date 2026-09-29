/**
 * The moments' own marks: a crown, a wooden spoon, a flame, a star. Filled
 * silhouettes on a 24-unit grid, `currentColor`, always `aria-hidden` beside
 * a word that says the same thing.
 */
export type GlyphName = "crown" | "spoon" | "flame" | "star" | "swap";

const PATHS: Record<GlyphName, string> = {
  crown: "M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z",
  spoon:
    "M14.5 3.5c2.5 0 4 2 4 4.5s-2 4.5-4.5 4.5c-.9 0-1.6-.2-2.2-.6L5 18.8 3.7 17.5l6.9-6.8c-.4-.6-.6-1.3-.6-2.2 0-2.6 1.9-5 4.5-5z",
  flame: "M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-3.8 2.5-5 .3 1.5 1 2.5 2 3 0-3-.5-5.5.5-8z",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z",
  swap: "M4 8h14l-3-3M20 16H6l3 3",
};

export function Glyph({ name, size = 20, className = "" }: { name: GlyphName; size?: number; className?: string }) {
  const stroked = name === "swap";
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      fill={stroked ? "none" : "currentColor"}
      stroke={stroked ? "currentColor" : "none"}
      strokeWidth={stroked ? 1.75 : undefined}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
