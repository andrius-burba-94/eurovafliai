import type { PlayerFixture } from "@/lib/fixtures/types";
import type { PoolPlayer } from "@/lib/pool/search";

/**
 * What the side panel is handed — a type-only module, because the server
 * query and the client panel both need the shape and neither may import the
 * other.
 */
export type PanelGame = {
  readonly code: number;
  readonly home: string;
  readonly away: string;
  readonly homeName: string;
  readonly awayName: string;
  readonly played: boolean;
  readonly homeScore: number;
  readonly awayScore: number;
  /** ISO instant, or null while the feed has not timed the game. */
  readonly tipOff: string | null;
};

export type PanelNewsItem = {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly headline: string;
  readonly url: string;
  readonly published: string;
  readonly playerId: string | null;
};

export type PanelData = {
  /** `takenBy` is the team holding them now, or null for a free agent. */
  readonly players: readonly PoolPlayer[];
  /** Each club's next game, by club code. */
  readonly fixtures: Readonly<Record<string, PlayerFixture>>;
  readonly schedule: { round: number; games: readonly PanelGame[] } | null;
  readonly news: readonly PanelNewsItem[];
};
