"use client";

import { useActionState } from "react";

import { Correction, inputStyles } from "@/components/board";
import { SubmitButton } from "@/components/submit-button";
import {
  kickMember,
  renameTeam,
  setMemberPermission,
  type LobbyResult,
} from "@/lib/leagues/actions";
import { MAX_TEAM_NAME_LENGTH } from "@/lib/leagues/lobby";
import type { Member } from "@/lib/leagues/types";

const START: LobbyResult = { error: null };

/**
 * The commissioner's per-row powers, folded away behind a summary.
 *
 * Twelve rows each carrying an input and two buttons is a console, not a lobby;
 * one tap to open the row that needs fixing keeps the list readable on a phone
 * and costs nothing in reach. `<details>` rather than state because it wants no
 * JavaScript to work and is keyboard-navigable by default.
 */
function PermissionToggle({
  leagueId,
  member,
}: {
  leagueId: string;
  member: Member;
}) {
  const [result, action] = useActionState(setMemberPermission, START);

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="leagueId" value={leagueId} />
      <input type="hidden" name="memberId" value={member.id} />
      <input
        type="hidden"
        name="can_manage"
        value={member.canManage ? "false" : "true"}
      />
      <SubmitButton
        testId="member-permission"
        pendingLabel={member.canManage ? "Removing…" : "Granting…"}
      >
        {member.canManage ? "Stop them helping run it" : "Let them help run it"}
      </SubmitButton>
      {result.error ? (
        <Correction testId="member-permission-error">{result.error}</Correction>
      ) : null}
    </form>
  );
}

export function MemberControls({
  leagueId,
  member,
  canDelegate,
  canRemove,
}: {
  leagueId: string;
  member: Member;
  canDelegate: boolean;
  /** Only before a draft: once picks point at the row, `kickMember` refuses. */
  canRemove: boolean;
}) {
  const [rename, renameAction] = useActionState(renameTeam, START);
  const [kick, kickAction] = useActionState(kickMember, START);

  return (
    <details className="mt-2 w-full">
      <summary
        data-testid="manage-member"
        className="slot-label inline-flex min-h-11 min-w-11 cursor-pointer list-none items-center text-ink-soft transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
      >
        Manage
      </summary>

      <div className="mt-3 flex flex-col gap-3">
        <form
          action={renameAction}
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
        >
          <input type="hidden" name="leagueId" value={leagueId} />
          <input type="hidden" name="memberId" value={member.id} />
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-slot font-normal uppercase tracking-[0.06em] text-ink-soft">
              Team name
            </span>
            <input
              name="teamName"
              key={rename.value ?? member.teamName}
              defaultValue={rename.value ?? member.teamName}
              maxLength={MAX_TEAM_NAME_LENGTH}
              placeholder={member.name}
              className={inputStyles}
            />
          </label>
          <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
        </form>

        {canRemove ? (
          <form action={kickAction}>
            <input type="hidden" name="leagueId" value={leagueId} />
            <input type="hidden" name="memberId" value={member.id} />
            <SubmitButton testId="kick-member" pendingLabel="Removing…">
              Remove from league
            </SubmitButton>
          </form>
        ) : null}

        {/* Handing over the keys is the commissioner's alone: a deputy who could
            appoint deputies could hand the league to anyone. */}
        {canDelegate ? (
          <PermissionToggle leagueId={leagueId} member={member} />
        ) : null}

        {rename.error ? <Correction>{rename.error}</Correction> : null}
        {kick.error ? <Correction>{kick.error}</Correction> : null}
      </div>
    </details>
  );
}
