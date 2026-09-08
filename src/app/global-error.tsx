"use client";

import { useEffect } from "react";
import "./globals.css";

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
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-stock text-ink">
        <main className="mx-auto flex min-h-svh w-full max-w-xl flex-col justify-center gap-6 px-4 py-8">
          <h1 className="text-3xl font-semibold uppercase tracking-[0.04em]">
            The board could not load
          </h1>
          <p className="slot-correction px-3 py-3 text-sm">
            A fault reached the app shell. No pick was changed.
          </p>
          <button
            type="button"
            onClick={retry}
            className="min-h-11 w-full border-2 border-live px-4 py-3 text-slot font-semibold uppercase tracking-[0.14em] text-live focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live sm:w-auto"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
