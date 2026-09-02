import type PocketBase from "pocketbase";

import { AUTOPICK_GRACE_MS, isPickDue, needsDeadline } from "@/lib/drafts/due";
import {
  advance,
  commitPick,
  deadlineFrom,
  describeError,
  DRAFTABLE_PLAYERS_FILTER,
  readPicks,
  repairUnadvanced,
  rosterPositionsOf,
  toState,
} from "@/lib/drafts/pipeline";
import type { DraftRecord } from "@/lib/drafts/types";
import {
  isDraftComplete,
  selectAutoPick,
  totalPicks,
  whoIsOnClock,
  type EnginePlayer,
  type Position,
} from "@/lib/engine";
import { parseLeagueSettings } from "@/lib/leagues/settings";

/**
 * The sweep — one tick of the worker, and the only thing in this app that
 * enforces a deadline.
 *
 * Invariant §4: a client countdown is display only, and expiry is executed
 * here. Invariant §1: this code decides nothing the server has not already
 * decided — it asks the engine who is on the clock and whether a pick is
 * legal, exactly as the server action does, and lands the pick through the
 * *same* `commitPick`. There is no autodraft-specific write path, because a
 * second write path is a second set of bugs.
 *
 * Four jobs, in order of how much they matter:
 *
 * 1. **Autodraft.** A member who is out of time, or who armed autodraft on
 *    purpose, gets their pick made for them with `is_auto: true`.
 * 2. **Repair an unadvanced pick.** ADR-0003's one intermediate state. Done
 *    before anything else on every live draft, and idempotent.
 * 3. **Close a draft whose last advance was lost.** All picks in, status still
 *    `live`: nobody is on the clock, so nothing else would ever notice.
 * 4. **Restart a clock that went missing.** A live draft with no deadline
 *    times nobody out and looks perfectly healthy while doing it.
 *
 * And one job it deliberately refuses: **inventing a pick.** If nothing in the
 * pool is legal, or the board has a hole in it, the sweep logs and leaves the
 * draft alone for the commissioner (§7 — the worker dying must corrupt
 * nothing, and neither may the worker running).
 *
 * The clock is injected, and as a *function* rather than a timestamp. A sweep
 * that reached for the wall clock itself could not be tested against a
 * deadline, which is the one thing it exists to do — but a single timestamp
 * taken at the top of the tick would be stale by the time the writes happen,
 * and a tick that overran would stamp the next member a deadline already in the
 * past. So each decision and each write asks for the time where it stands, and
 * a test hands over a clock that does not move.
 */

export type SweepLog = (message: string) => void;

export type SweepInput = {
  readonly pb: PocketBase;
  /** The time, asked for at each decision and each write. Tests pass a fixed one. */
  readonly clock: () => Date;
  readonly log: SweepLog;
  /**
   * Drafts already complained about, so a draft the sweep cannot help is
   * reported once rather than once a second until somebody looks at it. The
   * caller owns the set, because it has to outlive the tick.
   */
  readonly reported?: Set<string>;
  readonly graceMs?: number;
  /**
   * Sweep one draft instead of all of them.
   *
   * The worker never passes this. `tests/e2e/worker.spec.ts` does, and the
   * reason is not tidiness: the sweep is app-global, so a suite run against a
   * developer's own database would happily autodraft into the league they were
   * in the middle of testing by hand. Naming the draft under test keeps a test
   * run from touching anything else.
   */
  readonly onlyDraft?: string;
};

/** What one tick did. Every field is a count of writes, not of considerations. */
export type SweepReport = {
  live: number;
  autopicked: number;
  /** A human beat us to it, or the sweep already had. The index said no; nothing is wrong. */
  raced: number;
  repaired: number;
  finished: number;
  clocksRestarted: number;
  /** Drafts the sweep could not move and would not force. */
  stuck: number;
  /** Drafts that changed under the sweep mid-tick — a pause, or a rollback. */
  moved: number;
  /** Drafts that threw. One bad draft must not stop the others. */
  failed: number;
};

function emptyReport(): SweepReport {
  return {
    live: 0,
    autopicked: 0,
    raced: 0,
    repaired: 0,
    finished: 0,
    clocksRestarted: 0,
    stuck: 0,
    moved: 0,
    failed: 0,
  };
}

/**
 * How many things this tick actually did.
 *
 * `stuck` is not counted: a draft the sweep will not touch is reported once by
 * name and must not make every subsequent tick look eventful.
 */
export function eventCount(report: SweepReport): number {
  return (
    report.autopicked +
    report.raced +
    report.repaired +
    report.finished +
    report.clocksRestarted +
    report.failed
  );
}

