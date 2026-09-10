import {
  Bank,
  CardName,
  Door,
  EmptyNotice,
  Slot,
  Slots,
} from "@/components/board";
import type { DealView } from "@/lib/memberships/queries";
import { formatSignedTenths } from "@/lib/stats/scoring";

function signedPir(value: number): string {
  if (value < 0) return String(value);
  return `+${value}`;
}

export function ImpactList({
  deals,
  teamName,
  leagueId,
  canManage,
  season,
}: {
  deals: readonly DealView[];
  teamName: string;
  leagueId: string;
  canManage: boolean;
  season: boolean;
}) {
  if (deals.length === 0) {
    return (
      <Bank framed label="Transactions" aside="0">
        <EmptyNotice testId="impact-empty">
          No trades recorded for this roster yet. Friends agree out loud; the
          commissioner writes the swap so scoring follows the new squad.
        </EmptyNotice>
        {canManage && season ? (
          <Slots>
            <Door
              href={`/leagues/${leagueId}/transactions/new`}
              title="Record a transaction"
              description="Write the trade, add or drop the room already agreed."
              action="Record"
              testId="impact-empty-record"
            />
          </Slots>
        ) : null}
      </Bank>
    );
  }

  return (
    <Bank framed label="Transactions" aside={`${deals.length}`}>
      <Slots testId="impact-list" label={`${teamName} transactions`}>
        {deals.map((deal) => (
          <Slot key={deal.id} testId="impact-deal" state="filled">
            <div className="flex min-h-11 min-w-0 flex-1 flex-col gap-2 py-1">
              <span className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <CardName>{deal.impactSentence}</CardName>
                <span
                  className="text-sm tabular-nums"
                  data-testid="impact-delta"
                >
                  {formatSignedTenths(deal.deltaTenths)}
                </span>
              </span>
              <p className="min-w-0 text-sm break-words text-ink-soft">
                {deal.sentence}
              </p>
              <p className="slot-label">PIR {signedPir(deal.deltaPir)}</p>
              {deal.byRound.length > 0 ? (
                <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm tabular-nums text-ink-soft">
                  {deal.byRound.map((row) => (
                    <span key={row.round}>
                      R{row.round} {formatSignedTenths(row.deltaTenths)}
                    </span>
                  ))}
                </p>
              ) : null}
            </div>
          </Slot>
        ))}
      </Slots>
    </Bank>
  );
}
