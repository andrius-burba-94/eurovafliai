"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

/**
 * Drag a player onto a place or onto another player — the pointer half of the
 * lineup's tap-to-place. A drop calls the same functions a tap does, so the
 * validator still sees one kind of change.
 *
 * Targets say what they are in `data-drop`: `player:<id>` swaps, `role:<role>`
 * moves. The hit test is the element under the finger, because the targets are
 * discrete cards rather than a list with gaps between rows.
 *
 * A mouse starts dragging after a few pixels. A finger has to hold still first:
 * a touch that moves straight away is the page being scrolled, and taking that
 * away from a phone makes the lineup unscrollable.
 */

export type DropTarget =
  | { kind: "player"; id: string }
  | { kind: "role"; role: string };

const MOUSE_SLOP = 5;
const TOUCH_SLOP = 8;
const HOLD_MS = 280;

type Pending = {
  id: string;
  pointerId: number;
  touch: boolean;
  x: number;
  y: number;
  active: boolean;
  timer: ReturnType<typeof setTimeout> | null;
};

function targetFrom(key: string | null): DropTarget | null {
  if (!key) return null;
  const colon = key.indexOf(":");
  if (colon < 0) return null;
  const kind = key.slice(0, colon);
  const value = key.slice(colon + 1);
  if (kind === "player" && value) return { kind: "player", id: value };
  if (kind === "role") return { kind: "role", role: value };
  return null;
}

export function useDragToPlace(onDrop: (playerId: string, target: DropTarget) => void) {
  const pending = useRef<Pending | null>(null);
  const overRef = useRef<string | null>(null);
  const ghost = useRef<HTMLDivElement | null>(null);
  const suppressClick = useRef(false);
  const dropRef = useRef(onDrop);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  useEffect(() => {
    dropRef.current = onDrop;
  }, [onDrop]);

  const moveGhost = useCallback((x: number, y: number) => {
    if (ghost.current) ghost.current.style.transform = `translate(${x}px, ${y}px) translate(-50%, -110%)`;
  }, []);

  const hitTest = useCallback((x: number, y: number) => {
    const key = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drop]")?.dataset.drop ?? null;
    if (key !== overRef.current) {
      overRef.current = key;
      setOver(key);
    }
  }, []);

  const reset = useCallback(() => {
    const current = pending.current;
    if (current?.timer) clearTimeout(current.timer);
    pending.current = null;
    overRef.current = null;
    setDragging(null);
    setOver(null);
  }, []);

  const activate = useCallback((x: number, y: number) => {
    const current = pending.current;
    if (!current) return;
    current.active = true;
    setDragging(current.id);
    // The ghost mounts on the next render; place it once it exists.
    requestAnimationFrame(() => moveGhost(x, y));
    hitTest(x, y);
  }, [hitTest, moveGhost]);

  useEffect(() => {
    function onMove(event: PointerEvent): void {
      const current = pending.current;
      if (!current || event.pointerId !== current.pointerId) return;
      const moved = Math.hypot(event.clientX - current.x, event.clientY - current.y);
      if (!current.active) {
        if (current.touch) {
          if (moved > TOUCH_SLOP) reset();
          return;
        }
        if (moved < MOUSE_SLOP) return;
        activate(event.clientX, event.clientY);
      }
      moveGhost(event.clientX, event.clientY);
      hitTest(event.clientX, event.clientY);
    }
    function onUp(event: PointerEvent): void {
      const current = pending.current;
      if (!current || event.pointerId !== current.pointerId) return;
      if (current.active) {
        const target = targetFrom(overRef.current);
        suppressClick.current = true;
        setTimeout(() => {
          suppressClick.current = false;
        }, 0);
        if (target && !(target.kind === "player" && target.id === current.id)) {
          dropRef.current(current.id, target);
        }
      }
      reset();
    }
    function onTouchMove(event: TouchEvent): void {
      if (pending.current?.active) event.preventDefault();
    }
    function onClick(event: MouseEvent): void {
      if (!suppressClick.current) return;
      event.preventDefault();
      event.stopPropagation();
    }
    function onContextMenu(event: Event): void {
      if (pending.current) event.preventDefault();
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", reset);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("click", onClick, true);
    window.addEventListener("contextmenu", onContextMenu);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", reset);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("contextmenu", onContextMenu);
    };
  }, [activate, hitTest, moveGhost, reset]);

  const handle = useCallback((playerId: string) => ({
    onPointerDown(event: ReactPointerEvent<HTMLElement>) {
      if (event.button !== 0 || pending.current) return;
      const touch = event.pointerType === "touch";
      const start: Pending = {
        id: playerId,
        pointerId: event.pointerId,
        touch,
        x: event.clientX,
        y: event.clientY,
        active: false,
        timer: null,
      };
      if (touch) start.timer = setTimeout(() => activate(start.x, start.y), HOLD_MS);
      pending.current = start;
    },
    onDragStart(event: { preventDefault(): void }) {
      event.preventDefault();
    },
  }), [activate]);

  const ghostRef = useCallback((node: HTMLDivElement | null) => {
    ghost.current = node;
  }, []);

  return { dragging, over, ghostRef, handle };
}

export type DragState = {
  readonly dragging: string | null;
  readonly over: string | null;
  readonly handle: ReturnType<typeof useDragToPlace>["handle"];
};