/** A candidate for autodraft: what the engine ranks, plus a name for the log. */
type PoolPlayer = EnginePlayer & { readonly name: string };

export async function sweepOnce(input: SweepInput): Promise<SweepReport> {
  const { pb, log } = input;
  const report = emptyReport();
  /**
   * A caller that does not keep a set across ticks — a spec, a script — still
   * gets de-duplication *within* the tick, instead of silently getting one log
   * line per call from a function whose whole job is to log once.
   */
  const reported = input.reported ?? new Set<string>();

  // Only `live` drafts. A paused draft has nobody on the clock by design, and
  // a complete one is history — sweeping either would be the worker overruling
  // a decision the room made.
  const drafts = await pb.collection("drafts").getFullList<DraftRecord>({
    filter: input.onlyDraft
      ? `status = 'live' && id = '${input.onlyDraft}'`
      : "status = 'live'",
    requestKey: null,
  });
  report.live = drafts.length;

  for (const draft of drafts) {
    try {
      const outcome = await sweepDraft(input, draft, report, reported);
      // A draft that the sweep could move is a draft whose earlier complaint is
      // spent. Without this, a commissioner who fixed a gap and later hit the
      // same state again would get no log line for the life of the process.
      if (outcome !== "stuck") forget(reported, draft.id);
    } catch (error) {
      // One league's draft must never take the others down with it: at 10
      // users there may be two drafts running, and the second one's members
      // did nothing wrong.
      report.failed += 1;
      log(`draft ${draft.id} failed: ${describeError(error)}`);
    }
  }

  return report;
}

async function sweepDraft(
  { pb, clock, log, graceMs = AUTOPICK_GRACE_MS }: SweepInput,
  draft: DraftRecord,
  report: SweepReport,
  reported: Set<string>,
): Promise<"handled" | "stuck"> {
  const now = clock();
  const picks = await readPicks(pb, draft.id);

  // Job 2, first, on every live draft: an unadvanced pick makes every reading
  // below it wrong.
  const repaired = await repairUnadvanced(pb, draft, picks, now);
  if (repaired) {
    report.repaired += 1;
    log(
      `draft ${draft.id} · repaired an unadvanced pick → ${repaired.current_pick}`,
    );
    // And that is this draft's one action for this tick. Carrying on would mean
    // reasoning about a record that has just changed under us — which is
    // exactly how the repair came to hand the next member an expired clock, and
    // how a repair that finished a draft advanced it a second time. A second
    // later the next tick reads the draft as it now is, which is cheaper than
    // being clever about it.
    return "handled";
  }

  const state = toState(draft);
  const onClock = whoIsOnClock(state, picks);

  if (!onClock) {
    if (isDraftComplete(state, picks)) {
      // Job 3. Every slot is filled but the draft still says it is live, so
      // the second write of somebody's last pick was lost. Nobody is on the
      // clock, so no other code path will ever look at this draft again.
      await advance(pb, draft, picks, totalPicks(state), now);
      report.finished += 1;
      log(`draft ${draft.id} · every slot filled, closing it`);
      return "handled";
    }
    // A live draft with nobody on the clock and slots still empty means a hole
    // below `current_pick` — an interrupted rollback, most likely. Filling it
    // would be guessing at what the commissioner meant.
    report.stuck += 1;
    reportOnce(
      reported,
      log,
      `${draft.id}:hole`,
      `draft ${draft.id} · live with a gap in the board and nobody on the clock — needs a commissioner`,
    );
    return "stuck";
  }

  if (needsDeadline(draft)) {
    // Job 4. A fresh full clock rather than an instant autopick: the member is
    // not late, the draft lost their deadline.
    await pb
      .collection("drafts")
      .update(
        draft.id,
        { deadline: deadlineFrom(now, draft.pick_seconds) },
        { requestKey: null },
      );
    report.clocksRestarted += 1;
    log(`draft ${draft.id} · live with no deadline, restarted the clock`);
    return "handled";
  }

  const member = await pb
    .collection("league_members")
    .getOne<{ id: string; team_name?: string; autodraft_enabled?: boolean }>(
      onClock.memberId,
      { requestKey: null },
    )
    .catch(() => null);

  const armed = Boolean(member?.autodraft_enabled);
  if (!armed && !isPickDue(draft, clock(), graceMs)) return "handled";

  const league = await pb
    .collection("leagues")
    .getOne<{ settings: unknown }>(draft.league, { requestKey: null });
  const { roster_template: template } = parseLeagueSettings(league.settings);

  const pool = await readPool(pb);
  const roster = await rosterPositionsOf(pb, picks, onClock.memberId);

  const choice = selectAutoPick({
    candidates: pool,
    // Cheat sheets are Phase 3.4 and projections 4.4, so the engine has
    // nothing to rank on and falls through to its own total tiebreak, the
    // player id. Arbitrary, and identical on every replay — which is the
    // property that matters until there is something real to rank on.
    roster,
    template,
    takenPlayerIds: new Set(picks.map((pick) => pick.playerId)),
  });

  if (!choice) {
    // §7: no legal pick is a real outcome, not an error, and the answer is to
    // stop rather than to write something wrong. A roster that cannot be
    // filled from the remaining pool is a commissioner's problem — reduce the
    // template, or ingest the players who are missing.
    report.stuck += 1;
    reportOnce(
      reported,
      log,
      `${draft.id}:${onClock.overallNo}`,
      `draft ${draft.id} · pick ${onClock.overallNo}: no legal player left in the pool — needs a commissioner`,
    );
    return "stuck";
  }

  /**
   * The last look before the write.
   *
   * Between the list read at the top of the tick and this line sit half a dozen
   * queries — the member, the league, the pool, the roster. A pause or a
   * rollback landing in that window must not be written through: `advance`
   * does not touch `status`, so an autopick into a paused draft would leave it
   * paused with a running clock, and a pick above a rollback's target survives
   * that rollback's delete loop and leaves a gap `isDraftComplete` can never
   * fill. `rollbackDraft` pauses *first* precisely to close this door; this is
   * the sweep checking that it is shut.
   *
   * It does not make the race impossible — PocketBase has no transactions —
   * but it shrinks the window from six queries to one, and the unique indexes
   * still refuse a double pick.
   */
  const fresh = await pb
    .collection("drafts")
    .getOne<DraftRecord>(draft.id, { requestKey: null });
  if (fresh.status !== "live" || fresh.current_pick !== draft.current_pick) {
    report.moved += 1;
    log(
      `draft ${draft.id} · moved under the sweep (${fresh.status}, pick ${fresh.current_pick}) — leaving it`,
    );
    return "handled";
  }

  const outcome = await commitPick(pb, {
    draft,
    onClock,
    playerId: choice.id,
    isAuto: true,
    picks,
    now: clock(),
  });

  if (outcome === "raced") {
    // The index refused it, which means the member — or a manager picking for
    // them — got there first. Exactly what the grace period is for.
    report.raced += 1;
    log(`draft ${draft.id} · pick ${onClock.overallNo} was taken first`);
    return "handled";
  }

  report.autopicked += 1;
  log(
    `draft ${draft.id} · pick ${onClock.overallNo} auto · ` +
      `${member?.team_name || onClock.memberId} ← ${nameOf(pool, choice.id)}` +
      `${armed ? " (autodraft armed)" : " (out of time)"}`,
  );
  return "handled";
}

