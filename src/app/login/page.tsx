import { redirect } from "next/navigation";

import { startGoogleLogin } from "@/lib/auth/actions";
import { getSession } from "@/lib/auth/session";

/**
 * Sign-in. Google is the only way in — there is no password form, by design.
 *
 * Visual design lands in Phase 1.4; this is deliberately plain, but the states
 * are real: already-signed-in redirects away, and every failure the callback can
 * produce has a message here rather than a dead end.
 */
const ERRORS: Record<string, string> = {
  provider_unavailable:
    "Google sign-in is not configured on the server yet. Tell the commissioner.",
  google_denied: "Google sign-in was cancelled.",
  missing_code: "Google did not send back a sign-in code. Try again.",
  state_mismatch:
    "That sign-in link did not start here, so it was refused. Try again from this page.",
  handshake_expired: "That took a while and the attempt expired. Try again.",
  exchange_failed: "Google sign-in failed. Try again.",
  unauthorized: "Please sign in to continue.",
};

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const session = await getSession();
  if (session) redirect("/");

  const { error } = await searchParams;
  const message = typeof error === "string" ? ERRORS[error] : undefined;

  return (
    <main
      data-testid="login"
      className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 px-6 py-16"
    >
      <div className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-[0.2em] opacity-60">
          Euroleague 2026&ndash;27
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Eurovafliai</h1>
        <p className="opacity-70">
          Invite only. Sign in, then join your league with its code.
        </p>
      </div>

      {message ? (
        <p
          data-testid="login-error"
          role="alert"
          className="border border-current/20 px-4 py-3 text-sm"
        >
          {message}
        </p>
      ) : null}

      <form action={startGoogleLogin}>
        <button
          type="submit"
          data-testid="login-google"
          className="w-full border border-current/25 px-4 py-3 text-sm font-medium transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Continue with Google
        </button>
      </form>
    </main>
  );
}
