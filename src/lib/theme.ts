/**
 * The reader's ground: System follows the device, Light and Dark hold. Kept
 * in a cookie the browser reads before first paint, so a reload never flashes
 * the other ground.
 */
export const THEME_CHOICES = ["system", "light", "dark"] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];
export type Ground = "light" | "dark";

export const THEME_COOKIE = "theme";

/** The status-bar colour of each ground, the `stock` token in hex. */
export const GROUND_COLOR: Readonly<Record<Ground, string>> = { dark: "#0b0f18", light: "#f3f4f7" };

export function themeChoiceFrom(cookie: string): ThemeChoice {
  const value = /(?:^|;\s*)theme=([a-z]+)/.exec(cookie)?.[1];
  return THEME_CHOICES.find((choice) => choice === value) ?? "system";
}

export function groundOf(choice: ThemeChoice, deviceLight: boolean): Ground {
  return choice === "system" ? (deviceLight ? "light" : "dark") : choice;
}

export function themeCookie(choice: ThemeChoice): string {
  return `${THEME_COOKIE}=${choice}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

/**
 * Runs in `<head>` before the body paints. It cannot import, so it repeats
 * `themeChoiceFrom` and `groundOf` in plain script; `theme.test.ts` runs it
 * against both and fails if they part ways.
 */
export const THEME_SCRIPT = `(function(){try{var d=document.documentElement,q=matchMedia("(prefers-color-scheme: light)");function apply(){var m=/(?:^|;\\s*)theme=(light|dark|system)/.exec(document.cookie),c=m?m[1]:"system";d.dataset.themeChoice=c;d.dataset.theme=c==="system"?(q.matches?"light":"dark"):c;}apply();q.addEventListener("change",apply);window.__applyTheme=apply;}catch(e){}})();`;
