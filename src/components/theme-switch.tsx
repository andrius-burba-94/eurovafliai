"use client";

import { useEffect, useSyncExternalStore } from "react";

import { Menu } from "@/components/menu";
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
 * applies it here and on every later load. `popover` is one 44px button for
 * the sidebar's last row, where a second row would push the nav into a
 * scroll; it opens the three upward. `segmented` spells the three out where
 * there is room (the phone's More).
 */
export function ThemeSwitch({ testId, variant }: { testId: string; variant: "popover" | "segmented" }) {
  const choice = useThemeChoice();

  if (variant === "popover") {
    return (
      <div data-testid={testId} data-choice={choice} className="shrink-0">
        <Menu
          testId={`${testId}-button`}
          label={
            <>
              <ThemeIcon choice={choice} />
              <span className="sr-only">Theme: {LABEL[choice]}</span>
            </>
          }
          buttonClassName="grid size-11 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink aria-expanded:bg-ink/5 aria-expanded:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
          panelClassName="popover-rise absolute right-0 bottom-full z-50 mb-2 flex w-44 origin-bottom-right flex-col gap-0.5 rounded-xl border border-panel-border bg-stock-panel p-1.5"
        >
          <p className="slot-label px-2.5 pt-1 pb-1.5">Theme</p>
          {THEME_CHOICES.map((option) => {
            const held = choice === option;
            return (
              <button
                key={option}
                type="button"
                data-close=""
                data-testid={`${testId}-${option}`}
                aria-pressed={held}
                onClick={() => choose(option)}
                className={`flex min-h-11 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-live ${
                  held ? "bg-stock-high font-semibold text-ink" : "text-ink-soft hover:bg-ink/5 hover:text-ink"
                }`}
              >
                <ThemeIcon choice={option} />
                <span className="flex-1 text-left">{LABEL[option]}</span>
                {held ? (
                  <svg aria-hidden="true" viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" className="text-live">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                ) : null}
              </button>
            );
          })}
        </Menu>
      </div>
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
