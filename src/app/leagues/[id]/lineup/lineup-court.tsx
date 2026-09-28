import type { Position } from "@/lib/engine";

export type CourtPlayer = {
  readonly id: string;
  readonly name: string;
  readonly position: Position;
  readonly isCaptain: boolean;
};

const ROWS: readonly Position[] = ["C", "F", "G"];
const WORDS: Record<Position, string> = { C: "Centers", F: "Forwards", G: "Guards" };

export function LineupCourt({
  starters,
  openPlaces,
  armed,
  armedIsStarter,
  onArm,
  onPlace,
}: {
  starters: readonly CourtPlayer[];
  openPlaces: Readonly<Record<Position, number>>;
  armed: string | null;
  armedIsStarter: boolean;
  onArm: (playerId: string) => void;
  onPlace: () => void;
}) {
  const armedPlayer = starters.find((player) => player.id === armed);
  const canPlace = armed !== null && !armedIsStarter;
  return (
    <div className="lineup-court" data-testid="lineup-court" role="group" aria-label="Starting five on a basketball half court. Centers nearest the basket, guards at the back.">
      <svg className="lineup-court-lines" viewBox="0 0 600 420" preserveAspectRatio="none" aria-hidden="true">
        <path d="M8 8 H592 V412 H8 Z M238 8 V142 H362 V8 M238 142 A62 62 0 0 0 362 142 M258 22 H342 M300 22 V42 M285 44 A15 15 0 0 0 315 44 M68 8 C68 250 145 338 300 347 C455 338 532 250 532 8 M8 412 H592" />
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
                  data-captain={player.isCaptain || undefined}
                  data-valid={(armed !== null && armed !== player.id && (!armedPlayer || armedPlayer.position === player.position)) || undefined}
                  aria-pressed={armed === player.id}
                  aria-label={`${player.name}, ${WORDS[position].slice(0, -1)}, ${player.isCaptain ? "captain, " : ""}starter${armed && armed !== player.id ? ", tap to swap" : ", tap to move"}`}
                  onClick={() => onArm(player.id)}
                  className="lineup-court-player"
                >
                  <span className="lineup-court-disc">
                    <span>{initial(player.name)}</span>
                    <span className="lineup-court-position" aria-hidden="true">{position}</span>
                    {player.isCaptain ? <span className="lineup-court-captain" aria-hidden="true">C</span> : null}
                  </span>
                  <strong title={player.name}>{surname(player.name)}</strong>
                </button>
              </li>
            ))}
            {Array.from({ length: openPlaces[position] }, (_, index) => (
              <li key={`open-${index}`}>
                <button type="button" data-testid="court-open" disabled={!canPlace} onClick={onPlace} className="lineup-court-open">
                  {canPlace ? "Start here" : "Open place"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function surname(name: string): string {
  return name.split(",")[0]!.trim();
}

function initial(name: string): string {
  return surname(name).charAt(0).toUpperCase();
}
