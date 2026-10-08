import { ChipNav } from "@/components/chip-nav";

/**
 * Every counted round as a chip, newest last — a round is picked, never typed.
 * A round with a game left says so on its chip.
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
    <ChipNav
      label="Counted rounds"
      testId="recap-rounds"
      chips={rounds.map((n) => ({
        key: String(n),
        href: `${base}/recap?${new URLSearchParams({ season, round: String(n) })}`,
        current: n === round,
        testId: `recap-round-${n}`,
        children: (
          <>
            R{n}
            {complete.includes(n) ? null : (
              <span className={`ml-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] ${n === round ? "text-stock/80" : "text-live"}`}>
                in progress
              </span>
            )}
          </>
        ),
      }))}
    />
  );
}
