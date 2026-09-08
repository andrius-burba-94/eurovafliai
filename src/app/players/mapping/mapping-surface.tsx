"use client";

import { useActionState, useState } from "react";

import { Bank, Correction, Slot, Slots } from "@/components/board";
import { SubmitButton } from "@/components/submit-button";
import {
  attachStatCode,
  checkTheFeed,
  confirmRename,
  rejectRename,
  type FeedCheck,
  type MappingResult,
  type StoredRename,
} from "@/lib/mapping/actions";
import type { StoredCheck, UnmatchedCode } from "@/lib/mapping/queries";

/**
 * The mapping surface — slice 4.2.
 *
 * Every row here is a question with two answers and no default, so the two
 * verbs sit side by side and neither is the marker-red act: DESIGN.md allows
 * exactly one of those per surface, and "these are the same person" is not more
 * primary than "they are not". Confirming is `live` only on the row being asked
 * about, in the same way the pool's armed pick is.
 *
 * **An answered question leaves the list.** Both halves work that way, because
 * both reads drop what has been resolved: `readUnmatchedCodes` skips a code
 * that now belongs to somebody, and `readLatestCheck` skips a proposal whose
 * player has gained a code or whose code has been taken. Every action here
 * revalidates, so the row is gone by the time the sentence appears.
 *
 * That disappearance *is* the confirmation, in the same way a drafted player
 * leaving the pool is — DESIGN.md's decision that this app has no material for
 * success applies exactly here. The sentence in the live region says what
 * happened; the list says what is left.
 *
 * Worth knowing because two drafts of this component got it wrong in the same
 * direction: the first claimed struck-out rows for the code half, the second
 * for the rename half, and each time the data layer had already removed the
 * row. Both were caught by the specs written for them, and the strike-through
 * that never rendered is gone rather than left as decoration.
 */

const START: MappingResult = { error: null };
const CHECK_START: FeedCheck = { error: null };

export function MappingSurface({
  unmatched,
  lastCheck,
}: {
  unmatched: UnmatchedCode[];
  lastCheck: StoredCheck | null;
}) {
  const [check, checkAction] = useActionState(
    async () => checkTheFeed(),
    CHECK_START,
  );
  const [renameResult, renameAction] = useActionState(confirmRename, START);
  const [rejectResult, rejectAction] = useActionState(rejectRename, START);
  const [attachResult, attachAction] = useActionState(attachStatCode, START);

  const errors = [renameResult, rejectResult, attachResult, check]
    .map((result) => result.error)
    .filter((message): message is string => Boolean(message));

  const dones = [renameResult, rejectResult, attachResult]
    .map((result) => (result.error ? null : result.done))
    .filter((message): message is string => Boolean(message));

  /**
   * A fresh check wins; otherwise the stored one, which is what makes coming
   * back to finish the list free. Both carry a batch id, and the confirms name
   * it — so a stale row still resolves against whatever the server recomputes.
   */
  const source = check.renames ? check : lastCheck;
  const batchId = check.renames ? check.batchId : lastCheck?.batchId;
  const renames = source?.renames ?? [];
  const checked = check.checkedAt ?? lastCheck?.checkedAt ?? null;
  const likely = renames.filter((rename) => rename.confidence === "likely");
  const asking = renames.filter((rename) => rename.confidence === "candidate");

  return (
    <>
      {errors.length > 0 ? (
        <Correction testId="mapping-error">
          <span className="flex flex-col gap-1">
            {errors.map((message) => (
              <span key={message}>{message}</span>
            ))}
          </span>
        </Correction>
      ) : null}

      {/* Outside every branch a refusal could unmount — the rule 3.7 earned
          the hard way: a correction rendered inside the thing it corrects is
          destroyed by the revalidation that produced it. */}
      {dones.length > 0 ? (
        <p
          data-testid="mapping-done"
          role="status"
          className="slot-filled px-3 py-3 text-sm"
        >
          {dones[dones.length - 1]}
        </p>
      ) : null}

      <Bank
        label="The feed's names"
        aside={checked ? `${renames.length} to answer` : "not checked"}
      >
        <p className="text-sm text-ink-soft">
          A sync holds back any pair that looks like one player under two names,
          rather than adding one and departing the other. Checking asks the feed
          what it says today and writes nothing.
        </p>
        <form action={checkAction}>
          <SubmitButton testId="mapping-check" pendingLabel="Asking the feed…">
            Check the feed
          </SubmitButton>
        </form>

        {checked && renames.length === 0 ? (
          <p className="text-sm" data-testid="mapping-none">
            Nothing is held back. The feed and the pool agree about who
            everybody is
            {typeof source?.adds === "number"
              ? `, and a sync would add ${source.adds} and depart ${source.leaving}.`
              : "."}
          </p>
        ) : null}

        {likely.length > 0 ? (
          <>
            <p className="text-sm">
              <strong>{likely.length}</strong> look like the same player under a
              new name. Nothing about them is written until you say so.
            </p>
            <Slots testId="mapping-likely">
              {likely.map((rename) => (
                <RenameRow
                  key={`${rename.existingId}-${rename.personCode}`}
                  rename={rename}
                  batchId={batchId!}
                  confirmAction={renameAction}
                  rejectAction={rejectAction}
                />
              ))}
            </Slots>
          </>
        ) : null}

        {asking.length > 0 ? (
          <>
            <p className="text-sm">
              <strong>{asking.length}</strong> have no person code and sit in a
              club with an arrival nothing else explains. These are guesses —
              pick the right one, or reject it.
            </p>
            <Slots testId="mapping-candidates">
              {asking.map((rename) => (
                <RenameRow
                  key={`${rename.existingId}-${rename.personCode}`}
                  rename={rename}
                  batchId={batchId!}
                  confirmAction={renameAction}
                  rejectAction={rejectAction}
                  choosable
                />
              ))}
            </Slots>
          </>
        ) : null}
      </Bank>

      <Bank
        label="Codes from box scores"
        aside={`${unmatched.length} unattached`}
      >
        <p className="text-sm text-ink-soft">
          A person code an import could not attach to anybody. Attaching it also
          re-imports the games it appeared in, so the lines that were refused
          before the code existed arrive.
        </p>

        {unmatched.length === 0 ? (
          <p className="text-sm" data-testid="mapping-no-codes">
            Every code in every stored import found its player.
          </p>
        ) : (
          <Slots testId="mapping-codes">
            {unmatched.map((entry) => (
              <CodeRow
                key={entry.personCode}
                entry={entry}
                action={attachAction}
              />
            ))}
          </Slots>
        )}
      </Bank>
    </>
  );
}

