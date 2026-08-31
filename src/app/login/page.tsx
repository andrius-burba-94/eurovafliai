import { redirect } from "next/navigation";

import { BoardPlan, Correction, Sheet, TopRail } from "@/components/board";
import { SubmitButton } from "@/components/submit-button";
import { startGoogleLogin } from "@/lib/auth/actions";
import { getSession } from "@/lib/auth/session";

/**
 * Sign-in. Google is the only way in — there is no password form, by design.
 *
 * The board is empty here and the page says so: one waiting slot with the only
 * action in it, over the board this league will fill. Every failure the
 * callback can produce has a message rather than a dead end.
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
    <>
      <TopRail />
      <Sheet testId="login">
        <div className="flex max-w-md flex-col gap-3">
          <h1 className="text-3xl font-semibold uppercase tracking-[0.04em] sm:text-4xl">
            Take your slot
          </h1>
          <p className="text-ink-soft">
            Invite only. Sign in, then join your league with its code.
          </p>
          {/* Sits with the standfirst rather than above the slot, because it
              qualifies the invitation — it is not an event on the board. */}
          {note ? (
            <p data-testid="login-note" className="slot-label text-ink-soft">
              {note}
            </p>
          ) : null}
        </div>

        {message ? (
          <Correction testId="login-error">{message}</Correction>
        ) : null}

        <div className="slot-waiting flex flex-col gap-4 px-3 py-5">
          <p className="slot-label">Slot 01 &middot; waiting</p>
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

        <BoardPlan caption="13 rounds · up to 12 slots" />
      </Sheet>
    </>
  );
}
