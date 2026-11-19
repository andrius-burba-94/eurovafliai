import { LiveTickerStrip } from "@/components/live-ticker-strip";
import { serverConfig } from "@/lib/config/server";
import { readTicker } from "@/lib/live/game";

/**
 * The shell's strip of tonight's games. Drawn only on a game day, from an hour
 * before the first tip-off; a read that fails hides the strip, never the page.
 */
export async function LiveTicker({ token }: { token: string }) {
  const season = serverConfig().EUROLEAGUE_SEASON;
  const data = await readTicker(token, season).catch(() => null);
  if (!data) return null;
  return (
    <LiveTickerStrip
      authToken={token}
      season={data.season}
      renderedAt={data.renderedAt}
      fixtures={data.fixtures}
      snapshots={data.snapshots}
    />
  );
}
