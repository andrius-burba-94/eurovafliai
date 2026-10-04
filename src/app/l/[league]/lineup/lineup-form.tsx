"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import {
  Bank,
  Correction,
  FixtureNote,
  PositionPatch,
} from "@/components/board";
import { StatusBadge } from "@/components/broadcast";
import { SubmitButton } from "@/components/submit-button";
import { PlayerComparison } from "@/components/player-comparison";
import { PlayerStatsModal } from "@/components/player-stats-link";
import { ClubCrest, PlayerPortrait } from "@/components/official-media";
import { recordLineup, type LineupResult } from "@/lib/lineups/actions";
import { arrangeFormation } from "@/lib/lineups/formation";
import {
  assignmentsWithCaptain,
  FORMATIONS,
  formationName,
  type LineupRole,
  type LineupSource,
  type LineupTemplate,
  type PlacementRole,
  PLACEMENT_ROLES,
  ROLE_MULTIPLIERS,
  ROLE_WORDS,
  slotsFromRoles,
  validateLineup,
} from "@/lib/lineups/lineup";
import type { LineupPlayer } from "@/lib/lineups/queries";
import { optimizeLineup, type Optimization } from "@/lib/lineups/optimize";
import { roundPointsOf, type PlayerRound, type RoundPoints } from "@/lib/live/status";
import type { Position } from "@/lib/engine";
import { displayName, surname } from "@/lib/players/name";
import type { ComparisonPlayer } from "@/lib/stats/comparison-queries";

import { LineupCourt } from "./lineup-court";
import { useDragToPlace, type DragState, type DropTarget } from "./lineup-drag";
import { usePlayerHref } from "@/components/league-links";

/**
 * Thirteen players, one role each — slice 9.3. The court draws the five and
 * the sixth man, bench and inactive stand beside it as cards, so a whole lineup
 * fits on one screen the way the official game's does. A player moves by drag;
 * a tap opens their profile, which holds the captain button. The grid view is
 * the same lineup as a table with a role select and a captain radio per row,
 * and is the path for a keyboard or a hand that cannot drag.
 *
 * What the form posts is a hidden `role:<id>` per player and one `captain`,
 * written from state, so the court and the grid are two views of one lineup
 * rather than two sets of fields that could disagree.
 *
 * The same pure validator the action runs is run here on every change, so the
 * refusal a wrong formation earns is visible before the round trip rather than
 * after it. The server still decides: this is the mirror, not the authority.
 */

const START: LineupResult = { error: null, saved: false };

/**
 * The tiers beside the court, top to bottom. "Not placed" leads, because it is
 * what is left to do, and is drawn only while someone is in it. Cards take as
 * many columns as keep a name and a matchup whole; inactive players score
 * nothing, so they are listed one to a line, below the cards that count.
 */
const TIERS: readonly { role: Exclude<PlacementRole, "starter"> | ""; label: string; layout: "cards" | "rows" }[] = [
  { role: "", label: "Not placed", layout: "cards" },
  { role: "sixth", label: "Sixth man", layout: "cards" },
  { role: "bench", label: "Bench", layout: "cards" },
  { role: "inactive", label: "Inactive", layout: "rows" },
];

const TEMPLATE_KEY: Readonly<Record<PlacementRole, keyof LineupTemplate>> = {
  starter: "starters",
  sixth: "sixth",
  bench: "bench",
  inactive: "inactive",
};

const POSITION_ORDER: Readonly<Record<Position, number>> = { G: 0, F: 1, C: 2 };

/** "×2", "×0.5" — the multiplier, said once, beside the role that carries it. */
function multiplierWord(role: LineupRole): string {
  return `×${ROLE_MULTIPLIERS[role]}`;
}

function isPlace(value: string): value is PlacementRole | "" {
  return value === "" || (PLACEMENT_ROLES as readonly string[]).includes(value);
}

