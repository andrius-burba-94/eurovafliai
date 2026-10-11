/**
 * Matchnight's broadcast pieces (ADR-0011), beside the board vocabulary in
 * `board.tsx`: the page header, a scoreboard figure, status badges that always
 * carry a word, the round stepper and the team crest.
 */
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { GameState } from "@/lib/live/status";

import {
  TEAM_INK,
  crestMonogram,
  type CrestShape,
  type TeamColor,
} from "@/lib/teams/identity";

/**
 * The top of a page: a small context line, the display headline, one line of
 * standfirst and at most one action. Everything a page leads with that is not
 * its hero lives here, so the hero can come straight after.
 */
export function PageHeader({
  eyebrow,
  title,
  lead,
  action,
  testId,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  action?: ReactNode;
  testId?: string;
}) {
  return (
    <header data-testid={testId} className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        {eyebrow ? <p className="slot-label text-live">{eyebrow}</p> : null}
        <h1 className="display min-w-0 text-4xl break-words sm:text-5xl">{title}</h1>
        {lead ? <p className="max-w-[62ch] text-sm text-ink-soft sm:text-base">{lead}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

/** A score set on the scoreboard: condensed, lining, tight. */
export function ScoreFigure({
  children,
  size = "lg",
  className = "",
  testId,
}: {
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  testId?: string;
}) {
  const sizes = {
    sm: "text-2xl",
    md: "text-4xl",
    lg: "text-6xl",
    xl: "text-7xl sm:text-8xl",
  };
  return (
    <span data-testid={testId} className={`display-figure ${sizes[size]} ${className}`}>
      {children}
    </span>
  );
}

export type BadgeKind = "out" | "doubtful" | "live" | "final" | "provisional" | "scheduled" | "left";

const BADGE: Record<BadgeKind, string> = {
  out: "bg-loss/15 text-loss",
  doubtful: "bg-gold/15 text-gold",
  live: "bg-on-air text-on-air-ink",
  final: "bg-stock-high text-ink-soft",
  provisional: "border border-dashed border-rule-strong text-ink-soft",
  scheduled: "bg-stock-high text-ink-soft",
  left: "bg-stock-high text-ink-faint",
};

/** A state with its word printed on it. Colour is never the carrier alone. */
export function StatusBadge({
  kind,
  children,
  testId,
}: {
  kind: BadgeKind;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <span
      data-testid={testId}
      data-badge={kind}
      className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[0.6875rem] leading-4 font-extrabold tracking-[0.06em] uppercase ${BADGE[kind]}`}
    >
      {kind === "live" ? <span aria-hidden="true" className="on-air-dot" /> : null}
      {children}
    </span>
  );
}

/** A game's state as its badge, the same words on Live, the panel and a profile. */
export const GAME_BADGE: Record<GameState, { kind: BadgeKind; word: string }> = {
  final: { kind: "final", word: "Final" },
  fulltime: { kind: "provisional", word: "Full time" },
  live: { kind: "live", word: "Live" },
  stale: { kind: "doubtful", word: "Feed stale" },
  scheduled: { kind: "scheduled", word: "Scheduled" },
};

/** A player's availability, as the badge the pool and the court both show. */
export function availabilityBadge(status: string | undefined): { kind: BadgeKind; word: string } | null {
  if (status === "injured") return { kind: "out", word: "Out" };
  if (status === "doubtful") return { kind: "doubtful", word: "Doubtful" };
  if (status === "left") return { kind: "left", word: "Left" };
  return null;
}

/**
 * "‹ Round 4 ›" — a round is stepped through, never typed. Links, so it works
 * before JavaScript and keeps every other query parameter.
 */
export function RoundStepper({
  round,
  min = 1,
  max,
  hrefFor,
  label = "Round",
  testId = "round-stepper",
}: {
  round: number;
  min?: number;
  max: number;
  hrefFor: (round: number) => string;
  label?: string;
  testId?: string;
}) {
  const step =
    "grid size-11 place-items-center text-lg text-ink transition-colors hover:bg-stock-high focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-live";
  const off = "grid size-11 place-items-center text-lg text-ink-faint/50";
  return (
    <nav
      aria-label={`${label} picker`}
      data-testid={testId}
      className="inline-flex items-center overflow-hidden rounded-full border border-rule-strong"
    >
      {round > min ? (
        <Link href={hrefFor(round - 1)} className={step} aria-label={`${label} ${round - 1}`} data-testid={`${testId}-previous`}>
          &lsaquo;
        </Link>
      ) : (
        <span className={off} aria-hidden="true">
          &lsaquo;
        </span>
      )}
      <span className="px-2 text-sm font-bold whitespace-nowrap" aria-current="page">
        {label} {round}
      </span>
      {round < max ? (
        <Link href={hrefFor(round + 1)} className={step} aria-label={`${label} ${round + 1}`} data-testid={`${testId}-next`}>
          &rsaquo;
        </Link>
      ) : (
        <span className={off} aria-hidden="true">
          &rsaquo;
        </span>
      )}
    </nav>
  );
}

/**
 * A member's crest: their monogram on their colour, in their shape. Always
 * rendered beside the team's name, so it is decoration for assistive tech.
 */
export function TeamCrest({
  name,
  color,
  shape,
  monogram,
  size = 32,
  className = "",
}: {
  name: string;
  color: TeamColor;
  shape: CrestShape;
  monogram?: string;
  size?: number;
  className?: string;
}) {
  const style = {
    "--crest": `var(--color-team-${color})`,
    "--crest-ink": `var(--color-team-ink-${TEAM_INK[color]})`,
    "--crest-size": `${size}px`,
  } as CSSProperties;
  return (
    <span aria-hidden="true" data-shape={shape} data-color={color} className={`team-crest ${className}`} style={style}>
      {monogram ?? crestMonogram(name)}
    </span>
  );
}

/** Free agency where a trading partner's crest would stand: no colour, no team, just FA. */
export function PoolCrest({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-testid="pool-crest"
      className={`inline-grid shrink-0 place-items-center rounded-block border-[1.5px] border-dashed border-rule-strong font-display font-extrabold leading-none text-ink-soft ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      FA
    </span>
  );
}

/** The member's colour as a field behind a hero strip or a band. */
export function teamFieldStyle(color: TeamColor): CSSProperties {
  return { "--team": `var(--color-team-${color})` } as CSSProperties;
}

/**
 * Where an import stands: Paste, Review, Apply. The step is derived from the
 * form's own state — a plan on screen is Review, a stored result is done — so
 * it can never claim a step the page is not showing.
 */
export function ImportSteps({ current, done = false }: { current: 0 | 1 | 2; done?: boolean }) {
  const steps = ["Paste", "Review", "Apply"];
  return (
    <ol data-testid="import-steps" className="flex items-center gap-2 text-sm">
      {steps.map((step, index) => {
        const complete = done || index < current;
        const here = !done && index === current;
        return (
          <li key={step} aria-current={here ? "step" : undefined} className="flex items-center gap-2">
            {index > 0 ? <span aria-hidden="true" className="h-px w-5 bg-rule-strong sm:w-8" /> : null}
            <span
              className={`flex size-7 items-center justify-center rounded-full border text-xs font-bold ${
                here
                  ? "border-live bg-live text-live-ink"
                  : complete
                    ? "border-live text-live"
                    : "border-rule-strong text-ink-faint"
              }`}
            >
              {complete ? <span aria-hidden="true">&#10003;</span> : index + 1}
            </span>
            <span className={here ? "font-semibold text-ink" : complete ? "text-ink-soft" : "text-ink-faint"}>
              {step}
              {complete ? <span className="sr-only"> (done)</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
