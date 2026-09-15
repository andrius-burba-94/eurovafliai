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
import { readNewsFor } from "@/lib/news/queries";
import { formatTenths } from "@/lib/stats/scoring";
import { readPlayerProfile } from "@/lib/stats/queries";

/**
 * One figure and its name, as a definition pair.
 *
 * A `<dl>` rather than a row of spans because that is what this is — the label
 * is not decoration, it is the only thing that distinguishes a 5.7 from a
 * 5.7. `lead` gives PIR the full-ink, name-sized treatment it gets in the pool,
 * so the two surfaces agree about which number matters.
 */
function Stat({
  label,
  value,
  lead = false,
}: {
  label: string;
  value: string | null;
  lead?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="slot-label">{label}</dt>
      <dd
        className={`tabular-nums ${lead ? "text-2xl font-semibold" : "text-sm"} ${
          value === null ? "text-ink-faint" : ""
        }`}
      >
        {value ?? "—"}
      </dd>
    </div>
  );
}

/**
 * One player: last season, then the game log — slices 4.5 and 9.1.
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
  const news = await readNewsFor(id);

  const { player, log } = profile;
  const bio = [
    player.bio.dorsal ? `#${player.bio.dorsal}` : null,
    player.bio.height ? `${player.bio.height} cm` : null,
    player.bio.weight ? `${player.bio.weight} kg` : null,
    player.bio.birthYear ? `b. ${player.bio.birthYear}` : null,
    player.bio.country,
  ].filter((part): part is string => Boolean(part));

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
            {/* The roster feed has carried all of this since 2.1 and nothing
                read it. Each part appears only if the feed has it — one of
                332 E2026 players has no height. */}
            {bio.length > 0 ? (
              <span className="slot-label" data-testid="player-bio">
                {bio.join(" · ")}
              </span>
            ) : null}
          </div>
        </div>

        {/* **Last season, above the game log, because on draft night it is the
            only thing on this page.** E2026 has no games in it, so the log
            below is empty for every player and this block is the whole
            answer to "who is this". PIR leads for the same reason it leads
            the pool row: it is the number the league talks in. */}
        <Bank
          label="Last season"
          aside={
            player.previousSeason
              ? `${player.previousSeason.season} · ${player.previousSeason.games} game${
                  player.previousSeason.games === 1 ? "" : "s"
                }`
              : "Not imported"
          }
        >
          {player.previousSeason ? (
            <dl
              className="flex flex-wrap gap-x-8 gap-y-3"
              data-testid="player-prev-season"
            >
              <Stat
                label="PIR"
                value={formatTenths(player.previousSeason.pir)}
                lead
              />
              <Stat
                label="Fantasy"
                value={
                  player.previousSeason.fantasy === null
                    ? null
                    : formatTenths(player.previousSeason.fantasy)
                }
              />
              <Stat
                label="Points"
                value={
                  player.previousSeason.points === null
                    ? null
                    : formatTenths(player.previousSeason.points)
                }
              />
              <Stat
                label="Rebounds"
                value={
                  player.previousSeason.rebounds === null
                    ? null
                    : formatTenths(player.previousSeason.rebounds)
                }
              />
              <Stat
                label="Assists"
                value={
                  player.previousSeason.assists === null
                    ? null
                    : formatTenths(player.previousSeason.assists)
                }
              />
              <Stat label="2P" value={player.previousSeason.twoPointPct} />
              <Stat label="3P" value={player.previousSeason.threePointPct} />
              <Stat label="FT" value={player.previousSeason.freeThrowPct} />
            </dl>
          ) : (
            <p
              className="min-w-0 text-sm break-words text-ink-soft"
              data-testid="player-prev-season-empty"
            >
              Nothing stored for last season — they did not play in the
              Euroleague, or they arrived after the numbers were imported.
              Roughly a third of the pool is in this position every September,
              which is what a cheat sheet is for.
            </p>
          )}
        </Bank>

        {/* Only when there is something, and only ever a headline and a link.
            A player with no published news gets no empty box explaining that
            a publisher has not mentioned them — see 9.4's notes. */}
        {news.length > 0 ? (
          <Bank label="In the news" aside={`${news.length}`}>
            <Slots testId="player-news-rows" label={`News about ${player.name}`}>
              {news.map((item) => (
                <Slot key={item.id} testId="player-news" state="filled">
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-sm">{item.headline}</span>
                    <span className="text-xs text-ink-soft">
                      {item.published || "undated"}
                      {item.bodyPart ? ` · ${item.bodyPart}` : ""} ·{" "}
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-live underline decoration-live/40 underline-offset-4 transition-colors hover:decoration-live focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
                      >
                        RotoWire
                      </a>
                    </span>
                  </span>
                </Slot>
              ))}
            </Slots>
          </Bank>
        ) : null}

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
