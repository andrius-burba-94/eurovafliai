import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { Bank, EmptyNotice } from "@/components/board";
import { PageHeader } from "@/components/broadcast";
import { getSession } from "@/lib/auth/session";
import { serverConfig } from "@/lib/config/server";
import { readFantasySyncView } from "@/lib/fantasy/queries";
import { readSyncRuns, type SyncRun, type SyncStatus } from "@/lib/fantasy/store";
import { getLeagueWithMembers } from "@/lib/leagues/queries";
import { navLeagueFrom } from "@/lib/nav/items";
import { createUserClient } from "@/lib/pb/server";
import { formatTipOff } from "@/lib/time/local";

import { LinkLeagueForm, QuestionForm, SyncNowForm } from "./sync-forms";

const STATUS_WORD: Record<SyncStatus, string> = {
  preview: "Preview",
  blocked: "Needs answers",
  applying: "Applying",
  applied: "Applied",
  failed: "Failed",
  queued: "Queued",
  running: "Running",
};

const STATUS_TONE: Record<SyncStatus, string> = {
  preview: "bg-stock-high text-ink",
  blocked: "bg-stock-high text-ink",
  applying: "bg-stock-high text-ink",
  applied: "bg-gain/15 text-gain",
  failed: "bg-loss/15 text-loss",
  queued: "bg-stock-high text-ink",
  running: "bg-stock-high text-ink",
};

function ranAt(run: SyncRun): string {
  return formatTipOff(run.ran_at.replace(" ", "T")) ?? "";
}

/**
 * The Fantasy Challenge sync: the league makes its moves in the official game,
 * and this is where its commissioner links the two, answers what the matcher
 * could not place, and reads what each sync did. Same gate as recording a trade.
 */
