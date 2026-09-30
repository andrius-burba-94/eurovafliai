import Link from "next/link";

/**
 * Every counted round as a chip, newest last — a round is picked, never typed.
 * Links, so the page works before JavaScript and a round is a URL to share.
 */
export function RoundPicker({
  leagueId,
  season,
  round,
  rounds,
}: {
  leagueId: string;
  season: string;
  round: number;
  rounds: readonly number[];
}) {
  return (
    <nav aria-label="Counted rounds" data-testid="recap-rounds" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {rounds.map((n) => (
        <Link
          key={n}
          href={`/leagues/${leagueId}/recap?${new URLSearchParams({ season, round: String(n) })}`}
          data-testid={`recap-round-${n}`}
          aria-current={n === round ? "page" : undefined}
          className={`inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border px-3.5 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live ${
            n === round ? "border-ink bg-ink text-stock" : "border-rule text-ink-soft hover:border-ink-soft hover:text-ink"
          }`}
        >
          R{n}
        </Link>
      ))}
    </nav>
  );
}
