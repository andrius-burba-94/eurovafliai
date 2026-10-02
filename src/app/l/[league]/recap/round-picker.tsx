import Link from "next/link";

/**
 * Every counted round as a chip, newest last — a round is picked, never typed.
 * Links, so the page works before JavaScript and a round is a URL to share. A
 * round with a game left says so on its chip.
 */
export function RoundPicker({
  base,
  season,
  round,
  rounds,
  complete,
}: {
  base: string;
  season: string;
  round: number;
  rounds: readonly number[];
  complete: readonly number[];
}) {
  return (
    <nav aria-label="Counted rounds" data-testid="recap-rounds" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {rounds.map((n) => (
        <Link
          key={n}
          href={`${base}/recap?${new URLSearchParams({ season, round: String(n) })}`}
          data-testid={`recap-round-${n}`}
          aria-current={n === round ? "page" : undefined}
          className={`inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border px-3.5 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live ${
            n === round ? "border-ink bg-ink text-stock" : "border-rule text-ink-soft hover:border-ink-soft hover:text-ink"
          }`}
        >
          R{n}
          {complete.includes(n) ? null : (
            <span className={`ml-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] ${n === round ? "text-stock/80" : "text-live"}`}>
              in progress
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
