import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { Correction } from "@/components/board";
import { PageHeader } from "@/components/broadcast";
import { MOVE_THRESHOLD } from "@/lib/advisor/moves";
import { readScout, type ScoutPage as ScoutData } from "@/lib/advisor/queries";
import { formatOutlook } from "@/lib/advisor/wire";
import { getSession } from "@/lib/auth/session";
import { serverConfig } from "@/lib/config/server";
import { getLeagueWithMembers } from "@/lib/leagues/queries";
import { navLeagueFrom } from "@/lib/nav/items";
import { GAME_NAMES, leagueSource, positionSentence } from "@/lib/positions";

import { ScoutDesk } from "./scout-desk";
import { WaiverWire } from "./waiver-wire";
import { YourMoves } from "./your-moves";

/**
 * Scout (7.2, design A "the desk", #193): the viewer's own moves worth making
 * beside the league's waiver wire. Read with the member's token; the page
 * reads stored outlooks, works the moves out at read time, and never calls a
 * model.
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
  const template = data.settings.roster_template;
  let scout: ScoutData | null = null;
  try {
    scout = await readScout(data.league.id, {
      source,
      season: serverConfig().EUROLEAGUE_SEASON,
      memberId: you.id,
      template,
    });
  } catch {
    scout = null;
  }
  const unit = source === "basketnews" ? "Modern points" : "fantasy points";
  const gameName = source === "euroleague" ? "your league" : GAME_NAMES[source];

  return (
    <AppShell current="scout" league={navLeagueFrom(data)} measure="wide" testId="scout">
      <div className="flex flex-col gap-8">
        <PageHeader
          title="Scout"
          lead={`Free agents ranked by the ${unit} they should score a game over their club's next five, and the swaps worth making for your roster.`}
        />
        {!scout ? (
          <Correction testId="scout-error">The scout could not be read just now. Reload the page in a minute.</Correction>
        ) : (
          <ScoutDesk
            movesCount={scout.advice.moves.length}
            wireCount={scout.wire.length}
            moves={
              <YourMoves
                moves={scout.advice.moves}
                countsTemplate={scout.advice.countsTemplate}
                rosterSize={scout.advice.rosterSize}
                rosterFull={template.G + template.F + template.C}
                templateWords={positionSentence(template, "nothing", { keepZeros: true })}
                gameName={gameName}
                unit={unit}
                threshold={`+${formatOutlook(MOVE_THRESHOLD[scout.ruleset])}`}
              />
            }
            wire={<WaiverWire rows={scout.wire} rated={scout.rated} unit={unit} />}
          />
        )}
      </div>
    </AppShell>
  );
}
