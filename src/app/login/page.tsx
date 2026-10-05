import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Correction } from "@/components/board";
import { SubmitButton } from "@/components/submit-button";
import { startGoogleLogin } from "@/lib/auth/actions";
import { getSession } from "@/lib/auth/session";

import { WelcomeCarousel } from "./welcome-carousel";
import "./welcome.css";

export const metadata: Metadata = {
  title: "EuroLeague Fantasy Draft | Eurovafliai",
  description:
    "Create a league, draft EuroLeague players live with friends, and follow the standings throughout the season.",
};

/** Every failure the Google callback can produce has a way back into sign-in. */
const ERRORS: Record<string, string> = {
  server_unavailable: "Can't reach the server right now. Try again in a moment.",
  provider_unavailable:
    "Google sign-in is temporarily unavailable. Try again later.",
  google_denied: "Google sign-in was cancelled.",
  missing_code: "Google did not send back a sign-in code. Try again.",
  state_mismatch:
    "That sign-in link did not start here, so it was refused. Try again from this page.",
  handshake_expired: "That took a while and the attempt expired. Try again.",
  exchange_failed: "Google sign-in failed. Try again.",
};

/** A protected deep link needs context, while a first visit does not. */
const NOTES: Record<string, string> = {
  unauthorized: "Sign in to open that page.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const session = await getSession();
  if (session) redirect("/");

  const { error } = await searchParams;
  const key = typeof error === "string" ? error : undefined;
  const message = key ? ERRORS[key] : undefined;
  const note = key ? NOTES[key] : undefined;

  return (
    <main id="main" data-testid="login" className="welcome">
      <section className="welcome-hero" aria-labelledby="welcome-title">
        <div className="welcome-hero-inner">
          <div className="welcome-brand">
            <span aria-hidden="true" className="waffle-mark welcome-mark" />
            <span>Eurovafliai</span>
          </div>

          <div className="welcome-content">
            <h1 id="welcome-title" className="welcome-title">
              <span>EuroLeague</span>
              <span>Fantasy Draft</span>
            </h1>
            <p className="welcome-lead">
              Create a league, invite your friends, draft EuroLeague players
              live, and follow the season.
            </p>
            {note ? (
              <p data-testid="login-note" className="welcome-note">
                {note}
              </p>
            ) : null}
            {message ? (
              <div className="welcome-error">
                <Correction testId="login-error">{message}</Correction>
              </div>
            ) : null}

            <form action={startGoogleLogin} className="welcome-signin">
              <SubmitButton
                testId="login-google"
                tone="live"
                pendingLabel="Redirecting to Google…"
              >
                Continue with Google
              </SubmitButton>
            </form>
          </div>
        </div>

        <picture className="welcome-art">
          <source
            media="(min-width: 768px)"
            srcSet="/images/welcome-draft-board-wide.webp"
          />
          <img
            src="/images/welcome-draft-board-mobile.webp"
            alt=""
            width="1122"
            height="1402"
            fetchPriority="high"
            decoding="async"
          />
        </picture>
      </section>

      <WelcomeCarousel />
    </main>
  );
}
