"use client";

import Image from "next/image";
import { useState } from "react";

import { clubLabel } from "@/lib/clubs/labels";

const SAFE_CODE = /^[A-Za-z0-9]{2,12}$/;

export function PlayerPortrait({
  personCode,
  name,
  className = "",
}: {
  personCode?: string | null;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const available = personCode && SAFE_CODE.test(personCode) && !failed;
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span className={`player-portrait ${className}`} aria-hidden="true">
      <span className="player-portrait-fallback">{initial}</span>
      {available ? (
        <Image
          src={`/media/E2026/players/${personCode}.webp`}
          alt=""
          width={80}
          height={88}
          unoptimized
          onError={() => setFailed(true)}
        />
      ) : null}
    </span>
  );
}

export function ClubCrest({
  clubCode,
  className = "",
}: {
  clubCode?: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const available = clubCode && SAFE_CODE.test(clubCode) && !failed;
  return (
    <span className={`club-crest ${className}`} aria-hidden="true">
      {available ? null : <span className="club-crest-fallback">{clubLabel(clubCode)?.slice(0, 3) ?? ""}</span>}
      {available ? (
        <Image
          src={`/media/E2026/clubs/${clubCode}.png`}
          alt=""
          width={48}
          height={48}
          unoptimized
          onError={() => setFailed(true)}
        />
      ) : null}
    </span>
  );
}

/**
 * A club's crest at scoreboard size, whole (object-contain) on its light plate
 * (`crest-plate`): several crests carry a sponsor's wordmark, so any crop reads
 * as a fragment, and some are drawn in dark ink that vanishes on the dark
 * theme. Nothing at all when the image is missing — an empty plate, or a club
 * code blown up to this size, reads as a mistake, and the name sits beside it.
 */
export function ClubCrestMark({ clubCode, className = "" }: { clubCode?: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!clubCode || !SAFE_CODE.test(clubCode) || failed) return null;
  return (
    <span aria-hidden="true" className={`crest-plate pointer-events-none grid place-items-center rounded-card p-2 select-none sm:p-2.5 ${className}`}>
      <Image
        src={`/media/E2026/clubs/${clubCode}.png`}
        alt=""
        width={256}
        height={256}
        unoptimized
        onError={() => setFailed(true)}
        className="size-full object-contain"
      />
    </span>
  );
}
