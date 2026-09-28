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
