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
import { getSession } from "@/lib/auth/session";
import { formatTenths } from "@/lib/stats/scoring";
import { readPlayerProfile } from "@/lib/stats/queries";

/**
 * One player's game log — slice 4.5.
 *
 * Signed-in, because the pool is. The numbers are the stored tenths, so this
 * is the first surface that actually *displays* a box score.
 */
export default async function PlayerPage({
  params,
  searchParams,
}: PageProps<"/players/[id]">) {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");

  const { id } = await params;
  const query = await searchParams;
  const leagueId =
    typeof query.league === "string" ? encodeURIComponent(query.league) : null;
  const memberId =
    typeof query.member === "string" ? encodeURIComponent(query.member) : null;
  const back =
    leagueId && memberId
      ? {
          href: `/leagues/${leagueId}/teams/${memberId}`,
          label: "The roster",
        }
      : { href: "/players", label: "The pool" };
  const profile = await readPlayerProfile(id);
  if (!profile) notFound();

  const { player, log } = profile;

  return (
    <>
      <TopRail action={<BackLink href={back.href}>{back.label}</BackLink>} />
      <Sheet testId="player-log">
        <div className="flex flex-col gap-4">
          <h1 className="min-w-0 text-3xl font-semibold break-words uppercase tracking-[0.04em] sm:text-4xl">
            {player.name}
          </h1>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="slot-label">
              {player.clubCode} · {player.clubName}
            </span>
            <PositionPatch position={player.position} />
            {player.status !== "active" ? (
              <span className="slot-label">{player.status}</span>
            ) : null}
          </div>
        </div>

        <Bank
          label="Game log"
          aside={
            log.length === 0
              ? "No games stored"
              : `${log.length} game${log.length === 1 ? "" : "s"}`
          }
        >
          {log.length === 0 ? (
            <p className="min-w-0 text-sm break-words text-ink-soft" data-testid="player-log-empty">
              No box scores stored for this player yet. Nights land after a
              counted round; the roster link above is still the squad of record.
            </p>
          ) : (
            <Slots testId="player-log-rows">
              {log.map((line) => (
                <Slot key={line.id} testId="player-game" state="filled">
                  <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <CardName scale="slot">
                      {line.season} · R{line.round}
                    </CardName>
                    <span className="slot-label">{line.phase}</span>
                    <span className="slot-label">{line.clubCode}</span>
                  </span>
                  <span className="flex flex-wrap items-baseline gap-x-3 text-sm tabular-nums">
                    <span>PIR {line.pir}</span>
                    <span>{formatTenths(line.fantasyTenths)}</span>
                  </span>
                </Slot>
              ))}
            </Slots>
          )}
        </Bank>
      </Sheet>
    </>
  );
}
