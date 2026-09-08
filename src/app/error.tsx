"use client";

import { useEffect } from "react";

import { Correction, Sheet, TopRail } from "@/components/board";

export default function ErrorBoundary({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[ui] unhandled route error", error);
  }, [error]);

  return (
    <>
      <TopRail />
      <Sheet testId="route-error">
        <Correction testId="route-error-message">
          Something on this page broke. The board itself is unchanged.
        </Correction>
        <button
          type="button"
          onClick={retry}
          className="min-h-11 w-full border-2 border-live px-4 py-3 text-slot font-semibold uppercase tracking-[0.14em] text-live focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live sm:w-auto"
        >
          Try again
        </button>
      </Sheet>
    </>
  );
}
