"use client";

import { useActionState, useEffect, useMemo, useState } from "react";

import {
  Bank,
  Correction,
  FixtureNote,
  PositionPatch,
} from "@/components/board";
import { SubmitButton } from "@/components/submit-button";
import { PlayerComparison } from "@/components/player-comparison";
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
import type { Position } from "@/lib/engine";
import type { ComparisonPlayer } from "@/lib/stats/comparison-queries";

import { LineupCourt } from "./lineup-court";
import { useDragToPlace, type DragState, type DropTarget } from "./lineup-drag";

/**
 * Thirteen players, one role each — slice 9.3. The court draws the five and
 * the sixth man, bench and inactive stand beside it as cards, so a whole lineup
 * fits on one screen the way the official game's does. A player moves by drag,
 * or by a tap on them and a tap on their place; the grid view is the same
 * lineup as a table with a role select and a captain radio per row.
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
 * The tiers beside the court, top to bottom, with the columns each wants.
 * "Not placed" leads, because it is what is left to do, and is drawn only
 * while someone is in it.
 */
const TIERS: readonly { role: Exclude<PlacementRole, "starter"> | ""; label: string; columns: string }[] = [
  { role: "", label: "Not placed", columns: "grid-cols-2" },
  { role: "sixth", label: "Sixth man", columns: "grid-cols-2" },
  { role: "bench", label: "Bench", columns: "grid-cols-2" },
  { role: "inactive", label: "Inactive", columns: "grid-cols-2 @4xl:grid-cols-3" },
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

function surname(name: string): string {
  return name.split(",")[0]!.trim();
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
  source,
  official,
  carriedFrom,
  template,
}: {
  leagueId: string;
  memberId: string;
  teamName: string;
  season: string;
  round: number;
  players: readonly LineupPlayer[];
  comparison: readonly ComparisonPlayer[];
  source: LineupSource;
  official: boolean;
  carriedFrom: number | null;
  template: LineupTemplate;
}) {
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

  useEffect(() => {
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
  }, [draftKey, players]);

  useEffect(() => {
    try {
      if (dirty) window.localStorage.setItem(draftKey, JSON.stringify({ places, captainId }));
    } catch {
      // The server action remains available when storage is disabled.
    }
  }, [draftKey, places, captainId, dirty]);

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
    setCaptainId(playerId);
    setPlaces((current) => ({ ...current, [playerId]: "starter" }));
    setDirty(true);
  }

  /** Moving the captain off the five gives up the armband with the place. */
  function place(playerId: string, role: PlacementRole | ""): void {
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
    const arranged = arrangeFormation(players.map((player) => ({ id: player.id, position: player.position, place: places[player.id] ?? "" })), shape, template, captainId);
    if (!arranged) return;
    setPlaces({ ...arranged.places });
    setCaptainId(arranged.captainId);
    setDirty(true);
    setArmed(null);
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
    setArmed(null);
    setPreview(null);
    setDirty(false);
    try { window.localStorage.removeItem(draftKey); } catch { /* Storage is optional. */ }
  }

  // Tap to place — 11.3. One player in hand at a time; the next tap on a place
  // or a player puts them there through `place`, the same function the grid's
  // select and a drop call, so the validator above sees one kind of change.
  const [armed, setArmed] = useState<string | null>(null);
  const armedPlayer = players.find((player) => player.id === armed) ?? null;
  const [lastMove, setLastMove] = useState("");
  const nameOf = (id: string) => players.find((player) => player.id === id)?.name ?? "";

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

  /** Tapping somebody in the same place as the one in hand changes who is in hand. */
  function arm(playerId: string): void {
    setLastMove("");
    if (armed === null || armed === playerId) {
      setArmed(armed === playerId ? null : playerId);
      return;
    }
    if (swap(armed, playerId)) setArmed(null);
    else setArmed(playerId);
  }

  function moveTo(role: PlacementRole | ""): void {
    if (armed === null) return;
    place(armed, role);
    setArmed(null);
    setLastMove("");
  }

  function dropOn(playerId: string, target: DropTarget): void {
    setArmed(null);
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

  function card(player: LineupPlayer) {
    const key = `player:${player.id}`;
    return (
      <li key={player.id} className="min-w-0">
        <button
          type="button"
          data-testid="lineup-card"
          data-position={player.position}
          data-drop={key}
          data-over={drag.over === key || undefined}
          data-dragging={drag.dragging === player.id || undefined}
          aria-pressed={armed === player.id}
          aria-label={`Move ${player.name}`}
          title={player.name}
          onClick={() => arm(player.id)}
          {...drag.handle(player.id)}
          className="lineup-card lineup-drag"
        >
          <PlayerPortrait personCode={player.personCode} name={player.name} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm leading-tight font-semibold">{surname(player.name)}</span>
            <span className="flex min-w-0 items-center gap-1 text-xs text-ink-soft">
              <span className="lineup-card-position" aria-hidden="true">{player.position}</span>
              <span className="truncate">
                {player.clubCode}
                {player.fixture ? ` ${player.fixture.atHome ? "vs" : "at"} ${player.fixture.nextOpponent}` : ""}
              </span>
            </span>
          </span>
          {player.estimateTenths !== null ? (
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
    const incoming =
      (armed !== null && (places[armed] ?? "") !== tier.role) ||
      (drag.dragging !== null && (places[drag.dragging] ?? "") !== tier.role);
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
        <ul role="list" aria-label={tier.label} className={`grid gap-1.5 ${tier.columns}`}>
          {members.map(card)}
          {Array.from({ length: Math.max(0, capacity - members.length) }, (_, index) => (
            <li key={`open-${index}`} className="min-w-0">
              <button
                type="button"
                data-testid="lineup-open"
                disabled={armed === null || !incoming}
                onClick={() => moveTo(tier.role)}
                className="lineup-card-open"
              >
                {incoming ? "Move here" : "Open"}
              </button>
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
    <form action={action} className="flex flex-col gap-4">
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
                  onClick={() => { setView(option); setArmed(null); }}
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
              }))}
              openPlaces={openShape}
              armed={armed}
              armedIsStarter={armed !== null && places[armed] === "starter"}
              onArm={arm}
              onPlace={() => moveTo("starter")}
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
                            <span className="font-semibold">{player.name}</span>
                          </span>
                        </td>
                        <td className="px-3 py-1.5"><FixtureNote fixture={player.fixture} /></td>
                        <td className="stat px-3 py-1.5 text-right text-ink-soft">
                          {player.estimateTenths !== null ? (player.estimateTenths / 10).toFixed(1) : "—"}
                        </td>
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
                              aria-label={`${player.name} captain`}
                              onChange={() => markCaptain(player.id)}
                              className="size-3.5 shrink-0 accent-[oklch(0.22_0.04_80)]"
                            />
                            C {multiplierWord("captain")}
                          </label>
                        </td>
                        <td className="px-3 py-1.5">
                          <select
                            value={role}
                            aria-label={`${player.name} role`}
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
          <p className="text-sm">Captain: {players.find((player) => preview.roles[player.id] === "captain")?.name ?? "—"}</p>
          {preview.unknownIds.length > 0 ? (
            <p className="text-sm text-gold">
              No estimate: {preview.unknownIds.map((id) => players.find((player) => player.id === id)?.name ?? id).join(", ")}. Counted as zero in this preview.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={applyOptimization} className="min-h-11 rounded-lg bg-live px-4 text-sm font-bold text-live-ink">Apply preview</button>
            <button type="button" onClick={() => setPreview(null)} className="min-h-11 px-4 text-sm text-ink-soft">Cancel</button>
          </div>
        </Bank>
      ) : null}
      {compareOpen ? <PlayerComparison players={comparison} onClose={() => setCompareOpen(false)} /> : null}

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
                reader as it changes: who is in hand and how to put them down. */}
            <div aria-live="polite" className="text-sm">
              {armedPlayer ? (
                <p className="text-ink" data-testid="lineup-in-hand">
                  Moving {armedPlayer.name}. Tap an open place, or a player to swap.
                </p>
              ) : lastMove ? (
                <p className="text-ink" data-testid="lineup-swapped">{lastMove}</p>
              ) : (
                <p className="text-ink-soft">Drag a player, or tap one and then where they go.</p>
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
          {armedPlayer ? (
            <span className="flex items-center gap-1">
              {places[armedPlayer.id] === "starter" && captainId !== armedPlayer.id ? (
                <button type="button" onClick={() => { markCaptain(armedPlayer.id); setArmed(null); }} className="min-h-11 rounded-full border border-gold px-3 text-sm font-semibold text-gold">
                  Make captain ×2
                </button>
              ) : null}
              <button type="button" onClick={() => setArmed(null)} className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live">
                Cancel
              </button>
            </span>
          ) : null}
          <SubmitButton testId="record-lineup-submit" tone="live" pendingLabel="Recording…" compact>
            Record lineup
          </SubmitButton>
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
