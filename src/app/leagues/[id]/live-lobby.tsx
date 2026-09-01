"use client";

import PocketBase from "pocketbase";
import { useActionState, useEffect, useState } from "react";

import {
  Bank,
  CardName,
  Correction,
  Slot,
  Slots,
  inputStyles,
} from "@/components/board";
import { SubmitButton } from "@/components/submit-button";
import { publicConfig } from "@/lib/config/public";
import {
  kickMember,
  renameTeam,
  setMemberPermission,
  setReady,
  type LobbyResult,
} from "@/lib/leagues/actions";
import {
  MAX_TEAM_NAME_LENGTH,
  memberListQuery,
  toMember,
} from "@/lib/leagues/lobby";
import type { LeagueSettings } from "@/lib/leagues/settings";
import type { Member, MemberRecord } from "@/lib/leagues/types";

import { DraftSetup } from "./draft-setup";
import { useRollReveal } from "./use-reveal";

/**
 * The lobby's member list, live.
 *
 * This is the app's first realtime surface and the pattern the draft room will
 * copy: the server renders the list once so the page is correct before any
 * JavaScript runs, hands the client the viewer's own PocketBase token, and the
 * client subscribes to `league_members` over SSE for everything after that.
 *
 * The token is passed in as a prop rather than re-authenticated in the browser
 * — there is no password to authenticate *with* (Google is the only door), and
 * the subscription has to run under the viewer's identity for PocketBase's read
 * rules to scope it to this league.
 *
 * Every event triggers a re-read of the whole list rather than a patch applied
 * to local state. With at most twelve members that costs nothing, and it means
 * the list cannot drift from the database no matter which events were missed
 * while the connection was down — which is the failure mode that actually
 * happens on a phone moving between wifi and cellular on draft night.
 */

const START: LobbyResult = { error: null };

