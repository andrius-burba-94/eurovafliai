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
  const rosterSize = radarSize(template);
  const waiting = Math.max(rosterSize - roster.length, 0);

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

        {roster.length === 0 ? (
          <p className="text-ink-soft" data-testid="roster-empty">
            No players are on this roster yet.
          </p>
        ) : (
          <Bank label="The roster" aside={`${roster.length} of ${rosterSize}`}>
            <Slots testId="roster-list">
              {roster.map((player) => (
                <Slot key={player.id} testId="roster-player" state="filled">
                  <Link
                    href={`/players/${player.id}?league=${encodeURIComponent(id)}&member=${encodeURIComponent(memberId)}`}
                    className="-mx-3 -my-3 flex min-h-11 min-w-0 flex-1 items-center gap-3 px-3 py-3 transition-colors hover:bg-ink/5 active:bg-ink/10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-live"
                  >
                    <PositionPatch position={player.position} />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <CardName>{player.name}</CardName>
                      <span className="text-sm text-ink-soft">
                        {player.clubName || player.clubCode}
                      </span>
                    </span>
                  </Link>
                </Slot>
              ))}
              {Array.from({ length: waiting }, (_, index) => (
                <Slot key={`waiting-${index}`} state="waiting">
                  <span className="slot-label text-ink-faint">
                    Open roster slot{" "}
                    {String(roster.length + index + 1).padStart(2, "0")}
                  </span>
                </Slot>
              ))}
            </Slots>
          </Bank>
        )}

        <RosterRadar
          rows={radar}
          columns={[
            { memberId: member.id, name: displayName, isYou: member.isYou },
          ]}
          total={rosterSize}
          onClockMemberId={null}
        />
      </Sheet>
    </>
  );
}
