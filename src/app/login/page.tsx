import { redirect } from "next/navigation";

import { Bank, Correction } from "@/components/board";
import { SubmitButton } from "@/components/submit-button";
import { startGoogleLogin } from "@/lib/auth/actions";
import { getSession } from "@/lib/auth/session";

/**
 * Sign-in. Google is the only way in — there is no password form, by design.
 *
 * A broadcast title screen: the name at display size, the one action, and the
 * shape of the season underneath. Every failure the callback can produce has a
 * message rather than a dead end.
 */
/**
 * Something actually went wrong, and the board says so in its correction voice.
 * Every one of these is a failure the callback can genuinely produce.
 */
const ERRORS: Record<string, string> = {
  server_unavailable:
    "Can't reach the server right now. Try again in a moment.",
  provider_unavailable:
    "Google sign-in is not configured on the server yet. Tell the commissioner.",
  google_denied: "Google sign-in was cancelled.",
  missing_code: "Google did not send back a sign-in code. Try again.",
  state_mismatch:
    "That sign-in link did not start here, so it was refused. Try again from this page.",
  handshake_expired: "That took a while and the attempt expired. Try again.",
  exchange_failed: "Google sign-in failed. Try again.",
};

/**
 * Nothing went wrong; the reader just needs to know why they are here.
 *
 * `unauthorized` lives here rather than in ERRORS because being signed out is
 * the normal state of a first visit, not a fault. Rendering it as a correction
 * put a red alert on the front door and made a screen reader announce a
 * failure to somebody who had merely opened the site. The proxy no longer sends
 * it for `/` at all — this covers the case that remains, a deep link into a
 * league you have to sign in to see.
 */
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
    <main
      id="main"
      data-testid="login"
      className="relative isolate flex min-h-dvh flex-col overflow-hidden"
    >
      <span aria-hidden="true" className="lattice pointer-events-none absolute inset-0 -z-10" />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-2/5 spotlight"
      />

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 px-5 py-10 sm:px-8">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="waffle-mark size-10" />
          <span className="slot-label text-ink-soft">EuroLeague 2026&ndash;27 &middot; Fantasy draft</span>
        </div>

        <div className="flex flex-col gap-4">
          <p className="display text-6xl leading-none text-live sm:text-8xl">Eurovafliai</p>
          <h1 className="display text-3xl sm:text-4xl">Take your slot</h1>
          <p className="max-w-md text-ink-soft">
            Invite only. Google verifies identity; the invite code takes the
            slot after sign-in.
          </p>
          {/* Sits with the standfirst rather than above the action, because it
              qualifies the invitation — it is not an event on the board. */}
          {note ? (
            <p data-testid="login-note" className="text-sm text-ink-soft">
              {note}
            </p>
          ) : null}
        </div>

        {message ? (
          <Correction testId="login-error">{message}</Correction>
        ) : null}

        <div className="max-w-md">
          <Bank label="Sign in" framed>
            <div className="flex flex-col gap-4 px-3 py-4">
              <form action={startGoogleLogin}>
                <SubmitButton
                  testId="login-google"
                  tone="live"
                  pendingLabel="Redirecting to Google…"
                >
                  Continue with Google
                </SubmitButton>
              </form>
            </div>
          </Bank>
        </div>

        <dl className="grid max-w-md grid-cols-3 divide-x divide-panel-border rounded-card border border-panel-border bg-stock-panel">
          {[
            ["13", "rounds"],
            ["12", "teams at most"],
            ["38", "season rounds"],
          ].map(([figure, label]) => (
            <div key={label} className="flex flex-col items-center gap-0.5 px-2 py-3 text-center">
              <dt className="slot-label text-ink-soft">{label}</dt>
              <dd className="display-figure order-first text-3xl">{figure}</dd>
            </div>
          ))}
        </dl>
      </div>
    </main>
  );
}
