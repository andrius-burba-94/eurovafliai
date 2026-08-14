/**
 * Eurovafliai worker — the second PM2 app.
 *
 * Phase 0 scaffold: it validates its environment, logs a heartbeat, and shuts
 * down cleanly on SIGTERM/SIGINT (PM2 sends SIGTERM on reload). The real loop
 * arrives in Phase 2.5 and will, every tick:
 *
 *   1. find `live` drafts whose `deadline` has passed → `selectAutoPick` →
 *      run the same pick pipeline as a human pick, with `is_auto: true`;
 *   2. repair any draft left in the "pick created but draft not advanced"
 *      state (see docs/adr/ADR-0003-no-transactions.md);
 *   3. (Phase 4.3) run the nightly stats fetch and standings recompute.
 *
 * It deliberately does NOT import `@/lib/config/server` — that module pulls in
 * `server-only`, which throws outside a React Server Component graph. The
 * schema module is pure and safe to use from plain Node.
 */
import { parseServerEnv } from "../lib/config/schema";

const TICK_MS = 1_000;
const HEARTBEAT_EVERY_TICKS = 60;

function log(message: string): void {
  console.log(`[worker] ${new Date().toISOString()} ${message}`);
}

function main(): void {
  const env = parseServerEnv(process.env);
  log(`starting · PocketBase ${env.PB_INTERNAL_URL} · tick ${TICK_MS}ms`);

  let ticks = 0;
  const timer = setInterval(() => {
    ticks += 1;
    // Phase 2.5 replaces this with the pick-timer sweep.
    if (ticks % HEARTBEAT_EVERY_TICKS === 0) {
      log(`heartbeat · ${ticks} ticks`);
    }
  }, TICK_MS);

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => {
      log(`${signal} received, stopping`);
      clearInterval(timer);
      process.exit(0);
    });
  }
}

main();
