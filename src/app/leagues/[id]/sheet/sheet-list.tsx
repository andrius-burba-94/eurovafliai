import { Bank, CardName, PositionPatch, Slot, Slots } from "@/components/board";
import type { Position } from "@/lib/engine";
import { positionSentence } from "@/lib/positions";
import type { CheatSheetView, SheetPlayerRow } from "@/lib/sheets/queries";

/**
 * The sheet as it stands, broken into its tiers.
 *
 * One `Slots` run per tier rather than one run with dividers in it, because
 * that is what a tier *is*: CONTEXT.md calls it "a break in a cheat sheet", and
 * a break between two runs is the board's own way of saying a run has ended.
 * No new material, no coloured band, no chip — the gap and the caption carry
 * it, which is the same argument the radar's groups make.
 *
 * A server component: nothing here is interactive until 3.4b drags it.
 */
const POSITIONS: Position[] = ["G", "F", "C"];

export function SheetList({
  rows,
  poolSize,
  cover,
}: {
  rows: readonly SheetPlayerRow[];
  poolSize: number;
  cover: CheatSheetView["cover"];
}) {
  if (rows.length === 0) {
    return (
      <Bank label="Your ranking" aside="empty">
        <div className="slot-waiting px-3 py-5">
          <p className="text-sm text-ink-soft">
            You have not ranked anybody yet. Until you do, autodraft has nothing
            of yours to go on and will pick the first legal player it finds —
            which is arbitrary, and identical every time.
          </p>
        </div>
      </Bank>
    );
  }

  const tiers = [...new Set(rows.map((row) => row.tier))].sort((a, b) => a - b);
  const missing = rows.filter((row) => row.missing).length;
  // A sheet that cannot fill a roster is the failure this surface could not
  // previously report: it counted "14 of 323 ranked" and said nothing about
  // *which* fourteen. Autodraft walks the sheet, runs out of legal players at
  // a position, and falls through to the lowest player id for the rest of the
  // draft — silently, and only on the night.
  const short = POSITIONS.filter(
    (position) => cover[position].ranked < cover[position].needed,
  );

  return (
    <Bank label="Your ranking" aside={`${rows.length} of ${poolSize} ranked`}>
      {missing > 0 ? (
        <p className="text-sm text-ink-soft">
          {missing} {missing === 1 ? "player is" : "players are"} no longer in
          the pool. They are kept in place so the ranking around them does not
          shift; autodraft skips them.
        </p>
      ) : null}

      {/* What the sheet is made of, in the app's own position patches — the
          same three marks the radar and the room's "you still need" use, so
          the comparison is a glance rather than arithmetic. */}
      <p className="flex flex-wrap items-center gap-2">
        <span className="slot-label">Ranked</span>
        {POSITIONS.map((position) => (
          <PositionPatch
            key={position}
            position={position}
            count={cover[position].ranked}
          />
        ))}
      </p>
      {short.length > 0 ? (
        <p
          className="max-w-prose text-sm text-ink-soft"
          data-testid="sheet-short"
        >
          You have ranked{" "}
          {positionSentence(
            Object.fromEntries(
              short.map((position) => [position, cover[position].ranked]),
            ),
            "none of them",
          )}
          , and a full roster needs{" "}
          {positionSentence(
            Object.fromEntries(
              short.map((position) => [position, cover[position].needed]),
            ),
          )}
          . Autodraft can only pick from what you have ranked; below that it
          falls back to an arbitrary legal player.
        </p>
      ) : null}

      {tiers.map((tier) => (
        <div key={tier} className="flex flex-col gap-1.5">
          {/* Only worth naming when there is more than one. A sheet with no
              breaks should not grow a heading that says "Tier 1" over the
              whole of it. */}
          {tiers.length > 1 ? (
            <p className="slot-label text-ink-faint">Tier {tier}</p>
          ) : null}
          <Slots testId={`sheet-tier-${tier}`} label={`Tier ${tier}`}>
            {rows
              .filter((row) => row.tier === tier)
              .map((row) => (
                <Slot
                  key={row.id}
                  testId="sheet-row"
                  state={row.missing ? "waiting" : "filled"}
                  nowrap
                  className={row.missing ? "text-ink-faint" : ""}
                >
                  <span className="flex min-w-0 flex-1 items-baseline gap-x-3 overflow-hidden">
                    {/* `#N`, right-aligned in a fixed column — one rank format
                        in the app, not three. It was `01` here, a leading `#1`
                        in the room's pinned block and a trailing `#1` on a pool
                        row, which is three ways of writing the same fact on two
                        surfaces. Right-aligned and fixed-width so the numbers
                        make a column that can be read down. */}
                    <span className="slot-label w-8 shrink-0 text-right tabular-nums text-ink-soft">
                      #{row.rank}
                    </span>
                    <span className="min-w-0 truncate" title={row.name}>
                      <CardName scale="slot">{row.name}</CardName>
                    </span>
                    {row.club ? (
                      <span className="slot-label">{row.club}</span>
                    ) : null}
                    {row.missing ? null : (
                      <PositionPatch position={row.position} />
                    )}
                  </span>
                </Slot>
              ))}
          </Slots>
        </div>
      ))}
    </Bank>
  );
}
