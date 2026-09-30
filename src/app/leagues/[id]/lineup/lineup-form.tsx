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

/**
 * Thirteen rows, one role each — slice 9.3. Since 11.3 the rows stand in
 * tiers under a court that draws the five, and a player can be moved by
 * tapping them and then their place. Each row still carries its own select and
 * captain mark: those are what the form posts, and all it needs without
 * JavaScript.
 *
 * The same pure validator the action runs is run here on every change, so the
 * refusal a wrong formation earns is visible before the round trip rather than
 * after it. The server still decides: this is the mirror, not the authority.
 */

const START: LineupResult = { error: null, saved: false };

/** The court's tiers, top to bottom. "Not placed" is drawn only while someone is. */
const TIERS: readonly { role: PlacementRole | ""; label: string }[] = [
  { role: "starter", label: "Starting five" },
  { role: "sixth", label: "Sixth man" },
  { role: "bench", label: "Bench" },
  { role: "inactive", label: "Inactive" },
  { role: "", label: "Not placed" },
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

export function LineupForm({
  leagueId,
  memberId,
  teamName,
  season,
  round,
  players,
  comparison,
  source,
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

  // Tap to place — 11.3. One player in hand at a time; the next tap on a tier
  // or an open court place puts them there through `place`, the same function
  // the select calls, so the validator above sees one kind of change.
  const [armed, setArmed] = useState<string | null>(null);
  const armedPlayer = players.find((player) => player.id === armed) ?? null;
  const [lastMove, setLastMove] = useState("");

  /**
   * With somebody in hand, tapping a player in another tier swaps the two.
   * The usual edit of a round is "he starts, he sits"; without a swap that
   * took four taps and passed through a six-man five the validator refused.
   * Tapping somebody in the same tier just changes who is in hand.
   */
  function arm(playerId: string): void {
    setLastMove("");
    if (armed === null || armed === playerId) {
      setArmed(armed === playerId ? null : playerId);
      return;
    }
    const held = places[armed] ?? "";
    const target = places[playerId] ?? "";
    if (held === target) {
      setArmed(playerId);
      return;
    }
    place(armed, target);
    place(playerId, held);
    setArmed(null);
    const name = (id: string) =>
      players.find((player) => player.id === id)?.name ?? "";
    setLastMove(
      `${name(armed)} to ${PLACE_WORDS[target]}, ${name(playerId)} to ${PLACE_WORDS[held]}.`,
    );
  }

  function moveTo(role: PlacementRole | ""): void {
    if (armed === null) return;
    place(armed, role);
    setArmed(null);
    setLastMove("");
  }

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

  function row(player: LineupPlayer) {
    const role = places[player.id] ?? "";
    const isCaptain = captainId === player.id;
    const inHand = armed === player.id;
    return (
      <li
        key={player.id}
        data-testid="lineup-row"
        data-state={role === "" ? "waiting" : "filled"}
        data-position={player.position}
        className={`flex flex-col gap-2 border-b border-panel-border py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-4 ${
          inHand ? "rounded-lg bg-live-sunk/60 px-2 outline-2 -outline-offset-2 outline-live" : ""
        }`}
      >
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <PositionPatch position={player.position} />
          <PlayerPortrait personCode={player.personCode} name={player.name} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-semibold">{player.name}</span>
            <span className="flex flex-wrap items-center gap-x-2 text-xs text-ink-soft">
              <span className="flex items-center gap-1">
                <ClubCrest clubCode={player.clubCode} />
                {player.clubCode}
              </span>
              <FixtureNote fixture={player.fixture} />
              {player.estimateTenths !== null ? (
                <span className="stat">~{(player.estimateTenths / 10).toFixed(1)}</span>
              ) : null}
            </span>
          </span>
        </span>
        <span className="flex flex-wrap items-center justify-end gap-2">
          {/*
            A radio group rather than thirteen toggles, because "exactly one of
            these" is what a radio group *is*: the browser clears the previous
            choice, arrow keys move between them, and a screen reader says
            "3 of 13". Drawn as the gold armband it stands for.
          */}
          <label
            className={`flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-xs font-bold transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-live ${
              isCaptain ? "border-gold bg-gold text-[oklch(0.22_0.04_80)]" : "border-rule text-ink-soft hover:border-gold hover:text-gold"
            }`}
            data-testid="lineup-captain"
            data-checked={isCaptain ? "true" : undefined}
          >
            <input
              type="radio"
              name="captain"
              value={player.id}
              checked={isCaptain}
              aria-label={`${player.name} captain`}
              onChange={() => markCaptain(player.id)}
              className="size-3.5 shrink-0 accent-[oklch(0.22_0.04_80)]"
            />
            C {multiplierWord("captain")}
          </label>
          <select
            name={`role:${player.id}`}
            value={role}
            aria-label={`${player.name} role`}
            data-testid="lineup-role"
            onChange={(event) => place(player.id, event.target.value as PlacementRole | "")}
            className="min-h-11 shrink-0 appearance-none rounded-full border border-rule bg-stock px-3 text-xs font-semibold focus:border-live focus:outline-none"
          >
            <option value="">Not placed</option>
            {PLACEMENT_ROLES.map((option) => (
              <option key={option} value={option}>
                {ROLE_WORDS[option]} {multiplierWord(option)}
              </option>
            ))}
          </select>
          <button
            type="button"
            data-testid="lineup-move"
            aria-pressed={inHand}
            aria-label={`Move ${player.name}`}
            onClick={() => arm(player.id)}
            className={`inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live ${
              inHand ? "bg-live text-live-ink" : "border border-rule text-ink hover:border-ink-soft"
            }`}
          >
            <span aria-hidden="true">⇄</span>
            {inHand ? "In hand" : "Move"}
          </button>
        </span>
      </li>
    );
  }

  const openShape = (() => {
    const shape = FORMATIONS.find((candidate) => candidate.every((count, index) => count >= five[index]!)) ?? FORMATIONS[0]!;
    return { G: Math.max(0, shape[0] - five[0]), F: Math.max(0, shape[1] - five[1]), C: Math.max(0, shape[2] - five[2]) };
  })();

  return (
    <form action={action} className="flex flex-col gap-6 pb-28">
      <input type="hidden" name="leagueId" value={leagueId} />
      <input type="hidden" name="memberId" value={memberId} />
      <input type="hidden" name="season" value={season} />
      <input type="hidden" name="round" value={String(round)} />

      <Bank framed label="The court" aside={`${placed}/${players.length} placed`} testId="lineup-board">
        <div className="flex flex-col gap-4">
          {view === "court" ? (
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
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-panel-border" role="region" aria-label="Starting five grid" tabIndex={0}>
              <table className="w-full min-w-96 text-left text-sm">
                <thead className="bg-stock text-xs text-ink-soft">
                  <tr>
                    <th className="p-3 font-semibold">Position</th>
                    <th className="p-3 font-semibold">Player</th>
                    <th className="p-3 font-semibold">Fixture</th>
                    <th className="p-3 font-semibold">Captain</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.starter.map((player) => (
                    <tr key={player.id} className="border-t border-panel-border">
                      <td className="p-3"><PositionPatch position={player.position} /></td>
                      <td className="p-3">{player.name}</td>
                      <td className="p-3"><FixtureNote fixture={player.fixture} /></td>
                      <td className="p-3">
                        <button type="button" onClick={() => markCaptain(player.id)} className="min-h-11 font-semibold text-gold hover:underline">
                          {captainId === player.id ? "Captain ×2" : "Make captain"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div role="group" aria-label="Formation, guards forwards centers" className="flex flex-wrap gap-1.5">
              {FORMATIONS.map((shape) => {
                const name = formationName(shape);
                const on = formationName(five) === name;
                return (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={on}
                    onClick={() => chooseFormation(shape)}
                    className={`min-h-11 rounded-full border px-3.5 text-sm font-bold tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live ${
                      on ? "border-ink bg-ink text-stock" : "border-rule text-ink-soft hover:border-ink-soft hover:text-ink"
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
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

          {source === "carried" && carriedFrom !== null ? (
            <p className="rounded-lg bg-gold/10 px-3 py-2 text-sm text-ink" data-testid="lineup-carried">
              This round carries round {carriedFrom}&apos;s lineup and scores at it. Save it to make it round {round}&apos;s own.
            </p>
          ) : null}
          {source === "absent" ? (
            <p className="rounded-lg bg-gold/10 px-3 py-2 text-sm text-ink" data-testid="lineup-absent">
              No lineup recorded for {teamName} yet, so round {round} counts every player at 100% for now.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <button type="button" onClick={showOptimization} className="min-h-11 font-semibold text-live hover:underline">Auto-Optimize preview</button>
            <button type="button" onClick={() => setCompareOpen(true)} className="min-h-11 font-semibold text-live hover:underline">Compare players</button>
            <button type="button" onClick={resetDraft} className="min-h-11 text-ink-soft hover:text-ink">Reset changes</button>
          </div>

          {/* Said once, where the next tap lands, and to a screen reader as it
              changes: which player is in hand and how to put them down. */}
          <div aria-live="polite" className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg bg-stock px-3 py-1">
            {armedPlayer ? (
              <>
                <p className="text-sm text-ink" data-testid="lineup-in-hand">
                  Moving {armedPlayer.name}. Tap an open place, a tier, or a player to swap.
                </p>
                {places[armedPlayer.id] === "starter" ? (
                  <button type="button" onClick={() => { markCaptain(armedPlayer.id); setArmed(null); }} className="min-h-11 rounded-full border border-gold px-3 text-sm font-semibold text-gold">
                    Make captain ×2
                  </button>
                ) : null}
                <button type="button" onClick={() => setArmed(null)} className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live">
                  Cancel
                </button>
              </>
            ) : lastMove ? (
              <p className="text-sm text-ink" data-testid="lineup-swapped">{lastMove}</p>
            ) : (
              <p className="text-sm text-ink-soft">Tap a player to pick them up, then tap where they go.</p>
            )}
          </div>
        </div>
      </Bank>

      {TIERS.map((tier) => {
        const members = groups[tier.role];
        const capacity = tier.role === "" ? 0 : template[TEMPLATE_KEY[tier.role]];
        if (tier.role === "" && members.length === 0) return null;
        const canMoveHere = armed !== null && (places[armed] ?? "") !== tier.role;
        return (
          <section
            key={tier.role || "none"}
            aria-labelledby={`tier-${tier.role || "none"}`}
            data-testid={`lineup-tier-${tier.role || "none"}`}
            className="flex flex-col gap-1"
          >
            <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <h3 id={`tier-${tier.role || "none"}`} className="display text-xl">
                {tier.label}
                <span className="ml-2 font-sans text-sm font-semibold tracking-normal text-ink-soft normal-case">
                  {capacity > 0 ? `${members.length}/${capacity}` : members.length}
                  {tier.role !== "" && tier.role !== "starter" ? ` · ${multiplierWord(tier.role)}` : ""}
                </span>
              </h3>
              {canMoveHere ? (
                <button
                  type="button"
                  data-testid={`lineup-to-${tier.role || "none"}`}
                  onClick={() => moveTo(tier.role)}
                  className="inline-flex min-h-11 items-center rounded-full bg-live px-4 text-sm font-bold text-live-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
                >
                  Move here
                </button>
              ) : null}
            </div>
            <ul role="list" aria-label={tier.label} className="rounded-card border border-panel-border bg-stock-panel px-3">
              {members.map(row)}
              {Array.from({ length: Math.max(0, capacity - members.length) }, (_, index) => (
                <li key={`open-${index}`} data-testid="lineup-open" className="flex min-h-12 items-center border-b border-dashed border-rule py-2 text-sm text-ink-faint last:border-b-0">
                  Open place
                </li>
              ))}
            </ul>
          </section>
        );
      })}

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

      <div className="sticky bottom-(--tabs-height) z-30 -mx-5 flex flex-col gap-2 border-t border-panel-border bg-stock-sunk px-5 py-3 sm:-mx-8 sm:px-8 lg:bottom-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink" data-testid="lineup-summary">
              <span className="sm:hidden">{formationName(five)} · {counts.captain} captain · {placed}/{players.length} placed</span>
              <span className="hidden sm:inline">{formationName(five)} G/F/C · {counts.captain} captain · {counts.starter} other starters · {counts.sixth} sixth · {counts.bench} bench · {counts.inactive} inactive</span>
            </p>
            <p className={`mt-0.5 text-xs ${dirty ? "text-gold" : "text-gain"}`}>
              {dirty ? "Unsaved · saved on this device" : source === "recorded" || result.saved ? "Lineup recorded" : "No lineup recorded for this round"}
            </p>
          </div>
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
