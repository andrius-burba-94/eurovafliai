import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/auth/session";
import { getLeagueWithMembers } from "@/lib/leagues/queries";
import { navLeagueFrom } from "@/lib/nav/items";
import { serverRollCeremony } from "@/lib/roll/snapshot";

import { RollCeremony } from "./roll-ceremony";

/**
 * The roll — the one ceremonial surface in this app.
 *
 * Everywhere else, this product is an instrument: dense, calm, and out of the
 * way. This page is the exception, and it is the exception on purpose. The draw
 * is the only moment in a season where the whole league stops and looks at the
 * same thing at the same second, and it had been a form submission — the
 * commissioner pressed a button and numbers appeared in a list.
 *
 * ## Why the page is computed rather than driven
 *
 * The phase comes from one stored instant (`settings.rolled_at`) and the
 * server's clock, through the pure `rollCeremony`. That is what makes it one
 * shared moment instead of a dozen private ones: a phone that opened late
 * joins in progress, a reload does not restart it, and somebody arriving
 * afterwards reads the order rather than being shown a countdown for an event
 * that finished. See `src/lib/roll/ceremony.ts`.
 *
 * The first phase is computed on the server, so the page opens at the right
 * second rather than starting everyone at ten; the browser then corrects its
 * own clock against `/api/time` and ticks from there, exactly as the draft
 * room's countdown does. A device an hour out must not run an hour-wrong
 * ceremony — invariant §4, never trust a client clock.
 *
 * Reachable directly, and that matters: the lobby brings people here while the
 * draw is live, but the URL is also how somebody re-reads the result.
 */
export default async function RollPage({ params }: PageProps<"/leagues/[id]">) {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");

  const { id } = await params;
  const data = await getLeagueWithMembers(id);
  // Not found and not-yours are the same answer, as everywhere else: telling
  // them apart would let anyone probe which leagues exist.
  if (!data) notFound();

  const { league, settings, members } = data;

  // Nothing has been drawn, so there is nothing to watch. The lobby is where
  // the order gets decided, and a hand-set order clears this instant precisely
  // so it cannot claim to have been drawn.
  const rolledAt = settings.rolled_at ? Date.parse(settings.rolled_at) : NaN;
  if (!settings.rolled_at || Number.isNaN(rolledAt)) {
    redirect(`/leagues/${league.id}`);
  }

  const inOrder = members
    .filter((member) => member.draftPosition)
    .sort((a, b) => (a.draftPosition ?? 0) - (b.draftPosition ?? 0))
    .map((member) => ({
      id: member.id,
      position: member.draftPosition!,
      name: member.teamName || member.name,
      isYou: member.isYou,
    }));

  if (inOrder.length === 0) redirect(`/leagues/${league.id}`);

  // Computed on the server so the first paint is already at the right second.
  // A visitor who opens this thirty seconds late joins the draw in progress.
  const initial = await serverRollCeremony({
    rolledAt,
    slots: inOrder.length,
  });

  return (
    <AppShell current="order" league={navLeagueFrom(data)} testId="roll">
      <RollCeremony
        leagueId={league.id}
        leagueName={league.name}
        order={inOrder}
        rolledAt={rolledAt}
        initial={initial}
      />
    </AppShell>
  );
}
