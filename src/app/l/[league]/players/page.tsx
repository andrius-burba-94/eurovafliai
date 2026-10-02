import { notFound } from "next/navigation";

import { PoolPage } from "@/app/players/pool-page";
import { getLeagueWithMembers } from "@/lib/leagues/queries";
import { navLeagueFrom } from "@/lib/nav/items";

/** The pool without leaving the league: same list, the league's sidebar. */
export default async function LeaguePoolPage({ params }: PageProps<"/l/[league]/players">) {
  const data = await getLeagueWithMembers((await params).league);
  if (!data) notFound();
  return <PoolPage league={navLeagueFrom(data)} />;
}
