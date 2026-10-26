"use client";

import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();

/** This tab's writes, and other tabs' through `storage`, which never fires in the writer. */
export function subscribeStored(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** Null when storage is denied, which every caller reads as "nothing stored". */
export function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode or a full quota: the value lasts as long as this page does.
  }
  for (const listener of listeners) listener();
}

/**
 * A per-viewer value in `localStorage`, read through `useSyncExternalStore`:
 * its server snapshot (`null`) hydrates without a mismatch, and it is not a
 * `setState` inside an effect, which this repo's lint rule refuses.
 */
export function useStored(key: string): string | null {
  return useSyncExternalStore(subscribeStored, () => readStored(key), () => null);
}
