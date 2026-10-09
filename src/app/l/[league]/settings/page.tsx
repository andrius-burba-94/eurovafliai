import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { Bank, CardName, Slot, Slots } from "@/components/board";
import { PageHeader, TeamCrest } from "@/components/broadcast";
import { getSession } from "@/lib/auth/session";
import { getLeagueWithMembers } from "@/lib/leagues/queries";
import { navLeagueFrom } from "@/lib/nav/items";

import { DeleteLeague } from "../delete-league";
import { MemberControls } from "../member-controls";
import { WriteupSettingsBank } from "./writeup-settings";

/**
 * League settings — 7.1. The commissioner's page for a league in any
 * status: write-ups, who helps run it, and the way out. A plain member gets
 * the same not-found as a stranger.
 */
export default async function LeagueSettingsPage({ params }: PageProps<"/l/[league]/settings">) {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");

  const { league: leagueRef } = await params;
  const data = await getLeagueWithMembers(leagueRef);
  if (!data) notFound();
  const { league, settings, members, isCommissioner } = data;
  const canManage = isCommissioner || members.some((member) => member.isYou && member.canManage);
  if (!canManage) notFound();

  return (
    <AppShell current="settings" league={navLeagueFrom(data)} testId="league-settings">
      <PageHeader eyebrow={`${league.name} · Settings`} title="League settings" />

      <WriteupSettingsBank leagueId={league.id} settings={settings.ai} canEdit={isCommissioner} />

      <Bank label="Members" aside={`${members.length} teams`}>
        <Slots testId="settings-members">
          {members.map((member) => {
            const name = member.teamName || member.name;
            return (
              <Slot key={member.id} testId="settings-member" state="filled" className={member.isYou ? "" : "flex-col items-stretch"}>
                <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <span className="flex items-center gap-2.5">
                    <TeamCrest name={name} color={member.color} shape={member.crest} size={28} />
                    <CardName>{name}</CardName>
                  </span>
                  <span className="slot-label">
                    {[
                      member.isCommissioner ? "commissioner" : null,
                      !member.isCommissioner && member.canManage ? "helps run it" : null,
                      member.isYou ? "you" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                {member.isYou ? null : (
                  <MemberControls
                    leagueId={league.id}
                    member={member}
                    canDelegate={isCommissioner}
                    canRemove={league.status === "setup"}
                  />
                )}
              </Slot>
            );
          })}
        </Slots>
      </Bank>

      {isCommissioner ? (
        <DeleteLeague
          leagueId={league.id}
          leagueName={league.name}
          memberCount={members.length}
          hasDrafted={league.status !== "setup"}
        />
      ) : null}
    </AppShell>
  );
}
