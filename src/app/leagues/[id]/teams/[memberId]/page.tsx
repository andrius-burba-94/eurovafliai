import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  BackLink,
  Bank,
  CardName,
  PositionPatch,
  Sheet,
  Slot,
  Slots,
  TopRail,
} from "@/components/board";
import { RosterRadar } from "@/components/roster-radar";
import { getSession } from "@/lib/auth/session";
import { buildRadar, radarSize } from "@/lib/engine";
import { getLeagueWithMembers } from "@/lib/leagues/queries";
import { readMemberRoster } from "@/lib/memberships/queries";

/**
 * One member's current roster — slice 5.1.
 *
 * The squad of record is active `roster_memberships`, not the draft board.
 * Radar is the same component the room uses, with nobody on the clock.
 */
export default async function TeamPage({
  params,
}: PageProps<"/leagues/[id]/teams/[memberId]">) {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");

  const { id, memberId } = await params;
  const data = await getLeagueWithMembers(id);
  if (!data) notFound();

  const viewerIsMember = data.members.some((member) => member.isYou);
  if (!viewerIsMember) notFound();

  const member = data.members.find((row) => row.id === memberId);
  if (!member) notFound();

  const roster = await readMemberRoster(id, memberId);
  const template = data.settings.roster_template;
  const radarPicks = roster.map((player, index) => ({
    overallNo: player.overallNo ?? index + 1,
    playerId: player.id,
    position: player.position,
  }));
  const radar = buildRadar(
    [{ memberId: member.id, picks: radarPicks }],
    template,
  );
  const displayName = member.teamName.trim() ? member.teamName : member.name;

  return (
    <>
      <TopRail
        action={<BackLink href={`/leagues/${id}`}>The lobby</BackLink>}
      />
      <Sheet testId="roster">
        <div className="flex flex-col gap-4">
          <h1 className="text-3xl font-semibold uppercase tracking-[0.04em] sm:text-4xl">
            {displayName}
          </h1>
          <p className="slot-label">
            {data.league.name}
            {member.isYou ? " · you" : ""}
          </p>
        </div>

        <RosterRadar
          rows={radar}
          columns={[{ memberId: member.id, name: displayName, isYou: member.isYou }]}
          total={radarSize(template)}
          onClockMemberId={null}
        />

        {roster.length === 0 ? (
          <p className="text-ink-soft" data-testid="roster-empty">
            No players on this roster yet. A finished draft writes them; they
            go with the board if you start over.
          </p>
        ) : (
          <Bank label="The roster" aside={`${roster.length}`}>
            <Slots testId="roster-list">
              {roster.map((player) => (
                <Slot key={player.id} testId="roster-player" state="filled">
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-baseline gap-x-3">
                      <PositionPatch position={player.position} />
                      <Link
                        href={`/players/${player.id}`}
                        className="min-w-0"
                      >
                        <CardName>{player.name}</CardName>
                      </Link>
                    </span>
                    <span className="text-sm text-ink-soft">
                      {player.clubName || player.clubCode}
                    </span>
                  </span>
                </Slot>
              ))}
            </Slots>
          </Bank>
        )}
      </Sheet>
    </>
  );
}
