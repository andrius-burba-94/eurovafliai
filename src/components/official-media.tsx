"use client";

import Image from "next/image";
import { useState, type CSSProperties } from "react";

import { clubColor } from "@/lib/clubs/colors";
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
 * A club's crest at scoreboard size: whole (object-contain, never cropped, since
 * several crests carry a sponsor's wordmark) inside the club's medallion, a
 * light roundel ringed in the club's colour that reads the same in both themes.
 * Without an image the medallion prints the club's code, as a member's crest
 * prints its monogram.
 */
export function ClubCrestMark({ clubCode, className = "" }: { clubCode: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const available = SAFE_CODE.test(clubCode) && !failed;
  return (
    <span
      aria-hidden="true"
      className={`club-medallion pointer-events-none grid shrink-0 place-items-center overflow-hidden rounded-full select-none ${className}`}
      style={{ "--club": clubColor(clubCode) } as CSSProperties}
    >
      {available ? (
        <Image
          src={`/media/E2026/clubs/${clubCode}.png`}
          alt=""
          width={192}
          height={192}
          unoptimized
          onError={() => setFailed(true)}
          className="size-[70%] object-contain"
        />
      ) : (
        <span className="display text-[1.375em] leading-none">{clubLabel(clubCode)}</span>
      )}
    </span>
  );
}
