/**
 * The league reads every clock in Lithuanian time, so one zone formats every
 * tip-off and every "updated at". Pure: the instant is passed in.
 */
export const LEAGUE_TIME_ZONE = "Europe/Vilnius";

const TIP_OFF = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: LEAGUE_TIME_ZONE,
});

const CLOCK = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: LEAGUE_TIME_ZONE,
});

/** "Thu 1 Oct, 20:30", or null for a missing or unreadable instant. */
export function formatTipOff(value: string | number | undefined | null): string | null {
  const time = typeof value === "number" ? value : Date.parse(value ?? "");
  return Number.isFinite(time) ? TIP_OFF.format(time) : null;
}

/** "20:30" in league time, or null. */
export function formatClock(value: string | number | undefined | null): string | null {
  const time = typeof value === "number" ? value : Date.parse(value ?? "");
  return Number.isFinite(time) ? CLOCK.format(time) : null;
}
