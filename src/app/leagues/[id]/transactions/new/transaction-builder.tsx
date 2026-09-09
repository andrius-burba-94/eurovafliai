"use client";

import { useActionState, useMemo, useState } from "react";

import {
  Bank,
  CardName,
  Correction,
  Field,
  FilterToggle,
  PositionPatch,
  Slot,
  Slots,
  inputStyles,
} from "@/components/board";
import { SubmitButton } from "@/components/submit-button";
import {
  announceAdd,
  announceDrop,
  announceTrade,
} from "@/lib/chat/messages";
import type { Position } from "@/lib/engine";
import {
  recordTransaction,
  type TransactionResult,
} from "@/lib/memberships/actions";
import type { BoardSeat, FreeAgent } from "@/lib/memberships/queries";
import {
  NO_FILTERS,
  poolIndex,
  selectPool,
  type PoolPlayer,
} from "@/lib/pool/search";

type Mode = "trade" | "drop" | "add";

const START: TransactionResult = { error: null };

function asPool(agents: readonly FreeAgent[]): PoolPlayer[] {
  return agents.map((player) => ({
    id: player.id,
    name: player.name,
    normalized: player.normalized,
    club: player.clubCode,
    position: player.position,
    status: "active",
    takenBy: null,
    takenAt: null,
    projectedLast5: null,
  }));
}

function toggleId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((row) => row !== id) : [...ids, id];
}

function namesOf(
  ids: readonly string[],
  seats: readonly BoardSeat[],
  agents: readonly FreeAgent[],
): string[] {
  return ids.map((id) => {
    const seat = seats.find((row) => row.player === id);
    if (seat) return seat.name;
    return agents.find((row) => row.id === id)?.name ?? id;
  });
}

