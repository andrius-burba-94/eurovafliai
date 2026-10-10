"use client";

import { Bank, CardBlock, CardBlocks, EmptyNotice } from "@/components/board";
import type { Confidence } from "@/lib/advisor/outlook";
import type { ScoutMove } from "@/lib/advisor/scout";
import { formatOutlook as points } from "@/lib/advisor/wire";

import { CONFIDENCE_WORD, PlayerCell, RunWord, Triplet, TripletHead } from "./waiver-wire";

function ConfidenceBars({ value }: { value: Confidence }) {
  const lit = value === "high" ? 3 : value === "medium" ? 2 : 1;
  return (
    <svg aria-hidden="true" width="14" height="12" viewBox="0 0 14 12" className="text-ink">
      {[0, 1, 2].map((index) => (
        <rect key={index} x={index * 5} y={8 - index * 4} width="3.5" height={4 + index * 4} rx="1" fill="currentColor" opacity={index < lit ? 1 : 0.25} />
      ))}
    </svg>
  );
}

function MoveCard({ move, unit }: { move: ScoutMove; unit: string }) {
  const tone = move.confidence === "high" ? "text-ink" : move.confidence === "medium" ? "text-ink-soft" : "text-gold";
  const run = move.add.outlook?.runs[0] ?? null;
  return (
    <CardBlock testId="scout-move">
      {/* On a phone the gain leads and the names get the card's width. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <span className="flex items-baseline gap-2 leading-none sm:order-last sm:shrink-0 sm:flex-col sm:items-end sm:gap-0">
          <span className="display-figure text-5xl text-gain" data-testid="scout-move-gain">+{points(move.gain)}</span>
          <span className="slot-label sm:mt-1 sm:text-right">{unit} a game · next 5</span>
        </span>
        <div className="flex min-w-0 flex-col gap-3">
          <PlayerCell row={move.drop} verb="Drop" />
          <PlayerCell row={move.add} verb="Add" />
        </div>
      </div>

      <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1.5 border-t border-panel-border pt-3">
        <span />
        <TripletHead />
        <span className="slot-label text-gain">Add</span>
        <Triplet next={move.add.outlook!.next} />
        <span className="slot-label text-loss">Drop</span>
        <Triplet next={move.drop.outlook!.next} emphasise={false} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span className="inline-flex items-center gap-1.5 text-sm" data-testid="scout-move-confidence">
          <ConfidenceBars value={move.confidence} />
          <span className={`font-semibold ${tone}`}>{CONFIDENCE_WORD[move.confidence]}</span>
          <span className="text-ink-soft">confidence</span>
        </span>
        {run ? (
          <span className="text-sm text-ink-soft">
            {move.add.clubCode} next 5: <RunWord run={run} />
          </span>
        ) : null}
      </div>
    </CardBlock>
  );
}

export function YourMoves({
  moves,
  countsTemplate,
  rosterSize,
  rosterFull,
  templateWords,
  gameName,
  unit,
  threshold,
}: {
  moves: readonly ScoutMove[];
  countsTemplate: boolean;
  rosterSize: number;
  rosterFull: number;
  templateWords: string;
  gameName: string;
  unit: string;
  threshold: string;
}) {
  return (
    <Bank
      label="Your moves"
      testId="your-moves"
      aside="Only you see these"
      info={`At most three swaps that gain ${threshold} ${unit} a game or more over the next five, each keeping ${templateWords}. Make them in ${gameName}.`}
    >
      {!countsTemplate && rosterSize < rosterFull ? (
        <EmptyNotice testId="your-moves-short">
          Your roster has {rosterSize} of {rosterFull} players. Moves are suggested once it is full again.
        </EmptyNotice>
      ) : !countsTemplate ? (
        <EmptyNotice testId="your-moves-template">
          Your roster does not count {templateWords} in {gameName}&apos;s positions, so nothing is suggested until the
          commissioner answers its position question on Player mapping.
        </EmptyNotice>
      ) : moves.length === 0 ? (
        <div className="flex flex-col gap-1 py-2" data-testid="your-moves-empty">
          <p className="text-base font-semibold">No move worth making this round.</p>
          <p className="text-sm text-ink-soft">
            Nothing on the wire beats your roster by {threshold} {unit} a game over the next five.
          </p>
        </div>
      ) : (
        <CardBlocks label="Your moves">
          {moves.map((move) => (
            <MoveCard key={`${move.drop.id}-${move.add.id}`} move={move} unit={unit} />
          ))}
        </CardBlocks>
      )}
    </Bank>
  );
}