/**
 * The pool the engine ranks, and the room's own definition of draftable —
 * `DRAFTABLE_PLAYERS_FILTER`, shared with `getDraftView` so the sweep cannot
 * pick somebody the room would not have offered.
 *
 * The `sort` is for the log and for a readable database read; it does **not**
 * decide the pick. With no cheat sheet and no projections, `selectAutoPick`
 * falls through to its own total tiebreak — the player id — so the autopick is
 * arbitrary and identical on every replay until Phase 4.4 gives it something
 * real to rank on. (It used to decide the pick, by accident, through a NaN in
 * the engine's comparator that made the id tiebreak dead code. Fixed there,
 * with a test.)
 */
async function readPool(pb: PocketBase): Promise<PoolPlayer[]> {
  const players = await pb
    .collection("players")
    .getFullList<{ id: string; name: string; position: Position }>({
      filter: DRAFTABLE_PLAYERS_FILTER,
      sort: "name",
      requestKey: null,
    });
  return players.map((player) => ({
    id: player.id,
    name: player.name,
    position: player.position,
  }));
}

/**
 * The player's name, for the log line.
 *
 * `selectAutoPick` returns the engine's own shape — id and position — because
 * the engine is not allowed to know that a player has a name. Looking it back
 * up here is a linear scan over ~350 rows once per autodraft, which is nothing,
 * and it keeps the engine's surface as narrow as it should be.
 */
function nameOf(pool: readonly PoolPlayer[], id: string): string {
  return pool.find((player) => player.id === id)?.name ?? id;
}

/** Log a problem the sweep cannot fix once, not once a second. */
function reportOnce(
  reported: Set<string>,
  log: SweepLog,
  key: string,
  message: string,
): void {
  if (reported.has(key)) return;
  reported.add(key);
  log(message);
}

/** Forget a draft's complaints, so the same state can be reported again later. */
function forget(reported: Set<string>, draftId: string): void {
  for (const key of reported) {
    if (key.startsWith(`${draftId}:`)) reported.delete(key);
  }
}
