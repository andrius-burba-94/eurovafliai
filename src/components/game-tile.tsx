import { GAME_BADGE, StatusBadge } from "@/components/broadcast";
import { ClubCrest } from "@/components/official-media";
import type { GameState } from "@/lib/live/status";
import { formatTipOff } from "@/lib/time/local";

type Side = {
  readonly code: string;
  /** The club's full name; the code stands in when there is none. */
  readonly name?: string;
  readonly score: number | null;
};

/**
 * The score a game shows: the live feed while it has one, then the stored
 * result once the game is played, and nothing before.
 */
export function gameScores(input: {
  readonly snapshot: { readonly localScore: number; readonly roadScore: number } | undefined;
  readonly played: boolean;
  readonly localScore: number;
  readonly roadScore: number;
}): { home: number | null; away: number | null } {
  if (input.snapshot) return { home: input.snapshot.localScore, away: input.snapshot.roadScore };
  if (input.played) return { home: input.localScore, away: input.roadScore };
  return { home: null, away: null };
}

/** One game as Live's Games panel draws it: its state, its tip-off, two clubs and the score. */
export function GameTile({
  state,
  tipOff,
  home,
  away,
  testId,
}: {
  state: GameState;
  tipOff: string | null;
  home: Side;
  away: Side;
  testId?: string;
}) {
  return (
    <li data-testid={testId} data-state={state} className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-panel-border bg-stock p-2.5">
      <span className="flex items-center justify-between gap-2">
        <StatusBadge kind={GAME_BADGE[state].kind}>{GAME_BADGE[state].word}</StatusBadge>
        {state === "scheduled" ? (
          <span className="text-xs text-ink-soft">{formatTipOff(tipOff) ?? "Time to be confirmed"}</span>
        ) : null}
      </span>
      {[home, away].map((side, index) => (
        <span key={index} className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5 text-sm font-bold">
            <ClubCrest clubCode={side.code} />
            <span className="truncate" title={side.name ?? side.code}>{side.name ?? side.code}</span>
          </span>
          <span className="stat shrink-0 text-sm font-bold">{side.score ?? ""}</span>
        </span>
      ))}
    </li>
  );
}
