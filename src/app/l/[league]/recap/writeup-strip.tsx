"use client";

import Link from "next/link";
import type PocketBase from "pocketbase";
import { useActionState, useCallback } from "react";
import { useRouter } from "next/navigation";

import { SubmitButton } from "@/components/submit-button";
import { requestRoundRewrite, type RewriteResult } from "@/lib/ai/actions";
import type { WriteupState } from "@/lib/ai/queries";
import { useLiveSubscription } from "@/lib/pb/use-live";

const START: RewriteResult = { error: null };

/**
 * The managers' strip under the round's write-up — 7.1. Folded while the
 * write-up is written; open when something needs a look. Rewrite is the
 * commissioner's alone and only queues: the worker writes within a minute and
 * the row's change re-renders the page. Never shown to a member.
 */
export function WriteupStrip({
  leagueId,
  season,
  round,
  state,
  failure,
  writtenAt,
  voice,
  canRewrite,
  settingsHref,
  authToken,
}: {
  leagueId: string;
  season: string;
  round: number;
  state: WriteupState;
  failure: "guard" | "google" | null;
  /** "Fri 9 Oct, 14:06", league time. */
  writtenAt: string | null;
  voice: string;
  canRewrite: boolean;
  settingsHref: string;
  authToken: string;
}) {
  const router = useRouter();
  const [result, action] = useActionState(requestRoundRewrite, START);
  // The action's answer says the request landed; the row's own change, below,
  // says the worker has it. Until then this round reads as rewriting.
  const asked = result.requested === round && result.error === null;
  const shown: WriteupState = asked && state !== "failed" ? "rewriting" : state;

  const subscribe = useCallback(
    async (pb: PocketBase) => [
      // Single quotes: PocketBase rejects double-quoted filter values.
      await pb.collection("ai_writeups").subscribe("*", () => router.refresh(), { filter: `league = '${leagueId}'` }),
    ],
    [leagueId, router],
  );
  useLiveSubscription({ authToken, subscribe });

  const summary =
    shown === "written"
      ? `Write-up · ${writtenAt ? `written ${writtenAt}` : "written"} · ${voice}`
      : shown === "rewriting"
        ? "Write-up · rewriting…"
        : "Write-up · couldn't write";
  const dot = shown === "written" ? "bg-gain" : shown === "rewriting" ? "bg-live motion-safe:animate-pulse" : "bg-loss";

  return (
    <details className="group border-t border-panel-border" open={shown !== "written"} data-testid="recap-writeup-strip">
      <summary className="slot-label flex min-h-11 cursor-pointer list-none items-center gap-2.5 text-ink-soft transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${dot}`} />
        <span data-testid="recap-writeup-status">{summary}</span>
        <span aria-hidden="true" className="ml-auto text-base transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="flex flex-col gap-3 pb-1 text-sm text-ink-soft">
        {shown === "written" ? (
          <p>
            Written in the {voice}&rsquo;s voice. Every number and name in it was checked against round {round}&rsquo;s
            figures before anyone saw it.
          </p>
        ) : shown === "rewriting" ? (
          <p>A new write-up is on its way, usually within a minute. What is here stays up until it lands.</p>
        ) : (
          <p className="text-ink">
            <span className="font-semibold text-loss">Couldn&rsquo;t write round {round}.</span>{" "}
            {failure === "google"
              ? "Google's model did not answer; the next pass tries again."
              : "The model's answer didn't check out against the figures."}{" "}
            Any earlier write-up stays up.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {canRewrite ? (
            <form action={action}>
              <input type="hidden" name="leagueId" value={leagueId} />
              <input type="hidden" name="season" value={season} />
              <input type="hidden" name="round" value={round} />
              <SubmitButton tone="ink" testId="recap-writeup-rewrite" pendingLabel="Asking…" disabled={shown === "rewriting"}>
                {shown === "rewriting" ? "Rewriting…" : "Rewrite this round"}
              </SubmitButton>
            </form>
          ) : null}
          <Link
            href={settingsHref}
            className="inline-flex min-h-11 items-center underline underline-offset-[3px] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
          >
            Write-up settings
          </Link>
        </div>
        {result.error ? (
          <p role="alert" className="text-loss" data-testid="recap-writeup-rewrite-error">
            {result.error}
          </p>
        ) : null}
      </div>
    </details>
  );
}