export function LineupForm({
  leagueId,
  memberId,
  teamName,
  season,
  round,
  players,
  comparison,
  live,
  source,
  official,
  carriedFrom,
  template,
  sourceOwned = false,
}: {
  leagueId: string;
  memberId: string;
  teamName: string;
  season: string;
  round: number;
  players: readonly LineupPlayer[];
  comparison: readonly ComparisonPlayer[];
  /** Each player's round once it has tipped off; null before, so the board stays a plan. */
  live: Readonly<Record<string, PlayerRound>> | null;
  source: LineupSource;
  official: boolean;
  carriedFrom: number | null;
  template: LineupTemplate;
  sourceOwned?: boolean;
}) {
  const playerHref = usePlayerHref();
  const [result, action] = useActionState(recordLineup, START);

  // The stored lineup arrives with the captain as a role, because that is the
  // shape the validator and the standings share. The form splits it back into a
  // place plus a mark on the way in, and `assignmentsWithCaptain` puts it back
  // together on the way out.
  const [places, setPlaces] = useState<Record<string, PlacementRole | "">>(() =>
    Object.fromEntries(
      players.map((player) => [
        player.id,
        player.role === "captain" ? "starter" : (player.role ?? ""),
      ]),
    ),
  );
  const [captainId, setCaptainId] = useState<string>(
    () => players.find((player) => player.role === "captain")?.id ?? "",
  );
  const [view, setView] = useState<"court" | "grid">("court");
  const [compareOpen, setCompareOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState<Optimization | null>(null);
  const draftKey = `eurovafliai:lineup:${leagueId}:${memberId}:${season}:${round}`;
  const originalPlaces = useMemo<Record<string, PlacementRole | "">>(() => Object.fromEntries(players.map((player) => [player.id, player.role === "captain" ? "starter" : (player.role ?? "")])), [players]);
  const originalCaptain = players.find((player) => player.role === "captain")?.id ?? "";

  // The stored lineup can change under an open page: the official game lets a
  // manager move a starter or the captain between a round's game days, and the
  // sync writes it. With nothing unsaved here, the form follows the new lineup.
  const stored = players.map((player) => `${player.id}=${player.role ?? ""}`).join(",");
  const [shown, setShown] = useState(stored);
  if (stored !== shown && !dirty) {
    setShown(stored);
    setPlaces(originalPlaces);
    setCaptainId(originalCaptain);
  }

  useEffect(() => {
    if (sourceOwned) return;
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      const draft = parsed as { places?: Record<string, unknown>; captainId?: unknown };
      if (!draft.places || typeof draft.captainId !== "string") return;
      const ids = new Set(players.map((player) => player.id));
      if (Object.keys(draft.places).some((id) => !ids.has(id))) return;
      if (Object.values(draft.places).some((role) => role !== "" && !PLACEMENT_ROLES.includes(role as PlacementRole))) return;
      if (draft.captainId && draft.places[draft.captainId] !== "starter") return;
      queueMicrotask(() => {
        setPlaces(draft.places as Record<string, PlacementRole | "">);
        setCaptainId(draft.captainId as string);
        setDirty(true);
      });
    } catch {
      // An unavailable or malformed browser store must not block recording.
    }
  }, [draftKey, players, sourceOwned]);

  useEffect(() => {
    if (sourceOwned) return;
    try {
      if (dirty) window.localStorage.setItem(draftKey, JSON.stringify({ places, captainId }));
    } catch {
      // The server action remains available when storage is disabled.
    }
  }, [draftKey, places, captainId, dirty, sourceOwned]);

  useEffect(() => {
    if (!result.saved) return;
    try { window.localStorage.removeItem(draftKey); } catch { /* Storage is optional. */ }
    queueMicrotask(() => setDirty(false));
  }, [draftKey, result.saved]);

  /**
   * Marking a captain also *places* them, because the captaincy is only ever a
   * mark on a starter: a control that could name a captain the validator would
   * then refuse is a control that exists to produce an error message.
   */
  function markCaptain(playerId: string): void {
    if (sourceOwned) return;
    setCaptainId(playerId);
    setPlaces((current) => ({ ...current, [playerId]: "starter" }));
    setDirty(true);
  }

  /** Moving the captain off the five gives up the armband with the place. */
  function place(playerId: string, role: PlacementRole | ""): void {
    if (sourceOwned) return;
    setPlaces((current) => ({ ...current, [playerId]: role }));
    if (role !== "starter" && captainId === playerId) setCaptainId("");
    setDirty(true);
  }

  const assignments = useMemo(
    () =>
      assignmentsWithCaptain(
        players.flatMap((player) => {
          const role = places[player.id];
          return role ? [{ playerId: player.id, role }] : [];
        }),
        captainId,
      ),
    [players, places, captainId],
  );

  const verdict = useMemo(
    () =>
      validateLineup({
        slots: slotsFromRoles(assignments),
        template,
        squad: players.map((player) => ({
          playerId: player.id,
          position: player.position,
        })),
      }),
    [assignments, players, template],
  );

  const counts = useMemo(() => {
    const out: Record<LineupRole, number> = {
      captain: 0,
      starter: 0,
      sixth: 0,
      bench: 0,
      inactive: 0,
    };
    for (const entry of assignments) out[entry.role] += 1;
    return out;
  }, [assignments]);

  const five = useMemo(() => {
    const starting = assignments.filter(
      (entry) => entry.role === "captain" || entry.role === "starter",
    );
    const byId = new Map(players.map((player) => [player.id, player.position]));
    const shape: [number, number, number] = [0, 0, 0];
    for (const entry of starting) {
      const position = byId.get(entry.playerId);
      if (position === "G") shape[0] += 1;
      else if (position === "F") shape[1] += 1;
      else if (position === "C") shape[2] += 1;
    }
    return shape;
  }, [assignments, players]);

  function chooseFormation(shape: readonly [number, number, number]): void {
    if (sourceOwned) return;
    const arranged = arrangeFormation(players.map((player) => ({ id: player.id, position: player.position, place: places[player.id] ?? "" })), shape, template, captainId);
    if (!arranged) return;
    setPlaces({ ...arranged.places });
    setCaptainId(arranged.captainId);
    setDirty(true);
  }

  const placed = assignments.length;

  function showOptimization(): void {
    setPreview(optimizeLineup(players.map((player) => ({
      id: player.id,
      position: player.position,
      estimateTenths: player.estimateTenths,
      currentRole: assignments.find((entry) => entry.playerId === player.id)?.role ?? null,
    })), template));
  }

  function applyOptimization(): void {
    if (sourceOwned) return;
    if (!preview) return;
    setPlaces(Object.fromEntries(players.map((player) => {
      const role = preview.roles[player.id];
      return [player.id, role === "captain" ? "starter" : (role ?? "")];
    })) as Record<string, PlacementRole | "">);
    setCaptainId(Object.entries(preview.roles).find(([, role]) => role === "captain")?.[0] ?? "");
    setPreview(null);
    setDirty(true);
  }

  function resetDraft(): void {
    setPlaces(originalPlaces);
    setCaptainId(originalCaptain);
    setPreview(null);
    setDirty(false);
    try { window.localStorage.removeItem(draftKey); } catch { /* Storage is optional. */ }
  }

  // A drop moves through `place`, the same function the grid's select calls, so
  // the validator above sees one kind of change.
  const [profileId, setProfileId] = useState<string | null>(null);
  const profilePlayer = players.find((player) => player.id === profileId) ?? null;
  const opener = useRef<HTMLElement | null>(null);
  const [lastMove, setLastMove] = useState("");
  const nameOf = (id: string) => displayName(players.find((player) => player.id === id)?.name ?? "");

  /**
   * Two players in different places trade them. The usual edit of a round is
   * "he starts, he sits"; without a swap that took four taps and passed through
   * a six-man five the validator refused. Returns false when there was nothing
   * to trade, because both already stand in the same place.
   */
  function swap(held: string, other: string): boolean {
    const from = places[held] ?? "";
    const to = places[other] ?? "";
    if (from === to) return false;
    place(held, to);
    place(other, from);
    setLastMove(`${nameOf(held)} to ${PLACE_WORDS[to]}, ${nameOf(other)} to ${PLACE_WORDS[from]}.`);
    return true;
  }

  function openProfile(playerId: string, from: HTMLElement): void {
    opener.current = from;
    setProfileId(playerId);
  }

  function closeProfile(): void {
    setProfileId(null);
    opener.current?.focus();
  }

  function dropOn(playerId: string, target: DropTarget): void {
    if (sourceOwned) return;
    setLastMove("");
    if (target.kind === "player") {
      swap(playerId, target.id);
      return;
    }
    if (!isPlace(target.role) || (places[playerId] ?? "") === target.role) return;
    place(playerId, target.role);
    setLastMove(`${nameOf(playerId)} to ${PLACE_WORDS[target.role]}.`);
  }

  const { dragging, over, handle, ghostRef } = useDragToPlace(dropOn);
  const drag: DragState = { dragging, over, handle };
  const draggedPlayer = players.find((player) => player.id === dragging) ?? null;

  const groups = useMemo(() => {
    const out: Record<PlacementRole | "", LineupPlayer[]> = {
      starter: [],
      sixth: [],
      bench: [],
      inactive: [],
      "": [],
    };
    for (const player of players) out[places[player.id] ?? ""].push(player);
    out.starter.sort(
      (a, b) => POSITION_ORDER[a.position] - POSITION_ORDER[b.position],
    );
    return out;
  }, [players, places]);

  /** Counted at the place the player stands in now, so a move shows what it is worth. */
  function pointsOf(playerId: string): RoundPoints | undefined {
    if (!live) return undefined;
    const role: LineupRole | "" = captainId === playerId ? "captain" : (places[playerId] ?? "");
    return roundPointsOf(live[playerId], role ? ROLE_MULTIPLIERS[role] : 1);
  }

  function card(player: LineupPlayer, layout: "cards" | "rows") {
    const key = `player:${player.id}`;
    const points = pointsOf(player.id);
    const matchup = player.fixture ? `${player.clubCode} ${player.fixture.atHome ? "vs" : "at"} ${player.fixture.nextOpponent}` : player.clubCode;
    return (
      <li key={player.id} className="min-w-0">
        <button
          type="button"
          data-testid="lineup-card"
          data-position={player.position}
          data-drop={key}
          data-over={drag.over === key || undefined}
          data-dragging={drag.dragging === player.id || undefined}
          aria-haspopup="dialog"
          aria-label={points ? `${displayName(player.name)}, ${points.spoken}` : displayName(player.name)}
          title={displayName(player.name)}
          onClick={(event) => openProfile(player.id, event.currentTarget)}
          {...drag.handle(player.id)}
          data-layout={layout}
          className="lineup-card lineup-drag"
        >
          <PlayerPortrait personCode={player.personCode} name={player.name} />
          {layout === "rows" ? (
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="min-w-0 truncate text-sm font-semibold">{surname(player.name)}</span>
              <span className="lineup-card-position" aria-hidden="true">{player.position}</span>
              <span className="min-w-0 truncate text-xs text-ink-soft">{matchup}</span>
            </span>
          ) : (
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm leading-tight font-semibold">{surname(player.name)}</span>
              <span className="flex min-w-0 items-center gap-1 text-xs text-ink-soft">
                <span className="lineup-card-position" aria-hidden="true">{player.position}</span>
                <span className="truncate">{matchup}</span>
              </span>
            </span>
          )}
          {points ? (
            <CardPoints points={points} stacked={layout === "cards"} />
          ) : player.estimateTenths !== null ? (
            <span className="stat shrink-0 text-xs text-ink-soft">~{(player.estimateTenths / 10).toFixed(1)}</span>
          ) : null}
        </button>
      </li>
    );
  }

  function renderTier(tier: (typeof TIERS)[number]) {
    const members = groups[tier.role];
    const capacity = tier.role === "" ? 0 : template[TEMPLATE_KEY[tier.role]];
    if (tier.role === "" && members.length === 0) return null;
    const dropKey = `role:${tier.role}`;
    const incoming = drag.dragging !== null && (places[drag.dragging] ?? "") !== tier.role;
    return (
      <section
        key={tier.role || "none"}
        aria-labelledby={`tier-${tier.role || "none"}`}
        data-testid={`lineup-tier-${tier.role || "none"}`}
        data-drop={dropKey}
        data-over={drag.over === dropKey || undefined}
        className="lineup-tier flex min-w-0 flex-col gap-1.5"
      >
        <h2 id={`tier-${tier.role || "none"}`} className="slot-label flex items-baseline justify-between gap-2">
          <span>
            {tier.label}
            {tier.role !== "" ? ` ${multiplierWord(tier.role)}` : ""}
          </span>
          <span className="tabular-nums">{capacity > 0 ? `${members.length}/${capacity}` : members.length}</span>
        </h2>
        <ul role="list" aria-label={tier.label} data-layout={tier.layout} className="lineup-tier-list">
          {members.map((player) => card(player, tier.layout))}
          {Array.from({ length: Math.max(0, capacity - members.length) }, (_, index) => (
            <li key={`open-${index}`} className="min-w-0">
              <span data-testid="lineup-open" data-incoming={incoming || undefined} className="lineup-card-open">
                {incoming ? "Drop here" : "Open"}
              </span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const openShape = (() => {
    const shape = FORMATIONS.find((candidate) => candidate.every((count, index) => count >= five[index]!)) ?? FORMATIONS[0]!;
    return { G: Math.max(0, shape[0] - five[0]), F: Math.max(0, shape[1] - five[1]), C: Math.max(0, shape[2] - five[2]) };
  })();

  const tool = "inline-flex min-h-11 items-center px-1 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live";

  return (
    <form action={sourceOwned ? undefined : action} className="flex flex-col gap-4">
      {sourceOwned ? <p className="text-sm text-ink-soft">BasketNews owns this lineup. Changes appear after the next sync.</p> : null}
      <input type="hidden" name="leagueId" value={leagueId} />
      <input type="hidden" name="memberId" value={memberId} />
      <input type="hidden" name="season" value={season} />
      <input type="hidden" name="round" value={String(round)} />
      {players.map((player) => (
        <input key={player.id} type="hidden" name={`role:${player.id}`} value={places[player.id] ?? ""} />
      ))}
      <input type="hidden" name="captain" value={captainId} />

      <section aria-label="The lineup" data-testid="lineup-board" className="@container flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div role="group" aria-label="Formation, guards forwards centers" className="flex flex-wrap gap-1">
            {FORMATIONS.map((shape) => {
              const name = formationName(shape);
              const on = formationName(five) === name;
              return (
                <button
                  key={name}
                  type="button"
                  aria-pressed={on}
                  onClick={() => chooseFormation(shape)}
                  className={`min-h-11 rounded-full border px-3 text-sm font-bold tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live ${
                    on ? "border-ink bg-ink text-stock" : "border-rule text-ink-soft hover:border-ink-soft hover:text-ink"
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-x-3">
            <button type="button" onClick={showOptimization} className={`${tool} text-live hover:underline`}>Auto-Optimize preview</button>
            <button type="button" onClick={() => setCompareOpen(true)} className={`${tool} text-live hover:underline`}>Compare players</button>
            <button type="button" onClick={resetDraft} className={`${tool} font-normal text-ink-soft hover:text-ink`}>Reset changes</button>
            <div role="group" aria-label="Lineup view" className="flex rounded-full border border-rule p-0.5">
              {(["court", "grid"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={view === option}
                  onClick={() => setView(option)}
                  className={`min-h-10 rounded-full px-4 text-sm font-semibold capitalize ${view === option ? "bg-stock-high text-ink" : "text-ink-soft hover:text-ink"}`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>

        {source === "carried" && carriedFrom !== null ? (
          <p className="rounded-lg bg-gold/10 px-3 py-1.5 text-sm text-ink" data-testid="lineup-carried">
            This round carries round {carriedFrom}&apos;s lineup and scores at it. Save it to make it round {round}&apos;s own.
          </p>
        ) : null}
        {source === "absent" ? (
          <p className="rounded-lg bg-gold/10 px-3 py-1.5 text-sm text-ink" data-testid="lineup-absent">
            No lineup recorded for {teamName} yet, so round {round} counts every player at 100% for now.
          </p>
        ) : null}

        {view === "court" ? (
          <div className="grid gap-4 @xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] @xl:items-start">
            <LineupCourt
              starters={groups.starter.map((player) => ({
                id: player.id,
                name: player.name,
                personCode: player.personCode,
                position: player.position,
                isCaptain: captainId === player.id,
                points: pointsOf(player.id),
              }))}
              openPlaces={openShape}
              onOpen={openProfile}
              drag={drag}
            />
            <div className="flex min-w-0 flex-col gap-3">{TIERS.map(renderTier)}</div>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-panel-border" role="region" aria-label="Lineup grid" tabIndex={0}>
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="bg-stock text-xs text-ink-soft">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">Pos</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Player</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Fixture</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">Est.</th>
                  {live ? <th scope="col" className="px-3 py-2 text-right font-semibold">Round</th> : null}
                  <th scope="col" className="px-3 py-2 font-semibold">Captain</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Role</th>
                </tr>
              </thead>
              <tbody>
                {/* Ordered by where each player stood when the page opened, so a
                    row stays under the pointer while its role is changed. */}
                {[...players]
                  .sort((a, b) => ROLE_ORDER[originalPlaces[a.id] ?? ""] - ROLE_ORDER[originalPlaces[b.id] ?? ""] || POSITION_ORDER[a.position] - POSITION_ORDER[b.position])
                  .map((player) => {
                    const role = places[player.id] ?? "";
                    const isCaptain = captainId === player.id;
                    return (
                      <tr key={player.id} data-testid="lineup-row" data-state={role === "" ? "waiting" : "filled"} data-position={player.position} className="border-t border-panel-border">
                        <td className="px-3 py-1.5"><PositionPatch position={player.position} /></td>
                        <td className="px-3 py-1.5">
                          <span className="flex min-w-0 items-center gap-2">
                            <ClubCrest clubCode={player.clubCode} />
                            <span className="font-semibold">{displayName(player.name)}</span>
                          </span>
                        </td>
                        <td className="px-3 py-1.5"><FixtureNote fixture={player.fixture} /></td>
                        <td className="stat px-3 py-1.5 text-right text-ink-soft">
                          {player.estimateTenths !== null ? (player.estimateTenths / 10).toFixed(1) : "—"}
                        </td>
                        {live ? (
                          <td className="px-3 py-1.5 text-right">
                            <CardPoints points={pointsOf(player.id)!} />
                          </td>
                        ) : null}
                        <td className="px-3 py-1.5">
                          {/*
                            A radio group rather than thirteen toggles, because
                            "exactly one of these" is what a radio group *is*:
                            the browser clears the previous choice and arrow
                            keys move between them.
                          */}
                          <label
                            className={`flex min-h-11 w-fit cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-xs font-bold transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-live ${
                              isCaptain ? "border-gold bg-gold text-[oklch(0.22_0.04_80)]" : "border-rule text-ink-soft hover:border-gold hover:text-gold"
                            }`}
                            data-testid="lineup-captain"
                            data-checked={isCaptain ? "true" : undefined}
                          >
                            <input
                              type="radio"
                              name="captain-choice"
                              value={player.id}
                              checked={isCaptain}
                              aria-label={`${displayName(player.name)} captain`}
                              onChange={() => markCaptain(player.id)}
                              className="size-3.5 shrink-0 accent-[oklch(0.22_0.04_80)]"
                            />
                            C {multiplierWord("captain")}
                          </label>
                        </td>
                        <td className="px-3 py-1.5">
                          <select
                            value={role}
                            aria-label={`${displayName(player.name)} role`}
                            data-testid="lineup-role"
                            onChange={(event) => place(player.id, event.target.value as PlacementRole | "")}
                            className="min-h-11 appearance-none rounded-full border border-rule bg-stock px-3 text-xs font-semibold focus:border-live focus:outline-none"
                          >
                            <option value="">Not placed</option>
                            {PLACEMENT_ROLES.map((option) => (
                              <option key={option} value={option}>
                                {ROLE_WORDS[option]} {multiplierWord(option)}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {result.error ? <Correction testId="lineup-error">{result.error}</Correction> : null}

      {preview ? (
        <Bank framed label="Auto-Optimize preview" testId="lineup-optimize-preview">
          <p className="text-sm text-ink-soft">
            Proposed {preview.formation} G/F/C · estimated {(preview.scoreHalfTenths / 20).toFixed(2)} fantasy points. Nothing is recorded until you save.
          </p>
          <p className="text-sm">Captain: {displayName(players.find((player) => preview.roles[player.id] === "captain")?.name ?? "—")}</p>
          {preview.unknownIds.length > 0 ? (
            <p className="text-sm text-gold">
              No estimate: {preview.unknownIds.map((id) => displayName(players.find((player) => player.id === id)?.name ?? id)).join(", ")}. Counted as zero in this preview.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={applyOptimization} className="min-h-11 rounded-lg bg-live px-4 text-sm font-bold text-live-ink">Apply preview</button>
            <button type="button" onClick={() => setPreview(null)} className="min-h-11 px-4 text-sm text-ink-soft">Cancel</button>
          </div>
        </Bank>
      ) : null}
      {compareOpen ? <PlayerComparison players={comparison} onClose={() => setCompareOpen(false)} /> : null}
      {profilePlayer ? (
        <PlayerStatsModal
          id={profilePlayer.id}
          name={profilePlayer.name}
          profileHref={playerHref(profilePlayer.id)}
          round={round}
          onClose={closeProfile}
          action={
            places[profilePlayer.id] !== "starter" ? null : captainId === profilePlayer.id ? (
              <span data-testid="profile-captain" className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-gold px-4 text-sm font-bold text-[oklch(0.22_0.04_80)]">
                Captain ×2
              </span>
            ) : (
              <button
                type="button"
                data-testid="profile-make-captain"
                onClick={() => {
                  markCaptain(profilePlayer.id);
                  setLastMove(`${displayName(profilePlayer.name)} is captain.`);
                  closeProfile();
                }}
                className="inline-flex min-h-11 items-center rounded-full border border-gold px-4 text-sm font-semibold text-gold hover:bg-gold/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
              >
                Make captain ×2
              </button>
            )
          }
        />
      ) : null}

      {draggedPlayer ? (
        <div ref={ghostRef} aria-hidden="true" className="lineup-ghost" data-position={draggedPlayer.position}>
          <PlayerPortrait personCode={draggedPlayer.personCode} name={draggedPlayer.name} />
          <span>{surname(draggedPlayer.name)}</span>
        </div>
      ) : null}

      <div className="sticky bottom-(--tabs-height) z-30 -mx-5 flex flex-col gap-1 border-t border-panel-border bg-stock-sunk px-5 py-2.5 sm:-mx-8 sm:px-8 lg:bottom-0">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1">
            {/* Said once, where the eye goes after a move, and to a screen
                reader as it changes. */}
            <div aria-live="polite" className="text-sm">
              {lastMove ? (
                <p className="text-ink" data-testid="lineup-swapped">{lastMove}</p>
              ) : (
                <p className="text-ink-soft">Drag a player to move them. Tap one for their profile.</p>
              )}
            </div>
            <p className="text-xs text-ink-soft" data-testid="lineup-summary">
              <span className="sm:hidden">{formationName(five)} · {counts.captain} captain · {placed}/{players.length} placed</span>
              <span className="hidden sm:inline">{formationName(five)} G/F/C · {counts.captain} captain · {counts.starter} other starters · {counts.sixth} sixth · {counts.bench} bench · {counts.inactive} inactive</span>
              {" · "}
              <span className={dirty ? "text-gold" : "text-gain"}>
                {dirty
                  ? "Unsaved · saved on this device"
                  : result.saved
                    ? "Lineup recorded"
                    : official
                      ? "Lineup from the Fantasy Challenge"
                      : source === "recorded"
                        ? "Lineup recorded"
                        : "No lineup recorded for this round"}
              </span>
            </p>
          </div>
          {sourceOwned ? null : <SubmitButton testId="record-lineup-submit" tone="live" pendingLabel="Recording…" compact>Record lineup</SubmitButton>}
        </div>
        {/* Always mounted, so a reader hears the refusal a move just caused. */}
        <div role="status" className="empty:hidden">
          {!verdict.ok ? (
            <p className="text-sm text-gold" data-testid="lineup-refusal">{verdict.reason}</p>
          ) : result.saved && !dirty ? (
            <p className="text-sm text-gain" data-testid="lineup-saved">Recorded. The table has been recomputed.</p>
          ) : null}
        </div>
      </div>
    </form>
  );
}

/** The round's figure at the end of a card, with the LIVE bug while the game is on. */
function CardPoints({ points, stacked = false }: { points: RoundPoints; stacked?: boolean }) {
  if (points.kind === "note" && points.tipOff && stacked) {
    return (
      <span className="stat flex shrink-0 flex-col items-end text-xs leading-tight" data-testid="lineup-points">
        <span className="text-ink-soft">{points.tipOff.date}</span>
        <span className="font-semibold text-ink">{points.tipOff.clock}</span>
      </span>
    );
  }
  if (points.kind === "note") {
    return <span className="stat shrink-0 text-xs text-ink-soft" data-testid="lineup-points">{points.text}</span>;
  }
  return (
    <span className="inline-flex shrink-0 flex-col items-end gap-1" data-testid="lineup-points" data-live={points.live || undefined}>
      <span className="flex items-baseline gap-0.5">
        <span className="display-figure text-xl">{points.text}</span>
        {points.live ? null : <span className="text-[0.625rem] font-bold tracking-[0.06em] text-ink-soft uppercase">Pts</span>}
      </span>
      {points.live ? <StatusBadge kind="live">Live</StatusBadge> : null}
    </span>
  );
}

const PLACE_WORDS: Readonly<Record<PlacementRole | "", string>> = {
  starter: "the five",
  sixth: "sixth man",
  bench: "the bench",
  inactive: "inactive",
  "": "not placed",
};

const ROLE_ORDER: Readonly<Record<PlacementRole | "", number>> = {
  starter: 0,
  sixth: 1,
  bench: 2,
  inactive: 3,
  "": 4,
};
