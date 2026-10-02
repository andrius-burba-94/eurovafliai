import type { Position } from "@/lib/engine";
import type { RoundPoints } from "@/lib/live/status";
import { PlayerPortrait } from "@/components/official-media";
import { displayName, surname } from "@/lib/players/name";

import type { DragState } from "./lineup-drag";

export type CourtPlayer = {
  readonly id: string;
  readonly name: string;
  readonly personCode?: string;
  readonly position: Position;
  readonly isCaptain: boolean;
  /** Absent until a game of the round has tipped off. */
  readonly points?: RoundPoints;
};

const ROWS: readonly Position[] = ["C", "F", "G"];
const WORDS: Record<Position, string> = { C: "Centers", F: "Forwards", G: "Guards" };

export function LineupCourt({
  starters,
  openPlaces,
  onOpen,
  drag,
}: {
  starters: readonly CourtPlayer[];
  openPlaces: Readonly<Record<Position, number>>;
  /** A click that was not the end of a drag: the player's profile. */
  onOpen: (playerId: string, from: HTMLElement) => void;
  drag: DragState;
}) {
  const incoming = drag.dragging !== null && !starters.some((player) => player.id === drag.dragging);
  return (
    <div
      className="lineup-court hardwood"
      data-testid="lineup-court"
      data-scored={starters.some((player) => player.points) || undefined}
      data-drop="role:starter"
      data-over={drag.over === "role:starter" || undefined}
      role="group"
      aria-label="Starting five on a basketball half court. Centers nearest the basket, guards at the back."
    >
      {/* FIBA half court at 40 units a metre: 15 m wide, 14 m to the halfway line. */}
      <svg className="lineup-court-lines" viewBox="0 0 600 560" preserveAspectRatio="none" aria-hidden="true">
        <path d="M4 4 H596 V556 H4 Z M202 4 V232 H398 V4 M228 232 A72 72 0 0 0 372 232 M264 48 H336 M300 48 V54 M291 63 A9 9 0 0 0 309 63 A9 9 0 0 0 291 63 M250 48 V63 A50 50 0 0 0 350 63 V48 M36 4 V120 A270 270 0 0 0 564 120 V4 M228 556 A72 72 0 0 1 372 556" />
      </svg>
      <span className="lineup-court-name">The five</span>
      {ROWS.map((position) => (
        <div className={`lineup-court-row lineup-court-row-${position.toLowerCase()}`} key={position}>
          <span className="lineup-court-role" aria-hidden="true">{WORDS[position]}</span>
          <ul role="list" className="lineup-court-players">
            {starters.filter((player) => player.position === position).map((player) => (
              <li key={player.id}>
                <button
                  type="button"
                  data-testid="court-player"
                  data-position={position}
                  data-captain={player.isCaptain || undefined}
                  data-drop={`player:${player.id}`}
                  data-over={drag.over === `player:${player.id}` || undefined}
                  data-dragging={drag.dragging === player.id || undefined}
                  aria-haspopup="dialog"
                  aria-label={`${displayName(player.name)}, ${WORDS[position].slice(0, -1)}, ${player.isCaptain ? "captain, " : ""}starter${player.points ? `, ${player.points.spoken}` : ""}`}
                  onClick={(event) => onOpen(player.id, event.currentTarget)}
                  {...drag.handle(player.id)}
                  className="lineup-court-player lineup-drag"
                >
                  <span className="lineup-court-disc">
                    <PlayerPortrait personCode={player.personCode} name={player.name} />
                    <span className="lineup-court-position" aria-hidden="true">{position}</span>
                    {player.isCaptain ? <span className="lineup-court-captain" aria-hidden="true">C&times;2</span> : null}
                  </span>
                  {player.points ? (
                    <span className="lineup-court-plate" data-testid="court-points" data-live={player.points.live || undefined}>
                      <strong title={displayName(player.name)}>{surname(player.name)}</strong>
                      <span className="lineup-court-score" data-kind={player.points.kind}>
                        {player.points.kind === "figure" ? (
                          <>
                            <b>{player.points.text}</b>
                            <small>{player.points.live ? "Live" : "Pts"}</small>
                          </>
                        ) : (
                          player.points.text
                        )}
                      </span>
                    </span>
                  ) : (
                    <strong title={displayName(player.name)}>{surname(player.name)}</strong>
                  )}
                </button>
              </li>
            ))}
            {Array.from({ length: openPlaces[position] }, (_, index) => (
              <li key={`open-${index}`}>
                <span data-testid="court-open" data-incoming={incoming || undefined} className="lineup-court-open">
                  {incoming ? "Drop here" : "Open place"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}