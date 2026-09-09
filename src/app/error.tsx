"use client";

import { useEffect } from "react";

import {
  Correction,
  retryButtonStyles,
  Sheet,
  TopRail,
} from "@/components/board";

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
        <button type="button" onClick={retry} className={retryButtonStyles}>
          Try again
        </button>
      </Sheet>
    </>
  );
}
