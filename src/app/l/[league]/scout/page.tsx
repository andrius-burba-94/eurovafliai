import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { Correction } from "@/components/board";
import { PageHeader } from "@/components/broadcast";
import { readWaiverWire, type WaiverWirePage } from "@/lib/advisor/queries";
import { getSession } from "@/lib/auth/session";
import { serverConfig } from "@/lib/config/server";
import { getLeagueWithMembers } from "@/lib/leagues/queries";
import { navLeagueFrom } from "@/lib/nav/items";
import { leagueSource } from "@/lib/positions";

import { WaiverWire } from "./waiver-wire";

/**
 * Scout (7.2, design A "the desk", #193): the league's waiver wire, ranked by
 * stored outlooks. Read with the member's token; the page never computes an
 * outlook and never calls a model. A member's moves worth making join it in 7.2 F.
 */
export default async function ScoutPage({ params }: PageProps<"/l/[league]/scout">) {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");
  const { league: leagueRef } = await params;
  const data = await getLeagueWithMembers(leagueRef);
  if (!data) notFound();
  const you = data.members.find((member) => member.isYou);
  if (!you || (data.league.status !== "season" && data.league.status !== "complete")) notFound();

  const source = leagueSource(data.league);
  let wire: WaiverWirePage | null = null;
  let failed = false;
  try {
    wire = await readWaiverWire(data.league.id, { source, season: serverConfig().EUROLEAGUE_SEASON });
  } catch {
    failed = true;
  }
  const unit = source === "basketnews" ? "Modern points" : "fantasy points";

  return (
    <AppShell current="scout" league={navLeagueFrom(data)} measure="column" testId="scout">
      <div className="flex flex-col gap-8">
        <PageHeader
          title="Scout"
          lead={`Free agents ranked by the ${unit} they should score a game over their club's next five.`}
        />
        {failed || !wire ? (
          <Correction testId="scout-error">The waiver wire could not be read just now. Reload the page in a minute.</Correction>
        ) : (
          <WaiverWire rows={wire.rows} rated={wire.rated} unit={unit} />
        )}
      </div>
    </AppShell>
  );
}