export default async function FantasySyncPage({ params }: PageProps<"/l/[league]/fantasy">) {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");
  const { league: leagueRef } = await params;
  const data = await getLeagueWithMembers(leagueRef);
  if (!data) notFound();
  const id = data.league.id;
  const canManage = data.isCommissioner || data.members.some((member) => member.isYou && member.canManage);
  if (!canManage || (data.league.status !== "season" && !(data.league.basketnews_team_id && data.league.status === "setup"))) notFound();

  if (data.league.basketnews_team_id) {
    const runs = await readSyncRuns(createUserClient(session.token), id, 8);
    const latest = runs[0];
    const questions = latest?.status === "blocked" ? latest.questions : [];
    return (
      <AppShell current="trades" league={navLeagueFrom(data)} testId="fantasy-sync">
        <PageHeader eyebrow={`${data.league.name} · Import`} title="BasketNews sync"
          lead="BasketNews owns this league's draft, rosters, lineups and round points. The worker refreshes it automatically." />
        <Bank framed label="Source league" aside={serverConfig().BASKETNEWS_COOKIE ? "Session set" : "Session needed"}>
          <p className="text-sm text-ink-soft">{data.league.name} · Your team: {data.members.find((member) => member.isYou)?.teamName ?? "Importing"}</p>
          {!serverConfig().BASKETNEWS_COOKIE ? <EmptyNotice>Set BASKETNEWS_COOKIE on the worker to import private lineups. The league data already stored here is preserved if the session expires.</EmptyNotice> : null}
          <p className="mt-3 text-sm text-ink-soft">Sync now adds a worker job. New rounds are checked every 15 minutes.</p>
          <div className="mt-3"><SyncNowForm leagueId={id} label="Sync now" pendingLabel="Queuing…" /></div>
        </Bank>
        {questions.length ? <Bank framed label="Match BasketNews players" aside={`${questions.length} waiting`}>
          <ul role="list" className="flex flex-col gap-4">{questions.map((question) => <li key={question.kind === "player" ? question.fantasyPlayerId : question.kind === "team" ? question.fantasyTeamId : question.memberId}><QuestionForm leagueId={id} question={question} /></li>)}</ul>
        </Bank> : null}
        <Bank framed label="Recent syncs" aside={latest ? `Last ${ranAt(latest)}` : undefined}>
          {runs.length ? <ol className="flex flex-col gap-3" data-testid="fantasy-runs">{runs.map((run) => <li key={run.id} data-testid="fantasy-run" data-status={run.status} className="rounded-xl border border-panel-border bg-stock p-3">
            <p className="flex gap-2 text-xs text-ink-soft"><span className={`rounded-full px-2 py-0.5 font-bold ${STATUS_TONE[run.status]}`}>{STATUS_WORD[run.status]}</span><span>{ranAt(run)}</span></p>
            <p className="mt-2 text-sm">{run.message}</p>
          </li>)}</ol> : <EmptyNotice>Waiting for the first worker pass.</EmptyNotice>}
        </Bank>
      </AppShell>
    );
  }

  const view = await readFantasySyncView(id);
  if (!view) notFound();
  const linked = data.league.fantasy_league_id ?? "";
  const latest = view.runs[0] ?? null;
  const asking = (["rosters", "lineups"] as const).flatMap((kind) => {
    const newest = view.runs.find((run) => run.kind === kind);
    return newest?.status === "blocked" ? newest.questions : [];
  });
  const questionKey = (question: (typeof asking)[number]) =>
    question.kind === "team" ? question.fantasyTeamId : question.kind === "player" ? question.fantasyPlayerId : question.memberId;
  const questions = asking.filter((question, index) => asking.findIndex((other) => questionKey(other) === questionKey(question)) === index);

  const schedule =
    view.decision.mode === "apply"
      ? `Round ${view.decision.round} is under way, so the official rosters are frozen. The sync writes any change it finds, and every team's official lineup, hourly until the round's last game.`
      : view.window && view.firstApplyAt
        ? `Round ${view.window.round} tips off ${formatTipOff(view.window.lockAt)}. The sync writes from ${formatTipOff(view.firstApplyAt)}, then hourly through the round; until then it only previews.`
        : "No upcoming round is in the schedule, so the sync only previews.";

  return (
    <AppShell current="trades" league={navLeagueFrom(data)} testId="fantasy-sync">
      <PageHeader
        eyebrow={`${data.league.name} · Trades`}
        title="Fantasy Challenge sync"
        lead="Moves and lineups happen in the official game. Once a round tips off, its rosters and lineups are the ones playing, and this keeps the league's in step with them."
      />

      <Bank framed label="Official league" aside={view.tokenSet ? "Token set" : "No token"}>
        {view.tokenSet ? null : (
          <EmptyNotice>
            The server has no Fantasy Challenge token, so nothing syncs. Set
            FANTASY_CHALLENGE_TOKEN in the server&apos;s environment and restart.
          </EmptyNotice>
        )}
        <LinkLeagueForm leagueId={id} current={linked} suggested={view.suggestedLeagueId} />
      </Bank>

      {linked ? (
        <Bank framed label="Schedule">
          <p className="text-sm text-ink-soft" data-testid="fantasy-schedule">{schedule}</p>
          {view.tokenSet ? (
            <SyncNowForm
              leagueId={id}
              label={view.decision.mode === "apply" ? "Sync now" : "Preview now"}
            />
          ) : null}
        </Bank>
      ) : null}

      {questions.length > 0 ? (
        <Bank framed label="Answer before it can sync" aside={`${questions.length} waiting`}>
          <p className="text-sm text-ink-soft">
            Each answer is kept, so it is asked once. Sync again when these are done.
          </p>
          <ul role="list" className="flex flex-col gap-4">
            {questions.map((question) => (
              <li
                key={questionKey(question)}
                className="border-t border-panel-border pt-4 first:border-t-0 first:pt-0"
              >
                <QuestionForm leagueId={id} question={question} />
              </li>
            ))}
          </ul>
        </Bank>
      ) : null}

      {linked ? (
        <Bank framed label="Recent syncs" aside={latest ? `Last ${ranAt(latest)}` : undefined}>
          {view.runs.length === 0 ? (
            <EmptyNotice testId="fantasy-no-runs">
              Nothing has synced yet. The first preview runs within ten minutes, or now with the button above.
            </EmptyNotice>
          ) : (
            <ol className="flex flex-col gap-3" data-testid="fantasy-runs">
              {view.runs.map((run) => (
                <li key={run.id} data-testid="fantasy-run" data-status={run.status} className="flex flex-col gap-2 rounded-xl border border-panel-border bg-stock p-3">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
                    <span className={`rounded-full px-2 py-0.5 font-bold ${STATUS_TONE[run.status]}`}>{STATUS_WORD[run.status]}</span>
                    <span className="font-semibold">{run.kind === "lineups" ? "Lineups" : "Rosters"}</span>
                    {run.round > 0 ? <span className="font-semibold">Round {run.round}</span> : null}
                    <span>{ranAt(run)}</span>
                  </p>
                  <p className="text-sm">{run.message}</p>
                  {run.moves.length > 0 ? (
                    <ul role="list" className="flex list-disc flex-col gap-1 pl-5 text-sm text-ink-soft">
                      {run.moves.map((move) => (
                        <li key={move}>{move}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </Bank>
      ) : null}
    </AppShell>
  );
}
