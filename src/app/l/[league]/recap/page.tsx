import { notFound, redirect } from "next/navigation";

import { Bank, Door, EmptyNotice, Slots } from "@/components/board";
import { PageHeader } from "@/components/broadcast";
import { AppShell } from "@/components/app-shell";
import {
  resolveSeason,
  SeasonControl,
} from "@/components/season-control";
import { getSession } from "@/lib/auth/session";
import { serverConfig } from "@/lib/config/server";
import { getLeagueWithMembers } from "@/lib/leagues/queries";
import { navLeagueFrom } from "@/lib/nav/items";
import { readRoundProgress } from "@/lib/fixtures/queries";
import { readLeagueRecap, readStandingsSnapshots } from "@/lib/stats/queries";
import { stylesById } from "@/lib/teams/identity";

import { readBriefCount, readRoundBrief, readRoundWriteup } from "@/lib/ai/queries";
import { briefVerdict } from "@/lib/ai/view";
import { formatTipOff } from "@/lib/time/local";

import { RecapBody } from "./recap-body";
import { WriteupNote, WriteupSummary, YourRound, type WriteupLinks } from "./writeup";
import { WriteupStrip } from "./writeup-strip";
import { RoundPicker } from "./round-picker";
import { leagueHref, leaguePaths } from "@/lib/nav/urls";

/**
 * One Euroleague night — slice 5.4.
 *
 * Rank, best night and biggest swing are derived from snapshots, windows,
 * box scores and recorded deals. Nothing here is stored as a recap row.
 */
