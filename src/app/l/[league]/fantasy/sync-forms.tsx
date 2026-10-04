"use client";

import { useActionState, useState } from "react";

import { SubmitButton } from "@/components/submit-button";
import {
  answerFantasyQuestion,
  linkFantasyLeague,
  syncFantasyNow,
  type FantasyActionResult,
} from "@/lib/fantasy/actions";
import type { SyncQuestion } from "@/lib/fantasy/match";

const IDLE: FantasyActionResult = { error: null, done: null };

const FIELD =
  "min-h-11 w-full rounded-lg border border-rule-strong bg-stock px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live";

function Said({ result, testId }: { result: FantasyActionResult; testId: string }) {
  if (result.error) {
    return (
      <p role="alert" data-testid={`${testId}-error`} className="text-sm font-semibold text-loss">
        {result.error}
      </p>
    );
  }
  return null;
}

export function LinkLeagueForm({
  leagueId,
  current,
  suggested,
}: {
  leagueId: string;
  current: string;
  suggested: string;
}) {
  const [result, action] = useActionState(linkFantasyLeague, IDLE);
  const [value, setValue] = useState(current || suggested);
  return (
    <form action={action} className="flex flex-col gap-3" data-testid="fantasy-link">
      <input type="hidden" name="leagueId" value={leagueId} />
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Official league id
        <input
          name="fantasyLeagueId"
          inputMode="numeric"
          autoComplete="off"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className={`${FIELD} stat sm:max-w-56`}
        />
      </label>
      <p className="text-xs text-ink-soft">
        The number in the official game&apos;s league address. Leave it empty to stop syncing.
      </p>
      <div>
        <SubmitButton testId="fantasy-link-save" pendingLabel="Checking…">
          {current ? "Save" : "Link league"}
        </SubmitButton>
      </div>
      <Said result={result} testId="fantasy-link" />
      {result.done && !result.error ? <p className="text-sm text-ink-soft">{result.done}</p> : null}
    </form>
  );
}

export function SyncNowForm({ leagueId, label, pendingLabel = "Reading the official rosters…" }: { leagueId: string; label: string; pendingLabel?: string }) {
  const [result, action] = useActionState(syncFantasyNow, IDLE);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="leagueId" value={leagueId} />
      <div>
        <SubmitButton tone="live" testId="fantasy-sync-now" pendingLabel={pendingLabel}>
          {label}
        </SubmitButton>
      </div>
      <Said result={result} testId="fantasy-sync" />
    </form>
  );
}

export function QuestionForm({ leagueId, question }: { leagueId: string; question: SyncQuestion }) {
  const [result, action] = useActionState(answerFantasyQuestion, IDLE);
  const [choice, setChoice] = useState("");
  if (question.kind === "member") {
    return (
      <p className="text-sm">
        <span className="font-semibold">{question.teamName}</span> has no team in the official league.
      </p>
    );
  }
  const officialId = question.kind === "team" ? question.fantasyTeamId : question.fantasyPlayerId;
  const title =
    question.kind === "team"
      ? `${question.fantasyTeamName}${question.manager ? ` (${question.manager})` : ""}`
      : question.name;
  const detail =
    question.kind === "team"
      ? "Which team in this league is it?"
      : `${question.club}${question.jersey ? ` #${question.jersey}` : ""} · on ${question.fantasyTeamName}. Which player in the pool is this?`;
  const answered = result.done !== null && result.error === null;
  return (
    <form action={action} className="flex flex-col gap-2" data-testid="fantasy-question">
      <input type="hidden" name="leagueId" value={leagueId} />
      <input type="hidden" name="kind" value={question.kind} />
      <input type="hidden" name="officialId" value={officialId} />
      <p className="text-sm">
        <span className="font-semibold">{title}</span>
        <span className="block text-ink-soft">{detail}</span>
      </p>
      {question.choices.length === 0 ? (
        <p className="text-sm text-ink-soft">
          Nobody in the pool fits. Import the latest rosters first, then sync again.
        </p>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            name="choice"
            value={choice}
            onChange={(event) => setChoice(event.target.value)}
            aria-label={`Match for ${title}`}
            className={`${FIELD} sm:max-w-80`}
          >
            <option value="">Choose…</option>
            {question.choices.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <SubmitButton compact disabled={choice === "" || answered} pendingLabel="Saving…">
            {answered ? "Saved" : "Save"}
          </SubmitButton>
        </div>
      )}
      <Said result={result} testId="fantasy-question" />
    </form>
  );
}
