import { describe, expect, it } from "vitest";

import {
  ATTRIBUTE,
  otherTheme,
  overrideFor,
  resolveTheme,
  THEME_KEY,
  THEME_SCRIPT,
} from "./theme";

describe("which ground is in force", () => {
  it("follows the system when nothing is stored", () => {
    expect(resolveTheme({ stored: null, systemPrefersNight: true })).toBe(
      "night",
    );
    expect(resolveTheme({ stored: null, systemPrefersNight: false })).toBe(
      "day",
    );
  });

  it("lets an explicit choice beat the system, in both directions", () => {
    expect(resolveTheme({ stored: "day", systemPrefersNight: true })).toBe(
      "day",
    );
    expect(resolveTheme({ stored: "night", systemPrefersNight: false })).toBe(
      "night",
    );
  });

  it("ignores a stored value that is not a ground", () => {
    // Somebody else's key, an old value, a half-written string — none of them
    // may decide what the app looks like.
    for (const junk of ["", "dark", "Night", "true", "{}"]) {
      expect(resolveTheme({ stored: junk, systemPrefersNight: false })).toBe(
        "day",
      );
    }
  });
});

describe("what gets persisted", () => {
  it("stores a choice that disagrees with the system", () => {
    expect(overrideFor({ chosen: "night", systemPrefersNight: false })).toBe(
      "night",
    );
    expect(overrideFor({ chosen: "day", systemPrefersNight: true })).toBe(
      "day",
    );
  });

  it("clears the override when the choice is what the system already wants", () => {
    // The whole reason this is a function rather than a `setItem`: without it
    // there is no way back to "follow my phone" except clearing site data, and
    // a tap made in July would still be deciding the ground in December.
    expect(overrideFor({ chosen: "night", systemPrefersNight: true })).toBeNull();
    expect(overrideFor({ chosen: "day", systemPrefersNight: false })).toBeNull();
  });

  it("round-trips: choosing the other ground twice leaves nothing stored", () => {
    const system = false;
    const first = overrideFor({ chosen: "night", systemPrefersNight: system });
    expect(resolveTheme({ stored: first, systemPrefersNight: system })).toBe(
      "night",
    );
    const second = overrideFor({
      chosen: otherTheme("night"),
      systemPrefersNight: system,
    });
    expect(second).toBeNull();
    expect(resolveTheme({ stored: second, systemPrefersNight: system })).toBe(
      "day",
    );
  });
});

describe("the script that runs before first paint", () => {
  it("reads the same key the control writes", () => {
    expect(THEME_SCRIPT).toContain(JSON.stringify(THEME_KEY));
  });

  it("writes CSS's words, not ours", () => {
    // `globals.css` matches `[data-theme="dark"]`; the app's word is "night".
    expect(ATTRIBUTE.night).toBe("dark");
    expect(ATTRIBUTE.day).toBe("light");
    expect(THEME_SCRIPT).toContain('"dark"');
    expect(THEME_SCRIPT).toContain('"light"');
  });

  it("applies an explicit override only, leaving the system to CSS", () => {
    // If this script also resolved the system preference, a reader with
    // JavaScript off would get the day board on a night phone — and an OS
    // switching at 21:00 would not reach a page that is already open.
    expect(THEME_SCRIPT).not.toContain("matchMedia");
    expect(THEME_SCRIPT).not.toContain("prefers-color-scheme");
  });

  it("survives a browser that refuses storage", () => {
    // Safari in lockdown throws on `localStorage` rather than returning null,
    // and a theme preference must never be what stops the room rendering.
    expect(THEME_SCRIPT).toMatch(/try\{[\s\S]*\}catch\(e\)\{\}$/);
  });

  it("runs as written", () => {
    const setAttribute = (name: string, value: string) => {
      calls.push([name, value]);
    };
    const calls: [string, string][] = [];
    const run = (stored: string | null) =>
      new Function(
        "localStorage",
        "document",
        THEME_SCRIPT,
      )({ getItem: () => stored }, { documentElement: { setAttribute } });

    run("night");
    expect(calls).toEqual([["data-theme", "dark"]]);

    calls.length = 0;
    run("day");
    expect(calls).toEqual([["data-theme", "light"]]);

    calls.length = 0;
    run(null);
    run("nonsense");
    expect(calls).toEqual([]);
  });
});