export function LiveLobby({
  leagueId,
  authToken,
  commissionerUserId,
  viewerUserId,
  leagueStatus,
  maxMembers,
  initialMembers,
  justArrived,
  isCommissioner,
  settings,
}: {
  leagueId: string;
  authToken: string;
  commissionerUserId: string;
  viewerUserId: string;
  leagueStatus: string;
  maxMembers: number;
  initialMembers: Member[];
  justArrived: boolean;
  isCommissioner: boolean;
  settings: LeagueSettings;
}) {
  const [members, setMembers] = useState(initialMembers);

  // A deputy sees the same controls the commissioner does. Read off the live
  // list so a grant or a revoke reaches them without a reload.
  const viewerCanManage = members.some(
    (member) => member.isYou && member.canManage,
  );

  // The roll, arriving one slot at a time for everyone at once. Driven by the
  // stored seed, so it replays on a genuine reshuffle and not on a re-apply.
  const positioned = members.filter((member) => member.draftPosition).length;
  const { revealed, running } = useRollReveal({
    seed: positioned === members.length ? settings.roll_seed : "",
    slots: positioned,
  });
  // Starts true: the server-rendered list *was* current a moment ago, and
  // opening on "reconnecting" would cry wolf on every page load.
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    const pb = new PocketBase(publicConfig().NEXT_PUBLIC_PB_URL);
    pb.authStore.save(authToken, null);

    let active = true;
    const unsubscribes: Array<() => void> = [];

    const refresh = async () => {
      try {
        const records = await pb
          .collection("league_members")
          .getFullList<MemberRecord>(memberListQuery(leagueId));
        if (!active) return;
        setMembers(
          records.map((record) =>
            toMember(record, { commissionerUserId, viewerUserId }),
          ),
        );
      } catch {
        // A failed refresh leaves the last good list on screen. Showing an
        // empty lobby because one fetch lost a race would be worse than
        // showing one that is a few seconds stale.
      }
    };

    // `activeSubscriptions.length > 0` distinguishes a dropped connection from
    // our own teardown — see the SDK's note on this hook.
    pb.realtime.onDisconnect = (activeSubscriptions) => {
      if (active && activeSubscriptions.length > 0) setConnected(false);
    };

    void (async () => {
      try {
        unsubscribes.push(
          await pb.realtime.subscribe("PB_CONNECT", () => {
            if (!active) return;
            // Back on. Re-read rather than trust the gap: events that fired
            // while the socket was down were never delivered to anyone.
            setConnected(true);
            void refresh();
          }),
        );
        unsubscribes.push(
          await pb
            .collection("league_members")
            .subscribe("*", () => void refresh(), {
              // Single quotes: PocketBase rejects double-quoted filter values.
              filter: `league = '${leagueId}'`,
            }),
        );
      } catch {
        if (active) setConnected(false);
      }
    })();

    return () => {
      active = false;
      for (const unsubscribe of unsubscribes) unsubscribe();
      void pb.realtime.unsubscribe();
    };
  }, [leagueId, authToken, commissionerUserId, viewerUserId]);

  const you = members.find((member) => member.isYou);
  const slotsLeft = Math.max(maxMembers - members.length, 0);
  const readyCount = members.filter((member) => member.isReady).length;
  const inSetup = leagueStatus === "setup";

  return (
    <>
      {you && inSetup ? <YourTeam leagueId={leagueId} you={you} /> : null}

      <Bank
        label="Members"
        aside={
          <span data-testid="member-tally">
            {readyCount} of {members.length} ready
          </span>
        }
      >
        {connected ? null : (
          <p
            data-testid="reconnecting"
            role="status"
            className="slot-label px-3 pb-1 text-ink-soft"
          >
            Reconnecting — this list may be behind
          </p>
        )}

        <Slots testId="member-list">
          {members.map((member) => (
            <MemberSlot
              key={member.id}
              leagueId={leagueId}
              member={member}
              landed={justArrived && member.isYou}
              canManage={(isCommissioner || viewerCanManage) && inSetup}
              canDelegate={isCommissioner && inSetup}
              positionRevealed={
                !member.draftPosition || revealed(member.draftPosition)
              }
            />
          ))}
          {/* The free places are part of the board, not a blank area below it:
              a lobby that is half full should look half full. */}
          {Array.from({ length: slotsLeft }, (_, index) => (
            <Slot key={`free-${index}`} state="waiting">
              <span className="slot-label text-ink-faint">
                Slot {String(members.length + index + 1).padStart(2, "0")}
              </span>
            </Slot>
          ))}
        </Slots>
      </Bank>

      {running ? (
        <p
          data-testid="reveal-running"
          aria-live="polite"
          className="slot-label text-live"
        >
          Drawing the order&hellip;
        </p>
      ) : null}

      {/* Slice 2.3a. Only the commissioner sees it, and `updateDraftSettings`
          checks that again server-side rather than trusting this render. */}
      {(isCommissioner || viewerCanManage) && inSetup ? (
        <DraftSetup leagueId={leagueId} settings={settings} members={members} />
      ) : null}
    </>
  );
}

