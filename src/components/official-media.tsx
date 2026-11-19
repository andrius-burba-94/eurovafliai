"use client";

import Image from "next/image";
import { useState } from "react";

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
      <span className="club-crest-fallback">{clubCode?.slice(0, 3) ?? ""}</span>
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
 * A club's crest as a scoreboard's backdrop: large, decorative, and nothing at
 * all when the image is missing — a club code blown up to backdrop size would
 * read as a word, not a crest.
 */
export function ClubCrestMark({ clubCode, className = "" }: { clubCode?: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!clubCode || !SAFE_CODE.test(clubCode) || failed) return null;
  return (
    <Image
      src={`/media/E2026/clubs/${clubCode}.png`}
      alt=""
      aria-hidden="true"
      width={256}
      height={256}
      unoptimized
      onError={() => setFailed(true)}
      className={`pointer-events-none object-contain select-none ${className}`}
    />
  );
}
