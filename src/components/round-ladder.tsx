import Link from "next/link";

import { Slot, Slots } from "@/components/board";
import { TeamCrest } from "@/components/broadcast";
import { Glyph } from "@/components/glyphs";
import type { RecapRow } from "@/lib/stats/recap";
import { formatHundredths } from "@/lib/stats/scoring";
import type { TeamStyle } from "@/lib/teams/identity";

/**
 * One round's night as a ladder: every team by its points that round, a bar
 * in its own colour scaled to the top score. Recap draws a finished night
 * with its crown and spoon; League Home draws the night still being played
 * with neither, because nobody has won it yet.
 */
export function RoundLadder({
  rows,
  names,
  styles,
  hrefOf,
  marks,
  testId,
  label,
  dense = false,
}: {
  rows: readonly RecapRow[];
  names: Readonly<Record<string, string>>;
  styles: Readonly<Record<string, TeamStyle>>;
  hrefOf: (memberId: string) => string;
  /** The crown on the winner and the spoon on last place: a finished round only. */
  marks: boolean;
  /** Prefix for `-table`, `-row`, `-team` and `-tenths`. */
  testId: string;
  label: string;
  /** A narrow column: smaller crests, and names wrap to two lines rather than cut. */
  dense?: boolean;
}) {
  const top = rows[0]?.hundredths ?? 0;
  return (
    <Slots testId={`${testId}-table`} label={label}>
      {rows.map((row, index) => {
        const style = styles[row.memberId];
        const name = names[row.memberId] ?? "A team";
        const last = index === rows.length - 1 && rows.length > 1;
        return (
          <Slot key={row.memberId} testId={`${testId}-row`} state="filled" nowrap>
            <Link
              href={hrefOf(row.memberId)}
              data-testid={`${testId}-team`}
              className={`-mx-3 -my-3 flex min-h-12 min-w-0 flex-1 items-center px-3 py-2.5 transition-colors hover:bg-ink/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-live ${dense ? "gap-2" : "gap-3"}`}
            >
              <span className={`stat shrink-0 text-xs text-ink-faint ${dense ? "w-4" : "w-5"}`}>{index + 1}</span>
              {style ? <TeamCrest name={name} color={style.color} shape={style.crest} size={dense ? 20 : 28} /> : null}
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span
                  className={`flex items-center gap-1.5 text-sm font-semibold ${dense ? "leading-tight break-words" : "truncate"}`}
                >
                  {name}
                  {marks && index === 0 && top > 0 ? <Glyph name="crown" size={13} className="text-gold" /> : null}
                  {marks && last && top > 0 ? <Glyph name="spoon" size={13} className="text-wood" /> : null}
                </span>
                <span className="block h-1.5 overflow-hidden rounded-full bg-stock-high" aria-hidden="true">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${top > 0 ? Math.max(4, (Math.max(0, row.hundredths) / top) * 100) : 0}%`,
                      background: style ? `var(--color-team-${style.color})` : "var(--color-live)",
                    }}
                  />
                </span>
              </span>
              <span className="stat text-sm font-semibold" data-testid={`${testId}-tenths`}>
                {formatHundredths(row.hundredths)}
              </span>
            </Link>
          </Slot>
        );
      })}
    </Slots>
  );
}
