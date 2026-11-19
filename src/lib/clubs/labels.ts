/**
 * The code a club wears on screen: the feed's `tvCode` (E2026 clubs
 * endpoint), the one EuroLeague broadcasts print. The feed's own `code` stays
 * the key everywhere else — joins, crests, colours — because it is what box
 * scores and schedules carry; it only stops being the word people read.
 */
const CLUB_LABELS: Readonly<Record<string, string>> = {
  BAS: "KBA",
  BES: "BJK",
  IST: "EFS",
  MAD: "RMB",
  MUN: "BAY",
  PAM: "VBC",
  PAN: "PAO",
  PRS: "PBB",
  RED: "CZV",
  TEL: "MTA",
  ULK: "FBT",
};

/** A club's on-screen code; a club whose two codes agree, or one this season has not met, reads as given. */
export function clubLabel(code: string): string;
export function clubLabel(code: string | null | undefined): string | null | undefined;
export function clubLabel(code: string | null | undefined): string | null | undefined {
  if (!code) return code;
  return CLUB_LABELS[code.toUpperCase()] ?? code;
}
