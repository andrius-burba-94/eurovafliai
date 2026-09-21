import type { NextRequest } from "next/server";

import { readDraftExport } from "@/lib/exports/queries";
import { contentTypeFor, toExportBody } from "@/lib/exports/serialize";
import {
  exportFileName,
  parseFormat,
  parseKinds,
} from "@/lib/exports/tables";

/**
 * The download itself — the league's draft as a file.
 *
 * A route handler rather than a server action because the result *is* a
 * response: a body, a content type and a `Content-Disposition` that makes the
 * browser save it. A server action returns data to a React tree and has no way
 * to hand a phone a file.
 *
 * It sits one segment below the picker page because Next refuses a `page.tsx`
 * and a `route.ts` in the same segment. The page's form is a plain
 * `method="get"` pointed here, so the export works with JavaScript switched
 * off and a member can bookmark or share the resulting URL.
 *
 * **This handler protects real data, so it authenticates itself.** `proxy.ts`
 * is optimistic by design — it checks that a session cookie is present and
 * nothing more, so a forged or expired one reaches this code. `readDraftExport`
 * calls `getSession()` and then checks that the viewer is a member of this
 * league, which is the check that matters: a league's draft is not public.
 * `api/time/route.ts` explains at length why it is allowed to skip this and
 * why nothing else is.
 *
 * No `connection()`: `getSession()` reads cookies, which is already the
 * strongest possible statement that this response is per-request.
 */
export async function GET(
  request: NextRequest,
  context: RouteContext<"/leagues/[id]/export/download">,
): Promise<Response> {
  const { id } = await context.params;
  const query = request.nextUrl.searchParams;
  const kinds = parseKinds(query.getAll("include"));
  const format = parseFormat(query.get("format"));

  const plain = (body: string, status: number) =>
    new Response(`${body}\n`, {
      status,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    });

  // An empty selection is the one thing a plain HTML form cannot prevent —
  // there is no `required` for "at least one checkbox" — so it is answered
  // here rather than guessed at by exporting everything.
  if (kinds.length === 0) {
    return plain("Choose at least one thing to export, then try again.", 400);
  }

  const result = await readDraftExport(id, kinds);
  if (!result.ok) {
    if (result.reason === "unauthorized") {
      return plain("Sign in to export a draft.", 401);
    }
    // Same answer for "no such league" and "not your league", for the reason
    // the lobby gives: telling them apart would let anyone probe which
    // leagues exist.
    if (result.reason === "not-found") {
      return plain("No such league.", 404);
    }
    return plain(
      "This league has not drafted yet, so there is nothing to export.",
      409,
    );
  }

  const exportedAt = new Date();
  const body = toExportBody(result.value.tables, format, {
    leagueName: result.value.leagueName,
    exportedAt,
  });
  const filename = exportFileName(
    result.value.leagueName,
    kinds,
    format,
    exportedAt,
  );

  return new Response(body, {
    headers: {
      "content-type": contentTypeFor(format),
      // The filename is built from a slug of `[a-z0-9-]` plus a date, so it
      // needs no escaping inside the quotes and carries no header-injection
      // surface.
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