/** Your own row's controls, lifted out of the list so the list stays scannable. */
function YourTeam({ leagueId, you }: { leagueId: string; you: Member }) {
  const [rename, renameAction] = useActionState(renameTeam, START);
  const [ready, readyAction] = useActionState(setReady, START);

  return (
    <Bank label="Your team">
      <div className="flex flex-col gap-3 border-b border-rule-strong px-3 py-4">
        <form
          action={renameAction}
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <input type="hidden" name="leagueId" value={leagueId} />
          <input type="hidden" name="memberId" value={you.id} />
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-slot font-normal uppercase tracking-[0.06em] text-ink-soft">
              Team name
            </span>
            <input
              name="teamName"
              // React 19 clears an uncontrolled input across a server-action
              // transition (AGENTS.md), so the value has to be re-seeded from
              // what came back rather than left to the DOM.
              key={rename.value ?? you.teamName}
              defaultValue={rename.value ?? you.teamName}
              maxLength={MAX_TEAM_NAME_LENGTH}
              placeholder={you.name}
              data-testid="team-name-input"
              className={inputStyles}
            />
          </label>
          <SubmitButton testId="save-team-name" pendingLabel="Saving…">
            Save
          </SubmitButton>
        </form>

        <form action={readyAction} className="flex items-center gap-3">
          <input type="hidden" name="leagueId" value={leagueId} />
          <input type="hidden" name="memberId" value={you.id} />
          <input type="hidden" name="ready" value={you.isReady ? "0" : "1"} />
          <SubmitButton
            testId="toggle-ready"
            tone={you.isReady ? "ink" : "live"}
            pendingLabel="Saving…"
          >
            {you.isReady ? "Not ready after all" : "I'm ready"}
          </SubmitButton>
        </form>

        {rename.error ? (
          <Correction testId="team-name-error">{rename.error}</Correction>
        ) : null}
        {ready.error ? (
          <Correction testId="ready-error">{ready.error}</Correction>
        ) : null}
      </div>
    </Bank>
  );
}

/**
 * One member on the board.
 *
 * Readiness is written as a word in the label run, not as a colour or a heavier
 * rule. The board's marker means exactly one thing — who is on the clock — and
 * spending it on "ready" here would leave the draft room with nothing left to
 * say with (DESIGN.md).
 */
function MemberSlot({
  leagueId,
  member,
  landed,
  canManage,
  canDelegate,
  positionRevealed,
}: {
  leagueId: string;
  member: Member;
  landed: boolean;
  canManage: boolean;
  /** Only the commissioner may hand out management powers. */
  canDelegate: boolean;
  positionRevealed: boolean;
}) {
  const labels = [
    member.isCommissioner ? "commissioner" : null,
    // Shown to everybody, not just the commissioner: who can change the league
    // is the sort of thing the league should be able to see.
    !member.isCommissioner && member.canManage ? "helps run it" : null,
    member.isYou ? "you" : null,
    member.isReady ? "ready" : null,
  ].filter(Boolean);

  return (
    <Slot
      testId="member"
      landed={landed}
      className={canManage && !member.isYou ? "flex-col items-stretch" : ""}
    >
      <span className="flex flex-1 flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="flex items-baseline gap-2.5">
          {/* The slot the roll gave them. Tabular figures, so a column of them
              is a column (DESIGN.md). */}
          {member.draftPosition && positionRevealed ? (
            <span
              data-testid="member-position"
              className="card-lands slot-label tabular-nums text-live"
            >
              {String(member.draftPosition).padStart(2, "0")}
            </span>
          ) : null}
          <CardName>{member.teamName || member.name}</CardName>
        </span>
        <span className="flex flex-wrap items-baseline gap-x-3">
          {member.teamName ? (
            <span data-testid="member-name" className="text-sm text-ink-soft">
              {member.name}
            </span>
          ) : null}
          <span data-testid="member-labels" className="slot-label">
            {labels.join(" · ")}
          </span>
        </span>
      </span>

      {canManage && !member.isYou ? (
        <CommissionerControls
          leagueId={leagueId}
          member={member}
          canDelegate={canDelegate}
        />
      ) : null}
    </Slot>
  );
}

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

function CommissionerControls({
  leagueId,
  member,
  canDelegate,
}: {
  leagueId: string;
  member: Member;
  canDelegate: boolean;
}) {
  const [rename, renameAction] = useActionState(renameTeam, START);
  const [kick, kickAction] = useActionState(kickMember, START);

  return (
    <details className="mt-2 w-full">
      <summary
        data-testid="manage-member"
        className="slot-label cursor-pointer list-none text-ink-soft transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
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

        <form action={kickAction}>
          <input type="hidden" name="leagueId" value={leagueId} />
          <input type="hidden" name="memberId" value={member.id} />
          <SubmitButton testId="kick-member" pendingLabel="Removing…">
            Remove from league
          </SubmitButton>
        </form>

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
