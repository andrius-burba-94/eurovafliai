import { PositionPatch } from "@/components/board";
import type { Position } from "@/lib/engine";

/**
 * The starting five on a half court — slice 11.3, ADR-0008.
 *
 * A picture of the five, not a second editor: every player's controls stay on
 * their card in the tiers below, where the form reads them. What the court adds
 * is the formation you can see — guards at the top of the key, the center at
 * the post — and a tap target per place, so a player armed with Move can be
 * put into the five by tapping where they go.
 *
 * Rows by position letter rather than fixed spots, because the five legal
 * formations put between one and three players on each line and a fixed spot
 * per role would leave most of them standing on nothing.
 *
 * The court is line art in the heavy rule on the ground: no fill, no gradient,
 * no wood. Tokens are opaque so a line never crosses a name.
 */

export type CourtPlayer = {
  readonly id: string;
  readonly name: string;
  readonly position: Position;
  readonly isCaptain: boolean;
};

const ROWS: readonly Position[] = ["G", "F", "C"];

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live";

export function LineupCourt({
  starters,
  openPlaces,
  armed,
  armedIsStarter,
  onArm,
  onPlace,
}: {
  starters: readonly CourtPlayer[];
  openPlaces: number;
  /** The player in hand, if any. */
  armed: string | null;
  armedIsStarter: boolean;
  onArm: (playerId: string) => void;
  onPlace: () => void;
}) {
  const rows = ROWS.map((position) =>
    starters.filter((player) => player.position === position),
  ).filter((row) => row.length > 0);
  const canPlace = armed !== null && !armedIsStarter;

  return (
    <div
      data-testid="lineup-court"
      className="relative overflow-hidden border border-rule-strong"
    >
      <CourtLines />
      <div className="relative flex min-h-72 flex-col justify-between gap-4 px-3 py-6">
        {rows.map((row) => (
          <ul
            key={row[0]!.position}
            role="list"
            className="flex flex-wrap justify-center gap-3"
          >
            {row.map((player) => (
              <li key={player.id}>
                <button
                  type="button"
                  data-testid="court-player"
                  aria-pressed={armed === player.id}
                  onClick={() => onArm(player.id)}
                  className={`flex min-h-11 max-w-36 items-center gap-2 bg-stock px-2 py-1 text-left transition-colors hover:bg-stock-panel ${focusRing} ${
                    armed === player.id
                      ? "border-2 border-ink"
                      : "border border-rule-strong"
                  }`}
                >
                  <PositionPatch position={player.position} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-semibold uppercase tracking-[0.04em]">
                      {surname(player.name)}
                    </span>
                    {player.isCaptain ? (
                      <span className="slot-label text-live">Captain</span>
                    ) : null}
                  </span>
                  <span className="sr-only">
                    {armed === player.id ? ", in hand" : ", tap to move"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ))}
        {openPlaces > 0 ? (
          <ul role="list" className="flex flex-wrap justify-center gap-3">
            {Array.from({ length: openPlaces }, (_, index) => (
              <li key={index}>
                <button
                  type="button"
                  data-testid="court-open"
                  disabled={!canPlace}
                  onClick={onPlace}
                  className={`slot-label flex min-h-11 min-w-24 items-center justify-center border border-dashed bg-stock px-3 transition-colors disabled:cursor-default ${focusRing} ${
                    canPlace
                      ? "border-ink text-ink hover:bg-stock-panel"
                      : "border-rule text-ink-soft"
                  }`}
                >
                  {canPlace ? "Start here" : "Open place"}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

/** "Valančiūnas, Jonas" → "Valančiūnas": the court has room for one word. */
function surname(name: string): string {
  return name.split(",")[0]!.trim();
}

/**
 * A FIBA half court at 10 units to the metre: 15m wide, 14m deep, the basket
 * 1.575m off the baseline. Drawn with the baseline at the bottom so the
 * guards' row, printed first, stands furthest from the rim.
 */
function CourtLines() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 150 140"
      preserveAspectRatio="xMidYMax slice"
      className="absolute inset-0 h-full w-full fill-none stroke-rule-strong [&>*]:[vector-effect:non-scaling-stroke]"
      strokeWidth={1}
    >
      <rect x={0.5} y={0.5} width={149} height={139} />
      <path d="M 57 0.5 A 18 18 0 0 0 93 0.5" />
      <rect x={50.5} y={82} width={49} height={57.5} />
      <circle cx={75} cy={82} r={18} />
      <path d="M 9 139.5 L 9 110.1 A 67.5 67.5 0 0 1 141 110.1 L 141 139.5" />
      <path d="M 62.5 124.25 A 12.5 12.5 0 0 1 87.5 124.25" />
      <line x1={66} y1={128.8} x2={84} y2={128.8} />
      <circle cx={75} cy={124.25} r={2.25} />
    </svg>
  );
}