export default async function RecapPage({
  params,
  searchParams,
}: PageProps<"/l/[league]/recap">) {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");

  const { league: leagueRef } = await params;
  const query = await searchParams;
  const currentSeason = serverConfig().EUROLEAGUE_SEASON;
  const season = resolveSeason(query.season, currentSeason);
  const roundRaw = typeof query.round === "string" ? Number(query.round) : NaN;
  const requestedRound =
    Number.isInteger(roundRaw) && roundRaw > 0 ? roundRaw : null;

  const data = await getLeagueWithMembers(leagueRef);
  if (!data) notFound();
  const id = data.league.id;
  const base = leagueHref(data.league);

  const viewer = data.members.find((member) => member.isYou);
  if (!viewer) notFound();

  // With no round asked for, the last round that is over: a round still being
  // played is offered in the picker, marked, but is not the front page.
  const progress =
    data.league.status === "season"
      ? await readRoundProgress(
          season,
          session.token,
          (await readStandingsSnapshots(id, season).catch(() => [])).map((snap) => snap.round),
        )
      : null;
  const page = progress
    ? await readLeagueRecap(id, season, requestedRound ?? progress.lastComplete, Boolean(data.league.basketnews_team_id))
    : null;
  const open = page && progress && !progress.complete.includes(page.recap.round)
    ? progress.current?.round === page.recap.round
      ? { played: progress.current.played, total: progress.current.total }
      : { played: null, total: null }
    : null;

  const names = Object.fromEntries(
    data.members.map((member) => [
      member.id,
      member.teamName.trim() ? member.teamName : member.name,
    ]),
  );

  // 7.1: the round's write-up, when write-ups are on and the round is over.
  // Read-only and never the model: the worker wrote it (ADR-0012).
  // 7.3 D: the viewer's own brief, under the same conditions. Its tag is the
  // place on Recap's ladder; a member the night did not rank gets no panel.
  const written = page && !open && data.settings.ai.enabled ? page.recap : null;
  const verdict = written ? briefVerdict(written.rows, viewer.id) : null;
  // 7.3 E: the commissioner's count of the round's briefs — numbers only, read
  // server-side because their token cannot see other members' rows.
  const [writeup, brief, briefCount] = await Promise.all([
    written
      ? readRoundWriteup({ token: session.token, leagueId: id, season, round: written.round, teamNames: names }).catch(() => null)
      : null,
    written && verdict
      ? readRoundBrief({ token: session.token, leagueId: id, season, round: written.round, memberId: viewer.id, teamNames: names }).catch(
          () => null,
        )
      : null,
    written && data.isCommissioner ? readBriefCount({ leagueId: id, season, round: written.round }).catch(() => null) : null,
  ]);
  const viewerManages = data.isCommissioner || viewer.canManage;
  const paths = leaguePaths(data.league, data.members);
  const links: WriteupLinks | null = writeup ? { paths, league: data.league, players: writeup.players } : null;

  const emptyDraft = data.league.status !== "season";
  const emptyScores = !emptyDraft && page === null;

  return (
    <AppShell current="recap" league={navLeagueFrom(data)} measure="wide" testId="recap">
      <PageHeader
        eyebrow={page ? `${data.league.name} · round ${page.recap.round}` : data.league.name}
        title="Recap"
      />

      <SeasonControl
        action={`${base}/recap`}
        season={season}
        currentSeason={currentSeason}
      />

      {requestedRound !== null &&
      page &&
      page.recap.round !== requestedRound ? (
        <p data-testid="recap-round-fallback" className="rounded-lg border border-gold/40 bg-gold/10 px-3.5 py-3 text-sm">
          Round {requestedRound} is not counted yet. Showing round {page.recap.round}.
        </p>
      ) : null}

      {emptyDraft ? (
        <Bank framed label="The night">
          <EmptyNotice testId="recap-empty">
            The draft is not complete, so there is no recap yet. This page is
            one Euroleague night after the board is full.
          </EmptyNotice>
          <Slots>
            <Door
              href={`${base}`}
              title="The lobby"
              description="Finish the draft, then come back for the night."
              action="Open"
              testId="recap-empty-lobby"
            />
          </Slots>
        </Bank>
      ) : emptyScores ? (
        <Bank framed label="The night">
          <EmptyNotice testId="recap-empty">
            No box scores counted for {season} yet. Rank, best night and swing
            wait on a counted round.
          </EmptyNotice>
          <Slots>
            <Door
              href={`${base}`}
              title="The lobby"
              description="The season board is already open. Nights land on their own."
              action="Open"
              testId="recap-empty-lobby"
            />
          </Slots>
        </Bank>
      ) : page ? (
        <>
          <RoundPicker base={base}
            season={season}
            round={page.recap.round}
            rounds={page.countedRounds}
            complete={progress?.complete ?? page.countedRounds}
          />
          <RecapBody
            recap={page.recap}
            names={names}
            styles={stylesById(data.members)}
            playerNames={page.playerNames}
            playerCodes={page.playerCodes}
            leagueId={id} paths={paths}
            season={season}
            open={open}
            brief={
              brief && verdict ? (
                <YourRound
                  view={brief.view}
                  verdict={verdict}
                  round={page.recap.round}
                  links={{ paths, league: data.league, players: brief.players }}
                />
              ) : null
            }
            summary={
              writeup && links ? (
                <WriteupSummary
                  read={writeup}
                  links={links}
                  strip={
                    viewerManages ? (
                      <WriteupStrip
                        leagueId={id}
                        season={season}
                        round={page.recap.round}
                        state={writeup.state}
                        failure={writeup.failure}
                        writtenAt={formatTipOff(writeup.writtenAt?.replace(" ", "T"))}
                        voice={writeup.voice}
                        canRewrite={data.isCommissioner && season === currentSeason}
                        settingsHref={`${base}/settings`}
                        authToken={session.token}
                        briefs={briefCount ? { ...briefCount, total: page.recap.rows.length } : null}
                      />
                    ) : null
                  }
                />
              ) : null
            }
            notes={
              links
                ? {
                    table: <WriteupNote read={writeup} section="table" links={links} />,
                    stars: <WriteupNote read={writeup} section="stars" links={links} />,
                    swing: <WriteupNote read={writeup} section="swing" links={links} />,
                  }
                : undefined
            }
          />
        </>
      ) : null}
    </AppShell>
  );
}
