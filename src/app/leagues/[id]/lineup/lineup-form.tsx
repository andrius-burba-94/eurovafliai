"use client";

import { useActionState, useMemo, useState } from "react";

import {
  Bank,
  CardBlock,
  CardBlocks,
  CardName,
  Correction,
  FixtureNote,
  PositionPatch,
  selectStyles,
} from "@/components/board";
import { SubmitButton } from "@/components/submit-button";
import { recordLineup, type LineupResult } from "@/lib/lineups/actions";
import {
  assignmentsWithCaptain,
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
import type { Position } from "@/lib/engine";

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

  /**
   * Marking a captain also *places* them, because the captaincy is only ever a
   * mark on a starter: a control that could name a captain the validator would
   * then refuse is a control that exists to produce an error message.
   */
  function markCaptain(playerId: string): void {
    setCaptainId(playerId);
    setPlaces((current) => ({ ...current, [playerId]: "starter" }));
  }

  /** Moving the captain off the five gives up the armband with the place. */
  function place(playerId: string, role: PlacementRole | ""): void {
    setPlaces((current) => ({ ...current, [playerId]: role }));
    if (role !== "starter" && captainId === playerId) setCaptainId("");
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

  const placed = assignments.length;

  // Tap to place — 11.3. One player in hand at a time; the next tap on a tier
  // or an open court place puts them there through `place`, the same function
  // the select calls, so the validator above sees one kind of change.
  const [armed, setArmed] = useState<string | null>(null);
  const armedPlayer = players.find((player) => player.id === armed) ?? null;

  function arm(playerId: string): void {
    setArmed((current) => (current === playerId ? null : playerId));
  }

  function moveTo(role: PlacementRole | ""): void {
    if (armed === null) return;
    place(armed, role);
    setArmed(null);
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

  function card(player: LineupPlayer) {
    const role = places[player.id] ?? "";
    const isCaptain = captainId === player.id;
    return (
      <CardBlock
        key={player.id}
        testId="lineup-row"
        state={role === "" ? "waiting" : "filled"}
        position={player.position}
      >
        <span className="flex min-w-0 items-center gap-3">
          <PositionPatch position={player.position} />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <CardName scale="slot">{player.name}</CardName>
            <span className="text-sm text-ink-soft">{player.clubName}</span>
          </span>
          <button
            type="button"
            data-testid="lineup-move"
            aria-pressed={armed === player.id}
            aria-label={`Move ${player.name}`}
            onClick={() => arm(player.id)}
            className={`slot-label inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center px-3 text-ink transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live ${
              armed === player.id
                ? "border-2 border-ink"
                : "border border-ink/50 hover:border-ink/80"
            }`}
          >
            {armed === player.id ? "In hand" : "Move"}
          </button>
        </span>
        <FixtureNote fixture={player.fixture} />
        <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <select
            name={`role:${player.id}`}
            value={role}
            aria-label={`${player.name} role`}
            data-testid="lineup-role"
            onChange={(event) =>
              place(player.id, event.target.value as PlacementRole | "")
            }
            className={`${selectStyles} w-auto min-w-36 shrink-0`}
          >
            <option value="">—</option>
            {PLACEMENT_ROLES.map((option) => (
              <option key={option} value={option}>
                {ROLE_WORDS[option]} {multiplierWord(option)}
              </option>
            ))}
          </select>

          {/*
            A radio group rather than thirteen toggles, because "exactly one of
            these" is what a radio group *is*: the browser clears the previous
            choice, arrow keys move between them, and a screen reader says
            "3 of 13". Thirteen checkboxes wired to clear each other would be
            that behaviour reimplemented, minus the keyboard handling.
          */}
          <label
            className="flex min-h-11 shrink-0 items-center gap-2"
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
              className="size-4 shrink-0 accent-live"
            />
            <span className={`slot-label ${isCaptain ? "text-live" : ""}`}>
              Captain {multiplierWord("captain")}
            </span>
          </label>
        </span>
      </CardBlock>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-6 pb-28">
      <input type="hidden" name="leagueId" value={leagueId} />
      <input type="hidden" name="memberId" value={memberId} />
      <input type="hidden" name="season" value={season} />
      <input type="hidden" name="round" value={String(round)} />

      {source === "carried" && carriedFrom !== null ? (
        <p className="text-sm text-ink-soft" data-testid="lineup-carried">
          No lineup was recorded for round {round}, so round {carriedFrom}
          &apos;s is carried forward and is what this round currently scores at.
          Record it to make it this round&apos;s own.
        </p>
      ) : null}
      {source === "absent" ? (
        <p className="text-sm text-ink-soft" data-testid="lineup-absent">
          No lineup has been recorded for {teamName} yet, so round {round} is
          scoring every player at 100% — provisionally.
        </p>
      ) : null}

      <Bank
        framed
        label="The thirteen"
        aside={`${placed}/${players.length} placed`}
        testId="lineup-board"
      >
        <div className="flex flex-col gap-6">
          <LineupCourt
            starters={groups.starter.map((player) => ({
              id: player.id,
              name: player.name,
              position: player.position,
              isCaptain: captainId === player.id,
            }))}
            openPlaces={Math.max(0, template.starters - groups.starter.length)}
            armed={armed}
            armedIsStarter={armed !== null && places[armed] === "starter"}
            onArm={arm}
            onPlace={() => moveTo("starter")}
          />

          {/* Said once, where the next tap lands, and to a screen reader as it
              changes: which player is in hand and how to put them down. */}
          <div
            aria-live="polite"
            className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-2"
          >
            {armedPlayer ? (
              <>
                <p className="text-sm text-ink" data-testid="lineup-in-hand">
                  Moving {armedPlayer.name}. Choose where they go.
                </p>
                <button
                  type="button"
                  onClick={() => setArmed(null)}
                  className="slot-label inline-flex min-h-11 items-center px-2 text-ink transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
                >
                  Cancel
                </button>
              </>
            ) : (
              <p className="text-sm text-ink-soft">
                Tap Move on a player, then tap where they go.
              </p>
            )}
          </div>

          {TIERS.map((tier) => {
            const members = groups[tier.role];
            const capacity =
              tier.role === "" ? 0 : template[TEMPLATE_KEY[tier.role]];
            if (tier.role === "" && members.length === 0) return null;
            const canMoveHere =
              armed !== null && (places[armed] ?? "") !== tier.role;
            return (
              <section
                key={tier.role || "none"}
                aria-labelledby={`tier-${tier.role || "none"}`}
                data-testid={`lineup-tier-${tier.role || "none"}`}
                className="flex flex-col gap-2"
              >
                <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <h3
                    id={`tier-${tier.role || "none"}`}
                    className="slot-label text-ink"
                  >
                    {tier.label}
                    {capacity > 0 ? ` · ${members.length}/${capacity}` : ""}
                    {tier.role !== "" && tier.role !== "starter"
                      ? ` · ${multiplierWord(tier.role)}`
                      : ""}
                  </h3>
                  {canMoveHere ? (
                    <button
                      type="button"
                      data-testid={`lineup-to-${tier.role || "none"}`}
                      onClick={() => moveTo(tier.role)}
                      className="slot-label inline-flex min-h-11 items-center border border-ink/50 px-3 text-ink transition-colors hover:border-ink/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
                    >
                      Move here
                    </button>
                  ) : null}
                </div>
                <CardBlocks label={tier.label} columns>
                  {members.map(card)}
                  {Array.from(
                    { length: Math.max(0, capacity - members.length) },
                    (_, index) => (
                      <CardBlock
                        key={`open-${index}`}
                        testId="lineup-open"
                        state="waiting"
                      >
                        <span className="slot-label">Open place</span>
                      </CardBlock>
                    ),
                  )}
                </CardBlocks>
              </section>
            );
          })}
        </div>
      </Bank>

      {result.error ? (
        <Correction testId="lineup-error">{result.error}</Correction>
      ) : null}

      <div className="slot-filled sticky bottom-0 z-30 flex flex-col gap-3 bg-stock px-3 pb-3 pt-3">
        <p className="text-sm text-ink-soft" data-testid="lineup-summary">
          {counts.captain} captain, {counts.starter} more starters,{" "}
          {counts.sixth} sixth man, {counts.bench} bench, {counts.inactive}{" "}
          inactive — {formationName(five)} as guards-forwards-centers.
        </p>
        {!verdict.ok ? (
          <p className="text-sm text-ink" data-testid="lineup-refusal">
            {verdict.reason}
          </p>
        ) : result.saved ? (
          <p className="text-sm text-ink" data-testid="lineup-saved">
            Recorded. The table has been recomputed.
          </p>
        ) : null}
        <SubmitButton
          testId="record-lineup-submit"
          tone="live"
          pendingLabel="Recording…"
        >
          Record this lineup
        </SubmitButton>
      </div>
    </form>
  );
}