export function TransactionBuilder({
  leagueId,
  members,
  seats,
  freeAgents,
}: {
  leagueId: string;
  members: readonly { id: string; name: string }[];
  seats: readonly BoardSeat[];
  freeAgents: readonly FreeAgent[];
}) {
  const [result, action] = useActionState(recordTransaction, START);
  const [mode, setMode] = useState<Mode>("trade");
  const [memberA, setMemberA] = useState(members[0]?.id ?? "");
  const [memberB, setMemberB] = useState(members[1]?.id ?? members[0]?.id ?? "");
  const [memberSolo, setMemberSolo] = useState(members[0]?.id ?? "");
  const [outA, setOutA] = useState<string[]>([]);
  const [outB, setOutB] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [fromRound, setFromRound] = useState("1");
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState<Position | "">("");

  const pool = useMemo(() => asPool(freeAgents), [freeAgents]);
  const index = useMemo(() => poolIndex(pool), [pool]);
  const agents = useMemo(
    () =>
      selectPool({
        pool,
        filters: {
          ...NO_FILTERS,
          hideDrafted: false,
          positions: position ? [position] : [],
        },
        query,
        needs: null,
        index,
      }),
    [pool, position, query, index],
  );

  const nameA = members.find((row) => row.id === memberA)?.name ?? "that team";
  const nameB = members.find((row) => row.id === memberB)?.name ?? "the other team";
  const nameSolo =
    members.find((row) => row.id === memberSolo)?.name ?? "that team";
  const round = Number.parseInt(fromRound, 10) || 1;

  const sentence =
    mode === "trade"
      ? announceTrade({
          teamA: nameA,
          teamB: nameB,
          sent: namesOf(outA, seats, freeAgents),
          received: namesOf(outB, seats, freeAgents),
          fromRound: round,
        })
      : mode === "drop"
        ? announceDrop({
            teamName: nameSolo,
            players: namesOf(picked, seats, freeAgents),
            fromRound: round,
          })
        : announceAdd({
            teamName: nameSolo,
            players: namesOf(picked, seats, freeAgents),
            fromRound: round,
          });

  const roster = (memberId: string) =>
    seats.filter((seat) => seat.member === memberId);

  return (
    <form action={action} className="flex flex-col gap-8 pb-28">
      <input type="hidden" name="leagueId" value={leagueId} />
      <input type="hidden" name="type" value={mode} />
      <input type="hidden" name="member_a" value={memberA} />
      <input type="hidden" name="member_b" value={memberB} />
      <input type="hidden" name="member" value={memberSolo} />
      <input type="hidden" name="out_a" value={outA.join(",")} />
      <input type="hidden" name="out_b" value={outB.join(",")} />
      <input type="hidden" name="player_ids" value={picked.join(",")} />

      <div className="flex flex-wrap gap-2" role="group" aria-label="Kind">
        <FilterToggle
          pressed={mode === "trade"}
          onPressedChange={(next) => {
            if (next) setMode("trade");
          }}
          testId="mode-trade"
        >
          Trade
        </FilterToggle>
        <FilterToggle
          pressed={mode === "drop"}
          onPressedChange={(next) => {
            if (next) setMode("drop");
          }}
          testId="mode-drop"
        >
          Drop
        </FilterToggle>
        <FilterToggle
          pressed={mode === "add"}
          onPressedChange={(next) => {
            if (next) setMode("add");
          }}
          testId="mode-add"
        >
          Add
        </FilterToggle>
      </div>

      <Field label="Counts from round">
        <input
          name="from_round"
          inputMode="numeric"
          value={fromRound}
          onChange={(event) => setFromRound(event.target.value)}
          data-testid="from-round"
          className={inputStyles}
        />
      </Field>

      {mode === "trade" ? (
        <>
          <Bank framed label="This side">
            <div className="flex flex-wrap gap-2 px-3 py-2">
              {members.map((member) => (
                <FilterToggle
                  key={member.id}
                  pressed={memberA === member.id}
                  onPressedChange={(next) => {
                    if (!next) return;
                    setMemberA(member.id);
                    setOutA([]);
                    if (memberB === member.id) {
                      const other = members.find((row) => row.id !== member.id);
                      if (other) {
                        setMemberB(other.id);
                        setOutB([]);
                      }
                    }
                  }}
                  testId={`pick-a-${member.id}`}
                >
                  {member.name}
                </FilterToggle>
              ))}
            </div>
            <Slots label={`${nameA} roster`}>
              {roster(memberA).length === 0 ? (
                <Slot state="waiting">
                  <span className="slot-label text-ink-faint">
                    Nobody is on this roster.
                  </span>
                </Slot>
              ) : (
                roster(memberA).map((seat) => (
                <Slot
                  key={seat.id}
                  testId="trade-player-a"
                  state={outA.includes(seat.player) ? "transit" : "filled"}
                >
                  <button
                    type="button"
                    className="-mx-3 -my-3 flex min-h-11 min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left"
                    onClick={() => setOutA(toggleId(outA, seat.player))}
                  >
                    <PositionPatch position={seat.position} />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <CardName>{seat.name}</CardName>
                      <span className="text-sm text-ink-soft">{seat.clubName}</span>
                    </span>
                  </button>
                </Slot>
                ))
              )}
            </Slots>
          </Bank>
          <Bank framed label="The other side">
            <div className="flex flex-wrap gap-2 px-3 py-2">
              {members
                .filter((member) => member.id !== memberA)
                .map((member) => (
                  <FilterToggle
                    key={member.id}
                    pressed={memberB === member.id}
                    onPressedChange={(next) => {
                      if (next) {
                        setMemberB(member.id);
                        setOutB([]);
                      }
                    }}
                    testId={`pick-b-${member.id}`}
                  >
                    {member.name}
                  </FilterToggle>
                ))}
            </div>
            <Slots label={`${nameB} roster`}>
              {roster(memberB).length === 0 ? (
                <Slot state="waiting">
                  <span className="slot-label text-ink-faint">
                    Nobody is on this roster.
                  </span>
                </Slot>
              ) : (
                roster(memberB).map((seat) => (
                <Slot
                  key={seat.id}
                  testId="trade-player-b"
                  state={outB.includes(seat.player) ? "transit" : "filled"}
                >
                  <button
                    type="button"
                    className="-mx-3 -my-3 flex min-h-11 min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left"
                    onClick={() => setOutB(toggleId(outB, seat.player))}
                  >
                    <PositionPatch position={seat.position} />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <CardName>{seat.name}</CardName>
                      <span className="text-sm text-ink-soft">{seat.clubName}</span>
                    </span>
                  </button>
                </Slot>
                ))
              )}
            </Slots>
          </Bank>
        </>
      ) : (
        <>
          <Bank framed label="Whose roster">
            <div className="flex flex-wrap gap-2 px-3 py-2">
              {members.map((member) => (
                <FilterToggle
                  key={member.id}
                  pressed={memberSolo === member.id}
                  onPressedChange={(next) => {
                    if (next) {
                      setMemberSolo(member.id);
                      setPicked([]);
                    }
                  }}
                  testId={`pick-solo-${member.id}`}
                >
                  {member.name}
                </FilterToggle>
              ))}
            </div>
          </Bank>
          {mode === "drop" ? (
            <Bank framed label="Drop">
              <Slots label={`${nameSolo} roster`}>
                {roster(memberSolo).map((seat) => (
                  <Slot
                    key={seat.id}
                    testId="drop-player"
                    state={picked.includes(seat.player) ? "transit" : "filled"}
                  >
                    <button
                      type="button"
                      className="-mx-3 -my-3 flex min-h-11 min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left"
                      onClick={() => setPicked(toggleId(picked, seat.player))}
                    >
                      <PositionPatch position={seat.position} />
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <CardName>{seat.name}</CardName>
                        <span className="text-sm text-ink-soft">
                          {seat.clubName}
                        </span>
                      </span>
                    </button>
                  </Slot>
                ))}
              </Slots>
            </Bank>
          ) : (
            <Bank framed label="Free agents" aside={`${agents.length}`}>
              <div className="flex flex-col gap-3 px-3 py-3">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search the pool"
                  data-testid="agent-search"
                  className={inputStyles}
                />
                <div className="flex flex-wrap gap-2">
                  {(["G", "F", "C"] as const).map((code) => (
                    <FilterToggle
                      key={code}
                      pressed={position === code}
                      onPressedChange={(next) =>
                        setPosition(next ? code : "")
                      }
                    >
                      {code}
                    </FilterToggle>
                  ))}
                </div>
              </div>
              {agents.length === 0 ? (
                <p className="px-3 pb-3 text-ink-soft" data-testid="agents-empty">
                  Nobody unsigned matches that.
                </p>
              ) : (
                <Slots label="Free agents">
                  {agents.slice(0, 40).map((player) => (
                    <Slot
                      key={player.id}
                      testId="add-player"
                      state={picked.includes(player.id) ? "transit" : "waiting"}
                    >
                      <button
                        type="button"
                        className="-mx-3 -my-3 flex min-h-11 min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left"
                        onClick={() => setPicked(toggleId(picked, player.id))}
                      >
                        <PositionPatch position={player.position} />
                        <span className="flex min-w-0 flex-1 flex-col gap-1">
                          <CardName>{player.name}</CardName>
                          <span className="text-sm text-ink-soft">
                            {player.club}
                          </span>
                        </span>
                      </button>
                    </Slot>
                  ))}
                </Slots>
              )}
            </Bank>
          )}
        </>
      )}

      <Field label="Note, if you want one">
        <input
          name="note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={500}
          className={inputStyles}
        />
      </Field>

      {result.error ? (
        <Correction testId="transaction-error">{result.error}</Correction>
      ) : null}

      <div className="slot-filled sticky bottom-0 z-30 flex flex-col gap-3 bg-stock px-3 pb-3 pt-3">
        <p className="text-sm text-ink-soft" data-testid="confirm-sentence">
          {sentence}
        </p>
        <SubmitButton
          testId="record-transaction-submit"
          tone="live"
          pendingLabel="Recording…"
        >
          Record this
        </SubmitButton>
      </div>
    </form>
  );
}
