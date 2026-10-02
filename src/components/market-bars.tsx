import Link from "next/link";
import type { ReactNode } from "react";

import { formatSignedTenths } from "@/lib/stats/scoring";

export type MarketRow = readonly [memberId: string, entry: { readonly netTenths: number; readonly deals: number }];

/**
 * Who is winning the market: each team's net points since its deals, as a bar
 * either side of one centre rule, green to the right and red to the left,
 * with the figure that says the same thing. Trades leads with it; Stats keeps
 * it as the deal ledger.
 */
export function MarketBars({
  rows,
  name,
  crest,
  hrefOf,
  showDeals = false,
  testId,
}: {
  rows: readonly MarketRow[];
  name: (memberId: string) => string;
  crest: (memberId: string, size: number) => ReactNode;
  hrefOf?: (memberId: string) => string;
  showDeals?: boolean;
  testId: string;
}) {
  const widest = Math.max(1, ...rows.map(([, entry]) => Math.abs(entry.netTenths)));
  return (
    <ul role="list" className="flex flex-col" data-testid={testId}>
      {rows.map(([memberId, entry]) => (
        <li key={memberId} className="grid grid-cols-[minmax(0,10rem)_1fr_4.5rem] items-center gap-3 py-1.5 sm:grid-cols-[minmax(0,13rem)_1fr_5rem]">
          <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
            {crest(memberId, 22)}
            <span className="flex min-w-0 flex-col">
              {hrefOf ? (
                <Link href={hrefOf(memberId)} className="truncate hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live">
                  {name(memberId)}
                </Link>
              ) : (
                <span className="truncate">{name(memberId)}</span>
              )}
              {showDeals ? (
                <span className="text-xs font-normal text-ink-faint">
                  {entry.deals} deal{entry.deals === 1 ? "" : "s"}
                </span>
              ) : null}
            </span>
          </span>
          <span className="grid grid-cols-2 items-center" aria-hidden="true">
            <span className="flex justify-end">
              {entry.netTenths < 0 ? (
                <span className="block h-2 rounded-l-full bg-loss" style={{ width: `${(Math.abs(entry.netTenths) / widest) * 100}%` }} />
              ) : null}
            </span>
            <span className="border-l border-rule">
              {entry.netTenths > 0 ? (
                <span className="block h-2 rounded-r-full bg-gain" style={{ width: `${(entry.netTenths / widest) * 100}%` }} />
              ) : null}
            </span>
          </span>
          <span className={`stat text-right text-sm font-bold ${entry.netTenths > 0 ? "text-gain" : entry.netTenths < 0 ? "text-loss" : "text-ink-soft"}`}>
            {formatSignedTenths(entry.netTenths)}
            <span className="sr-only"> over {entry.deals} {entry.deals === 1 ? "deal" : "deals"}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
