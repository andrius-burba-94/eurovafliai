import { describe, expect, it } from "vitest";

import { groundOf, THEME_SCRIPT, themeChoiceFrom, themeCookie, type ThemeChoice } from "./theme";

function runScript(cookie: string, deviceLight: boolean) {
  const dataset: Record<string, string> = {};
  const listeners: (() => void)[] = [];
  const query = { matches: deviceLight, addEventListener: (_: string, fn: () => void) => listeners.push(fn) };
  const fakeWindow: Record<string, unknown> = {};
  new Function("document", "matchMedia", "window", THEME_SCRIPT)(
    { documentElement: { dataset }, cookie },
    () => query,
    fakeWindow,
  );
  return { dataset, listeners, query, fakeWindow };
}

describe("theme choice", () => {
  it("reads the cookie and falls back to System", () => {
    expect(themeChoiceFrom("a=1; theme=light; b=2")).toBe("light");
    expect(themeChoiceFrom("theme=dark")).toBe("dark");
    expect(themeChoiceFrom("theme=purple")).toBe("system");
    expect(themeChoiceFrom("")).toBe("system");
    expect(themeChoiceFrom("notheme=light")).toBe("system");
  });

  it("System follows the device; Light and Dark hold", () => {
    expect(groundOf("system", true)).toBe("light");
    expect(groundOf("system", false)).toBe("dark");
    expect(groundOf("dark", true)).toBe("dark");
    expect(groundOf("light", false)).toBe("light");
  });

  it("keeps the choice for a year on every path", () => {
    expect(themeCookie("dark")).toBe("theme=dark; Path=/; Max-Age=31536000; SameSite=Lax");
  });
});

describe("the head script", () => {
  const cases: [string, boolean][] = [
    ["", true],
    ["", false],
    ["theme=light", false],
    ["theme=dark", true],
    ["x=1; theme=system", true],
    ["theme=bogus", false],
  ];

  it.each(cases)("agrees with the module for cookie %j, device light %s", (cookie, deviceLight) => {
    const { dataset } = runScript(cookie, deviceLight);
    const choice: ThemeChoice = themeChoiceFrom(cookie);
    expect(dataset.themeChoice).toBe(choice);
    expect(dataset.theme).toBe(groundOf(choice, deviceLight));
  });

  it("follows a device change only while the choice is System", () => {
    const system = runScript("", false);
    system.query.matches = true;
    system.listeners.forEach((fn) => fn());
    expect(system.dataset.theme).toBe("light");

    const held = runScript("theme=dark", false);
    held.query.matches = true;
    held.listeners.forEach((fn) => fn());
    expect(held.dataset.theme).toBe("dark");
  });
});
