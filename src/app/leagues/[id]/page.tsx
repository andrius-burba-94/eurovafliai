import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  BackArrow,
  Bank,
  BoardPlan,
  CardName,
  PositionPatch,
  Sheet,
  Slot,
  Slots,
  TopRail,
} from "@/components/board";
import { getSession } from "@/lib/auth/session";
import { getLeagueWithMembers } from "@/lib/leagues/queries";
import { rosterSize } from "@/lib/leagues/settings";

/**
 * The lobby: who is in, and the code that lets the rest in.
 *
 * This is the board before any pick exists, so it shows the board's own shape —
 * one slot per member, taken slots ruled solid and the free places still
 * dashed, which is the same grid the draft fills in Phase 3.
 *
 * `?arrived=1` is set by the create and join actions, and it is what fires the
 * card-landing motion on the one row that genuinely just arrived. Without a
 * signal like that the motion would either never play or play on every load,
 * and the second is decoration.
 *
 * The live member list arrives in the next slice (1.3b) via a PocketBase SSE
 * subscription. Today it renders server-side, so a friend joining shows up on
 * the next load rather than instantly.
 */
export default async function LobbyPage({
  params,
  searchParams,
}: PageProps<"/leagues/[id]">) {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");

  const { id } = await params;
  const { arrived } = await searchParams;
  const justArrived = arrived === "1";
  const data = await getLeagueWithMembers(id);

  // Not found and not-yours are the same answer on purpose: telling them apart
  // would let anyone probe which leagues exist.
  if (!data) notFound();

  // The repair for createLeague's lost second write happens inside the query,
  // before it reads the members — see the comment there for why the order
  // matters.
  const { league, settings, members, isCommissioner } = data;
  const slotsLeft = settings.max_members - members.length;
  const template = settings.roster_template;

  return (
    <>
      <TopRail
        action={
          <Link
            href="/"
            className="slot-label inline-flex items-center gap-1.5 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
          >
            <BackArrow />
            Leagues
          </Link>
        }
      />
      <Sheet testId="lobby">
        <div className="flex flex-col gap-4">
          <h1 className="text-3xl font-semibold uppercase tracking-[0.04em] sm:text-4xl">
            {league.name}
          </h1>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="slot-label">
              {league.season} &middot; {league.status}
            </span>
            <span className="slot-label">{rosterSize(template)} players</span>
            <span className="flex items-center gap-1.5">
              <PositionPatch position="G" count={template.G} />
              <PositionPatch position="F" count={template.F} />
              <PositionPatch position="C" count={template.C} />
            </span>
          </div>
        </div>

        {league.status === "setup" ? (
          <Bank
            label="Invite code"
            aside={
              slotsLeft > 0
                ? `${slotsLeft} of ${settings.max_members} free`
                : `full · ${settings.max_members}`
            }
          >
            {/* Ruled, not struck. The marker means one thing on this board —
                who is on the clock — so the code is written in it rather than
                sitting in its field. */}
            <div className="slot-filled border-b border-rule-strong px-3 py-5">
              <p
                data-testid="invite-code"
                className="text-3xl font-semibold uppercase tracking-[0.36em] text-live sm:text-4xl"
              >
                {league.invite_code}
              </p>
              <p className="mt-2 text-sm text-ink-soft">
                {slotsLeft > 0
                  ? "Read it out. Anyone with the code takes the next slot."
                  : "Every slot is taken."}
              </p>
            </div>
          </Bank>
        ) : null}

        <Bank
          label="Members"
          aside={`${members.length} of ${settings.max_members}`}
        >
          <Slots testId="member-list">
            {members.map((member) => (
              <Slot
                key={member.id}
                testId="member"
                landed={justArrived && member.isYou}
              >
                <CardName>{member.teamName || member.name}</CardName>
                <span className="flex flex-wrap items-baseline gap-x-3">
                  {member.teamName ? (
                    <span className="text-sm text-ink-soft">{member.name}</span>
                  ) : null}
                  <span className="slot-label">
                    {[
                      member.isCommissioner ? "commissioner" : null,
                      member.isYou ? "you" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </Slot>
            ))}
            {/* The free places are part of the board, not a blank area below
                it: a lobby that is half full should look half full. */}
            {Array.from({ length: Math.max(slotsLeft, 0) }, (_, index) => (
              <Slot key={`free-${index}`} state="waiting">
                <span className="slot-label text-ink-faint">
                  Slot {String(members.length + index + 1).padStart(2, "0")}
                </span>
              </Slot>
            ))}
          </Slots>
          {isCommissioner ? (
            <p className="text-sm text-ink-soft">
              You run this league. Team names, kicking and the draft roll arrive
              in the next slices.
            </p>
          ) : null}
        </Bank>

        {/* The board this lobby is filling, at its real width: one column per
            place in this league, thirteen rounds deep.

            Desktop only. On a phone it added a third to the scroll of the
            mobile-first surface to restate the slot run immediately above it —
            and this page already shows the board's shape in that run. The
            login page, which has no run to restate, keeps it at every size. */}
        <div className="hidden sm:block">
          <BoardPlan
            slots={settings.max_members}
            caption={`13 rounds × ${settings.max_members} slots`}
          />
        </div>
      </Sheet>
    </>
  );
}