function RenameRow({
  rename,
  batchId,
  confirmAction,
  rejectAction,
  choosable = false,
}: {
  rename: StoredRename;
  batchId: string;
  confirmAction: (formData: FormData) => void;
  rejectAction: (formData: FormData) => void;
  choosable?: boolean;
}) {
  const [code, setCode] = useState(rename.personCode);

  return (
    <Slot state="live" testId={`rename-${rename.existingId}`}>
      <span className="flex w-full flex-col gap-2">
        <span className="text-sm">
          <strong>{rename.existingName}</strong> → {rename.incomingName}{" "}
          <span className="text-ink-soft">({rename.clubCode})</span>
        </span>
        <span className="text-xs text-ink-soft break-words">
          {rename.reason}
        </span>

        <>
          {choosable && rename.alternatives.length > 1 ? (
            <label className="flex flex-col gap-1 text-xs">
              Which arrival is this?
              <select
                value={code}
                onChange={(event) => setCode(event.target.value)}
                data-testid={`rename-choice-${rename.existingId}`}
                className="border-t-2 border-ink bg-transparent px-2 py-2 text-sm"
              >
                {rename.alternatives.map((alternative) => (
                  <option
                    key={alternative.personCode}
                    value={alternative.personCode}
                  >
                    {alternative.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <span className="flex flex-wrap gap-2">
            <form action={confirmAction}>
              <input type="hidden" name="batch" value={batchId} />
              <input type="hidden" name="player" value={rename.existingId} />
              <input type="hidden" name="code" value={code} />
              <SubmitButton
                testId={`rename-confirm-${rename.existingId}`}
                tone="liveOnField"
                compact
                pendingLabel="Merging…"
                ariaLabel={`${rename.existingName} and ${rename.incomingName} are the same player`}
              >
                Same player
              </SubmitButton>
            </form>
            <form action={rejectAction}>
              <input type="hidden" name="batch" value={batchId} />
              <input type="hidden" name="player" value={rename.existingId} />
              <input type="hidden" name="code" value={code} />
              <SubmitButton
                testId={`rename-reject-${rename.existingId}`}
                compact
                pendingLabel="Splitting…"
                ariaLabel={`${rename.existingName} and ${rename.incomingName} are different people`}
              >
                Different people
              </SubmitButton>
            </form>
          </span>
        </>
      </span>
    </Slot>
  );
}

function CodeRow({
  entry,
  action,
}: {
  entry: UnmatchedCode;
  action: (formData: FormData) => void;
}) {
  const [playerId, setPlayerId] = useState(entry.candidates[0]?.id ?? "");

  return (
    <Slot state="live" testId={`code-${entry.personCode}`}>
      <span className="flex w-full flex-col gap-2">
        <span className="text-sm">
          <strong>{entry.name ?? "(no name in the import)"}</strong>{" "}
          <span className="text-ink-soft">
            code {entry.personCode}
            {entry.clubCode ? ` · ${entry.clubCode}` : ""} ·{" "}
            {entry.games.length} game
            {entry.games.length === 1 ? "" : "s"}
          </span>
        </span>

        {entry.candidates.length === 0 ? (
          <span className="text-xs text-ink-soft">
            {entry.name
              ? "No player in the pool is missing a code in that club. Sync the rosters — this is probably somebody the pool has never had."
              : "This import carried no name, so there is nothing to match on. A stat CSV has no name column; a fetched game does."}
          </span>
        ) : (
          <>
            <label className="flex flex-col gap-1 text-xs">
              Attach it to
              <select
                value={playerId}
                onChange={(event) => setPlayerId(event.target.value)}
                data-testid={`code-choice-${entry.personCode}`}
                className="border-t-2 border-ink bg-transparent px-2 py-2 text-sm"
              >
                {entry.candidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name} ({candidate.clubCode})
                  </option>
                ))}
              </select>
            </label>
            <form action={action}>
              <input type="hidden" name="player" value={playerId} />
              <input type="hidden" name="code" value={entry.personCode} />
              <input type="hidden" name="games" value={entry.games.join(",")} />
              <SubmitButton
                testId={`code-attach-${entry.personCode}`}
                tone="liveOnField"
                compact
                pendingLabel="Attaching…"
              >
                Attach and re-import
              </SubmitButton>
            </form>
          </>
        )}
      </span>
    </Slot>
  );
}
