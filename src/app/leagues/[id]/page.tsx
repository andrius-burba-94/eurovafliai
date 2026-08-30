import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { getLeagueWithMembers } from "@/lib/leagues/queries";
import { rosterSize } from "@/lib/leagues/settings";

/**
 * The lobby: who is in, and the code that lets the rest in.
 *
 * The live member list arrives in the next slice (1.3b) via a PocketBase SSE
 * subscription. Today it renders server-side, so a friend joining shows up on
 * the next load rather than instantly.
 */
export default async function LobbyPage({ params }: PageProps<"/leagues/[id]">) {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");

  const { id } = await params;
  const data = await getLeagueWithMembers(id);

  // Not found and not-yours are the same answer on purpose: telling them apart
  // would let anyone probe which leagues exist.
  if (!data) notFound();

  // The repair for createLeague's lost second write happens inside the query,
  // before it reads the members — see the comment there for why the order
  // matters.
  const { league, settings, members, isCommissioner } = data;
  const slotsLeft = settings.max_members - members.length;

  return (
    <main
      data-testid="lobby"
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-10 px-6 py-16"
    >
      <header className="flex flex-col gap-2">
        <Link
          href="/"
          className="self-start font-mono text-xs uppercase tracking-[0.2em] opacity-60 hover:opacity-100"
        >
          &larr; Your leagues
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">{league.name}</h1>
        <p className="font-mono text-xs uppercase tracking-wider opacity-60">
          {league.season} &middot; {league.status} &middot;{" "}
          {rosterSize(settings.roster_template)} players &middot;{" "}
          {settings.roster_template.G}G / {settings.roster_template.F}F /{" "}
          {settings.roster_template.C}C
        </p>
      </header>

      {league.status === "setup" ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-medium uppercase tracking-[0.2em] opacity-60">
            Invite code
          </h2>
          <p
            data-testid="invite-code"
            className="font-mono text-2xl tracking-[0.3em]"
          >
            {league.invite_code}
          </p>
          <p className="text-sm opacity-70">
            {slotsLeft > 0
              ? `Read it out. ${slotsLeft} ${slotsLeft === 1 ? "place" : "places"} left of ${settings.max_members}.`
              : `Full — ${settings.max_members} of ${settings.max_members}.`}
          </p>
        </section>
      ) : null}

      <section className="flex flex-col gap-4">
        <h2 className="text-xs font-medium uppercase tracking-[0.2em] opacity-60">
          Members ({members.length})
        </h2>
        <ul data-testid="member-list" className="flex flex-col">
          {members.map((member) => (
            <li
              key={member.id}
              data-testid="member"
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-current/15 py-3"
            >
              <span className="font-medium">
                {member.teamName || member.name}
                {member.teamName ? (
                  <span className="ml-2 text-sm font-normal opacity-60">
                    {member.name}
                  </span>
                ) : null}
              </span>
              <span className="font-mono text-xs uppercase tracking-wider opacity-60">
                {[
                  member.isCommissioner ? "commissioner" : null,
                  member.isYou ? "you" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </li>
          ))}
        </ul>
        {isCommissioner ? (
          <p className="text-sm opacity-60">
            You run this league. Team names, kicking and the draft roll arrive in
            the next slices.
          </p>
        ) : null}
      </section>
    </main>
  );
}
