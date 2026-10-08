import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/broadcast";
import { getSession } from "@/lib/auth/session";
import {
  readLastRosterChange,
  readLatestCheck,
  readUnmatchedCodes,
  readUnmatchedNews,
} from "@/lib/mapping/queries";
import { displayName } from "@/lib/players/name";
import { canManageRosters } from "@/lib/rosters/actions";

import { MappingSurface } from "./mapping-surface";

/**
 * Player mapping — slice 4.2.
 *
 * Identity questions, asked from three directions: the feed has re-registered
 * a stored player under a different name, a box score names a person code the
 * pool has never heard of, or a publisher names a player the pool cannot
 * resolve (9.4). Each is "are these two records one person", and none is
 * answered without a person.
 *
 * Since 8 October 2026 the worker syncs rosters by itself, so a new signing
 * usually answers his own codes and news before anybody opens this page; what
 * is left here is what a sync could not decide.
 *
 * The rename half opens with **the last check**, not a fresh one: asking the
 * feed is 21 requests, so it happens when somebody presses the button, and the
 * answer is stored as a report-only `roster_imports` batch. Every confirm
 * re-validates against live player rows.
 */
export default async function MappingPage({
  searchParams,
}: PageProps<"/players/mapping">) {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");
  if (!(await canManageRosters())) notFound();

  // `?check=<batch id>` opens one particular stored check rather than the
  // newest: a check is an audit record, and "the newest" is app-global, which
  // tests cannot work around.
  const { check } = await searchParams;
  const [unmatched, lastCheck, news, lastChange] = await Promise.all([
    readUnmatchedCodes(),
    readLatestCheck(typeof check === "string" ? check : undefined),
    readUnmatchedNews(),
    readLastRosterChange(),
  ]);

  const added = lastChange?.added ?? [];
  const lead = lastChange
    ? `Rosters sync from the official feed every six hours and when a new name appears. Last change ${lastChange.at.slice(0, 10)}${
        added.length ? `: ${added.slice(0, 3).map(displayName).join(", ")}${added.length > 3 ? ` and ${added.length - 3} more` : ""} added.` : "."
      }`
    : "Rosters sync from the official feed every six hours and when a new name appears.";

  return (
    <AppShell current="mapping" measure="wide" testId="player-mapping">
      <PageHeader title="Player mapping" lead={lead} testId="mapping-header" />
      <MappingSurface unmatched={unmatched} lastCheck={lastCheck} news={news} />
    </AppShell>
  );
}
