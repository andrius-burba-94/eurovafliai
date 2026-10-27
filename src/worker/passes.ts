import type PocketBase from "pocketbase";
import { ClientResponseError, isTokenExpired } from "pocketbase";

import { describeError } from "@/lib/drafts/pipeline";

type Log = (message: string, level?: "info" | "warn" | "error") => void;

/** Renew this long before expiry, so no pass starts on a token that lapses mid-pass. */
const RENEW_BEFORE_S = 10 * 60;

/**
 * The worker's one superuser session, shared by every pass.
 *
 * The token is never cleared. A guest client is not refused a list: rules
 * like `@request.auth.id != ""` hand it 200 and no rows, so one pass dropping
 * the auth over a feed outage made every concurrent pass read an empty table
 * and write from it. A rejected token only marks the session stale, and the
 * next `ensure` replaces it — one login however many passes ask at once.
 */
export function superuserSession(pb: PocketBase, login: () => Promise<unknown>, log: Log) {
  let stale = false;
  let pending: Promise<void> | null = null;
  return {
    ensure(): Promise<void> {
      if (!stale && !isTokenExpired(pb.authStore.token, RENEW_BEFORE_S)) return Promise.resolve();
      pending ??= login()
        .then(() => {
          stale = false;
          log("authenticated as superuser");
        })
        .finally(() => {
          pending = null;
        });
      return pending;
    },
    /** Only PocketBase refusing the token is an auth problem; a feed outage is not. */
    noteFailure(error: unknown): void {
      if (error instanceof ClientResponseError && (error.status === 401 || error.status === 403)) stale = true;
    },
  };
}

type Session = Pick<ReturnType<typeof superuserSession>, "ensure" | "noteFailure">;

/** Passes that must never write at once share one. */
export type PassLock = { current: Promise<void> | null };

export type PassSpec = {
  readonly name: string;
  readonly firstAfterMs: number;
  /** 0 runs it once. */
  readonly everyMs: number;
  /** Why the pass is off, logged instead of scheduling it. */
  readonly off?: string | false;
  readonly on?: string;
  readonly lock?: PassLock;
  readonly run: () => Promise<void>;
};

/**
 * Every pass but the sweep: each on its own in-flight guard, so a slow feed
 * delays nothing but itself, failures counted and logged at most once a
 * minute, and every pass in flight reachable from shutdown.
 */
export function createPasses({ log, auth }: { log: Log; auth: Session }) {
  const timers: ReturnType<typeof setTimeout>[] = [];
  const running = new Set<Promise<void>>();
  let stopping = false;

  function schedule(spec: PassSpec): void {
    if (spec.off) {
      log(spec.off);
      return;
    }
    if (spec.on) log(spec.on);
    const lock = spec.lock ?? { current: null };
    const logEvery = spec.everyMs > 0 ? Math.max(1, Math.round(60_000 / spec.everyMs)) : 1;
    let failures = 0;
    const fire = () => {
      if (stopping || lock.current) return;
      const pass: Promise<void> = (async () => {
        try {
          await auth.ensure();
          await spec.run();
          if (failures > 0) log(`${spec.name} recovered after ${failures} failed pass(es)`);
          failures = 0;
        } catch (error) {
          failures += 1;
          auth.noteFailure(error);
          if (failures === 1 || failures % logEvery === 0) {
            log(`${spec.name} failed (${failures} in a row): ${describeError(error)}`, "error");
          }
        }
      })().finally(() => {
        lock.current = null;
        running.delete(pass);
      });
      lock.current = pass;
      running.add(pass);
    };
    timers.push(
      setTimeout(() => {
        fire();
        if (spec.everyMs > 0) timers.push(setInterval(fire, spec.everyMs));
      }, spec.firstAfterMs),
    );
  }

  /** Stop starting passes and wait for those in flight; false if the deadline came first. */
  async function drain(deadlineMs: number, also: readonly (Promise<void> | null)[] = []): Promise<boolean> {
    stopping = true;
    for (const timer of timers) clearTimeout(timer);
    const settled = Promise.allSettled([...running, ...also]).then(() => true);
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<false>((resolve) => {
      deadline = setTimeout(() => resolve(false), deadlineMs);
    });
    const done = await Promise.race([settled, late]);
    clearTimeout(deadline);
    return done;
  }

  return { schedule, drain };
}
