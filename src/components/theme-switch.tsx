"use client";

import { useEffect, useSyncExternalStore } from "react";

import { GROUND_COLOR, THEME_CHOICES, themeChoiceFrom, themeCookie, type Ground, type ThemeChoice } from "@/lib/theme";

const LABEL: Readonly<Record<ThemeChoice, string>> = { system: "System", light: "Light", dark: "Dark" };

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-theme-choice"] });
  return () => observer.disconnect();
}

const choiceNow = () => themeChoiceFrom(`theme=${document.documentElement.dataset.themeChoice ?? ""}`);

/** The browser's status bar follows the ground the page is drawn in, not only the device. */
function paintStatusBar() {
  const ground = (document.documentElement.dataset.theme ?? "dark") as Ground;
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.content = GROUND_COLOR[ground] ?? GROUND_COLOR.dark;
  }
}

function choose(next: ThemeChoice) {
  document.cookie = themeCookie(next);
  (window as Window & { __applyTheme?: () => void }).__applyTheme?.();
}

function useThemeChoice(): ThemeChoice {
  const choice = useSyncExternalStore(subscribe, choiceNow, () => "system" as ThemeChoice);
  useEffect(() => {
    paintStatusBar();
    return subscribe(paintStatusBar);
  }, []);
  return choice;
}

/**
 * System, Light or Dark for this browser; the head script in layout.tsx
 * applies it here and on every later load. `cycle` is one 44px button for the
 * sidebar's last row, where a second row would push the nav into a scroll;
 * `segmented` spells the three out where there is room (the phone's More).
 */
export function ThemeSwitch({ testId, variant }: { testId: string; variant: "cycle" | "segmented" }) {
  const choice = useThemeChoice();

  if (variant === "cycle") {
    const next = THEME_CHOICES[(THEME_CHOICES.indexOf(choice) + 1) % THEME_CHOICES.length]!;
    return (
      <button
        type="button"
        data-testid={testId}
        data-choice={choice}
        onClick={() => choose(next)}
        title={`Theme: ${LABEL[choice]}`}
        aria-label={`Theme: ${LABEL[choice]}. Switch to ${LABEL[next]}`}
        className="grid size-11 shrink-0 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
      >
        <ThemeIcon choice={choice} />
      </button>
    );
  }

  return (
    <fieldset data-testid={testId} data-choice={choice} className="flex flex-col gap-1">
      <legend className="sr-only">Theme</legend>
      <div className="grid grid-cols-3 gap-0.5 rounded-lg border border-panel-border p-0.5">
        {THEME_CHOICES.map((option) => (
          <label
            key={option}
            className={`relative flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-live ${
              choice === option ? "bg-stock-high font-semibold text-ink" : "text-ink-soft hover:text-ink"
            }`}
          >
            <input
              type="radio"
              name={`${testId}-theme`}
              value={option}
              checked={choice === option}
              onChange={() => choose(option)}
              data-testid={`${testId}-${option}`}
              className="sr-only"
            />
            <ThemeIcon choice={option} />
            {LABEL[option]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ThemeIcon({ choice }: { choice: ThemeChoice }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      {choice === "system" ? (
        <>
          <rect x="3" y="4" width="18" height="12" rx="2" />
          <path d="M8 20h8M12 16v4" />
        </>
      ) : choice === "light" ? (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </>
      ) : (
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
      )}
    </svg>
  );
}
