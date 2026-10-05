"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const FEATURES = [
  {
    title: "Create a league",
    body: "Set up your league and share its invite code with friends.",
  },
  {
    title: "Draft live",
    body: "Make your picks together as the board updates for everyone.",
  },
  {
    title: "Follow the season",
    body: "See fantasy points and standings throughout the EuroLeague season.",
  },
] as const;

const ROTATION_MS = 7_000;
const MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToMotion(onChange: () => void) {
  const query = window.matchMedia(MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function prefersReducedMotion() {
  return window.matchMedia(MOTION_QUERY).matches;
}

export function WelcomeCarousel() {
  const sectionRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const [inView, setInView] = useState(false);
  const [rotation, setRotation] = useState<"auto" | "playing" | "paused">("auto");
  const reducedMotion = useSyncExternalStore(
    subscribeToMotion,
    prefersReducedMotion,
    () => true,
  );
  const playing = rotation === "playing" || (rotation === "auto" && !reducedMotion);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(Boolean(entry?.isIntersecting)),
      { threshold: 0.5 },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!playing || !inView) return;
    const timer = window.setInterval(
      () => setActive((current) => (current + 1) % FEATURES.length),
      ROTATION_MS,
    );
    return () => window.clearInterval(timer);
  }, [playing, inView]);

  const stop = () => setRotation("paused");

  return (
    <section
      ref={sectionRef}
      className="welcome-details"
      aria-labelledby="welcome-details-title"
      data-testid="welcome-carousel"
      onFocusCapture={stop}
      onMouseEnter={stop}
    >
      <div className="welcome-details-inner">
        <div className="welcome-details-controls">
          <h2 id="welcome-details-title" className="welcome-details-label">
            How it works
          </h2>
          <div className="welcome-controls-row">
            <div className="welcome-bubbles" role="group" aria-label="How it works pages">
              {FEATURES.map((feature, index) => (
                <button
                  key={feature.title}
                  type="button"
                  className="welcome-bubble"
                  data-testid={`welcome-bubble-${index + 1}`}
                  aria-label={`Show ${feature.title}`}
                  aria-pressed={active === index}
                  aria-controls="welcome-feature-panel"
                  onClick={() => {
                    setActive(index);
                    stop();
                  }}
                >
                  {index + 1}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="welcome-rotation"
              data-testid="welcome-rotation"
              aria-label={playing ? "Pause automatic pages" : "Play automatic pages"}
              onClick={() => setRotation(playing ? "paused" : "playing")}
            >
              {playing ? "Pause" : "Play"}
            </button>
          </div>
        </div>

        <div
          id="welcome-feature-panel"
          className="welcome-feature"
          data-testid="welcome-feature-panel"
          aria-live={playing ? "off" : "polite"}
          aria-atomic="true"
        >
          <div key={active} className="welcome-feature-copy">
            <h3>{FEATURES[active]!.title}</h3>
            <p>{FEATURES[active]!.body}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
