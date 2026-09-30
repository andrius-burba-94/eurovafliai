import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { archivo, barlow, saira, shoulders } from "./fonts";
import { Gallery } from "./gallery";
import "./concepts.css";

export const metadata: Metadata = { title: "Matchnight concepts · Eurovafliai" };

/**
 * The redesign's approval gallery (S0). Invented data only, and never served
 * by a production build unless someone deliberately sets CONCEPTS=on.
 */
export default function ConceptsPage() {
  if (process.env.NODE_ENV === "production" && process.env.CONCEPTS !== "on") notFound();
  return (
    <div className={`${barlow.variable} ${saira.variable} ${shoulders.variable} ${archivo.variable}`}>
      <Suspense>
        <Gallery />
      </Suspense>
    </div>
  );
}
