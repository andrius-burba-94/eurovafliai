/** A pick is two writes and a roll one per member: one refresh per burst. */
export const COALESCE_MS = 250;

/**
 * When a live surface re-reads: once per burst of events, never two at once,
 * and never while its tab is hidden.
 *
 * A refresh asked for mid-flight is owed, not dropped — the last game's final
 * whistle may be the last event of the night to heal it — and a hidden tab
 * pays what it owes once, when shown. `run` may return a promise, which
 * settles it; otherwise the caller says `settled()` when the refresh lands.
 */
export function refresher({ run, hidden }: { run: () => Promise<void> | void; hidden: () => boolean }) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight = false;
  let owed = false;

  const fire = () => {
    if (inFlight || hidden()) {
      owed = true;
      return;
    }
    inFlight = true;
    void run()?.finally(settled);
  };
  const shown = () => {
    if (!owed || inFlight) return;
    owed = false;
    fire();
  };
  const settled = () => {
    inFlight = false;
    shown();
  };

  return {
    request: () => {
      clearTimeout(timer);
      timer = setTimeout(fire, COALESCE_MS);
    },
    settled,
    shown,
    dispose: () => clearTimeout(timer),
  };
}

export type Refresher = ReturnType<typeof refresher>;
