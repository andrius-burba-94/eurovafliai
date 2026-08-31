import { redirect } from "next/navigation";

import {
  BoardButton,
  BoardPlan,
  Correction,
  Sheet,
  TopRail,
} from "@/components/board";
import { startGoogleLogin } from "@/lib/auth/actions";
import { getSession } from "@/lib/auth/session";

/**
 * Sign-in. Google is the only way in — there is no password form, by design.
 *
 * The board is empty here, so the surface says so: one waiting bay with the
 * only action in it. Every failure the callback can produce has a message
 * rather than a dead end.
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
    <>
      <TopRail />
      <Sheet testId="login">
        <div className="flex max-w-md flex-col gap-3">
          <h1 className="text-3xl font-semibold uppercase tracking-[0.04em]">
            Take your bay
          </h1>
          <p className="text-ink-soft">
            Invite only. Sign in, then join your league with its code.
          </p>
        </div>

        {message ? (
          <Correction testId="login-error">{message}</Correction>
        ) : null}

        <div className="bay-waiting flex flex-col gap-4 px-3 py-5">
          <p className="slot-label">Bay 01 &middot; waiting</p>
          <form action={startGoogleLogin}>
            <BoardButton testId="login-google" tone="live">
              Continue with Google
            </BoardButton>
          </form>
        </div>

        <BoardPlan />
      </Sheet>
    </>
  );
}
