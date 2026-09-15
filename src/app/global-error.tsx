"use client";

import { useEffect } from "react";

import { archivo } from "@/app/font";
import "./globals.css";
import {
  Correction,
  retryButtonStyles,
  Sheet,
  TopRail,
} from "@/components/board";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[ui] unhandled root error", error);
  }, [error]);

  return (
    // This file replaces the root layout entirely, so it used to need its own
    // copy of the ground the reader chose. Phase 10 left one ground, declared
    // in CSS, so the page that appears when everything else has failed gets it
    // for free — which is the right direction for this particular page.
    <html lang="en" className={`${archivo.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-stock text-ink">
        <TopRail />
        <Sheet testId="root-error">
          <h1 className="text-3xl font-semibold uppercase tracking-[0.04em]">
            The board could not load
          </h1>
          <Correction>
            A fault reached the app shell. No pick was changed.
          </Correction>
          <button type="button" onClick={retry} className={retryButtonStyles}>
            Try again
          </button>
        </Sheet>
      </body>
    </html>
  );
}
