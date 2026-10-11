import Link from "next/link";
import type { ReactNode } from "react";

import { Bank } from "@/components/board";
import type { NightVerdict } from "@/lib/ai/brief-facts";
import type { RoundWriteupRead } from "@/lib/ai/queries";
import type { Segment } from "@/lib/ai/tokens";
import type { BriefView } from "@/lib/ai/view";
import type { SectionKey } from "@/lib/ai/voice";
import { playerHref, type LeaguePaths, type Ref } from "@/lib/nav/urls";

/**
 * The round, written — slice 7.1, option C of #186 ("margin notes", as the
 * maintainer revised it). The summary panel holds everything that has no
 * panel of its own: the headline, the lines, and the over, under and
 * surprises sections. The table, stars and swing sections sit as notes on
 * the panels they explain. Prose only: every number in it was checked
 * against the round's figures before it was stored (ADR-0012).
 */

export type WriteupLinks = {
  readonly paths: LeaguePaths;
  readonly league: Ref;
  readonly players: Readonly<Record<string, Ref>>;
};

const linkStyle =
  "underline decoration-ink/40 decoration-1 underline-offset-[3px] transition-colors hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live";

function Prose({ segments, links }: { segments: readonly Segment[]; links: WriteupLinks }) {
  return segments.map((segment, index) =>
    segment.type === "member" ? (
      <Link key={index} href={links.paths.teams[segment.id] ?? links.paths.base} className={`font-semibold ${linkStyle}`}>
        {segment.text}
      </Link>
    ) : segment.type === "player" ? (
      <Link key={index} href={playerHref(links.players[segment.id] ?? segment.id, links.league)} className={linkStyle}>
        {segment.text}
      </Link>
    ) : (
      <span key={index}>{segment.text}</span>
    ),
  );
}

const PANEL_SECTIONS: readonly { key: SectionKey; label: string }[] = [
  { key: "over", label: "Overperformers" },
  { key: "under", label: "Underperformers" },
  { key: "surprises", label: "Surprises" },
];

/**
 * The summary panel, above The night. With no prose to show it renders only
 * for a manager, and then only the strip: a member's Recap is unchanged.
 */
export function WriteupSummary({
  read,
  links,
  strip,
}: {
  read: RoundWriteupRead;
  links: WriteupLinks;
  /** The manager strip, or null for a member. */
  strip: ReactNode;
}) {
  const view = read.view;
  if (!view) {
    return strip ? (
      <Bank framed label="Round write-up" testId="recap-writeup">
        {strip}
      </Bank>
    ) : null;
  }
  // The written headline is the panel's heading, so the Bank carries it.
  return (
    <Bank framed label={view.headline} testId="recap-writeup">
      <ol role="list" className="flex max-w-[68ch] flex-col gap-2 leading-relaxed" data-testid="recap-writeup-lines">
        {view.lines.map((line, index) => (
          <li key={index}>
            <Prose segments={line} links={links} />
          </li>
        ))}
      </ol>
      {PANEL_SECTIONS.filter(({ key }) => view.sections[key]).map(({ key, label }) => (
        <div key={key} className="flex max-w-[68ch] flex-col gap-1" data-testid={`recap-writeup-${key}`}>
          <h3 className="display text-lg text-ink">{label}</h3>
          <p className="leading-relaxed">
            <Prose segments={view.sections[key]!} links={links} />
          </p>
        </div>
      ))}
      {strip}
    </Bank>
  );
}

/** The analyst's line on another panel: a dashed rule, a mark, a sentence. */
export function WriteupNote({
  read,
  section,
  links,
}: {
  read: RoundWriteupRead | null;
  section: SectionKey;
  links: WriteupLinks;
}) {
  const segments = read?.view?.sections[section];
  if (!segments) return null;
  return (
    <div
      data-testid={`recap-note-${section}`}
      className="flex items-start gap-2.5 border-t border-dashed border-rule pt-3 text-[0.9375rem] leading-relaxed"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="mt-1 size-4 shrink-0 text-live"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 12.5V4.5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H6L3 12.5Z" />
      </svg>
      <p className="min-w-0">
        <span className="sr-only">The analyst: </span>
        <Prose segments={segments} links={links} />
      </p>
    </div>
  );
}

const VERDICT_TAG: Record<NightVerdict, string> = {
  won: "border-gain/60 text-gain",
  held: "border-rule-strong text-ink",
  lost: "border-loss/60 text-loss",
};

const BRIEF_ROWS: readonly { key: keyof BriefView; label: string }[] = [
  { key: "result", label: "Night" },
  { key: "standing", label: "Table" },
  { key: "next", label: "Next" },
];

/**
 * Your round — slice 7.3 D, option A of #203 as the maintainer revised it:
 * the viewer's own brief, first in the reading column. The tag is the place
 * on the night by thirds, worked out from Recap's ladder, and always says
 * the word; the three lines are the model's, checked before they were stored.
 */
export function YourRound({
  view,
  verdict,
  round,
  links,
}: {
  view: BriefView;
  verdict: NightVerdict;
  round: number;
  links: WriteupLinks;
}) {
  return (
    <Bank
      framed
      label="Your round"
      testId="recap-brief"
      aside={
        <span className="flex items-center gap-2">
          <span
            data-testid="recap-brief-verdict"
            data-verdict={verdict}
            className={`rounded-md border px-1.5 py-0.5 text-[0.6875rem] leading-4 font-extrabold tracking-[0.06em] uppercase ${VERDICT_TAG[verdict]}`}
          >
            {verdict}
          </span>
          Round {round}
        </span>
      }
    >
      <dl className="grid max-w-[68ch] grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 sm:gap-x-6">
        {BRIEF_ROWS.map(({ key, label }) => (
          <div key={key} className="contents" data-testid={`recap-brief-${key}`}>
            <dt className="slot-label pt-[0.2em] text-ink-soft">{label}</dt>
            <dd className="min-w-0 leading-relaxed break-words">
              <Prose segments={view[key]} links={links} />
            </dd>
          </div>
        ))}
      </dl>
    </Bank>
  );
}
