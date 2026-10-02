"use client";

import { useLayoutEffect, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

const GAP = 6;
const EDGE = 8;
const noSubscribe = () => () => {};

export type FloatingPlace = { readonly top: number; readonly left: number; readonly above: boolean };

/**
 * Where a small floating box goes beside its anchor: below it unless the
 * screen has no room there, starting at the anchor's left edge unless that
 * runs off the right. Pure, so it is measured in a unit test rather than by eye.
 */
export function placeFloating(
  anchor: { readonly top: number; readonly bottom: number; readonly left: number; readonly right: number },
  box: { readonly width: number; readonly height: number },
  screen: { readonly width: number; readonly height: number },
  align: "start" | "center" = "start",
): FloatingPlace {
  const below = anchor.bottom + GAP;
  const above = below + box.height > screen.height - EDGE && anchor.top - GAP - box.height >= EDGE;
  const wanted = align === "center" ? (anchor.left + anchor.right) / 2 - box.width / 2 : anchor.left;
  const left = Math.max(EDGE, Math.min(wanted, screen.width - EDGE - box.width));
  return { top: above ? anchor.top - GAP - box.height : below, left, above };
}

/**
 * A box drawn on `document.body`, fixed beside `anchor`, so no `overflow-hidden`
 * parent can clip it. It follows the anchor through scrolls and resizes while
 * shown. Rendered only after mount: the server has no body to portal into.
 */
export function Floating({
  anchor,
  shown,
  align = "start",
  id,
  role,
  className,
  testId,
  children,
}: {
  anchor: RefObject<HTMLElement | null>;
  shown: boolean;
  align?: "start" | "center";
  id?: string;
  role?: string;
  className: string;
  testId?: string;
  children: ReactNode;
}) {
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  const [box, setBox] = useState<HTMLSpanElement | null>(null);
  const [place, setPlace] = useState<FloatingPlace | null>(null);

  useLayoutEffect(() => {
    if (!shown || !box) return;
    const update = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      setPlace(
        placeFloating(rect, { width: box.offsetWidth, height: box.offsetHeight }, { width: window.innerWidth, height: window.innerHeight }, align),
      );
    };
    update();
    window.addEventListener("scroll", update, { capture: true, passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, { capture: true });
      window.removeEventListener("resize", update);
    };
  }, [shown, box, anchor, align]);

  if (!mounted) return null;
  return createPortal(
    <span
      ref={setBox}
      role={role}
      id={id}
      data-testid={testId}
      data-above={place?.above ? "" : undefined}
      style={{ top: place?.top ?? 0, left: place?.left ?? 0 }}
      className={`floating fixed z-50 ${className} ${shown && place ? "visible opacity-100" : "pointer-events-none invisible opacity-0"}`}
    >
      {children}
    </span>,
    document.body,
  );
}
