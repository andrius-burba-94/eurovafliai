import { API_VERSION, metaSchema } from "@eurovafliai/core/api/meta";

/**
 * Public on purpose: an installed build has to be able to learn it is too old
 * before it has a session to be refused with.
 *
 * `minAppVersion` moves only when a deploy changes something an older build
 * would get wrong. It is code rather than configuration, because the change
 * that forces it ships in the same PR.
 */
const MIN_APP_VERSION = "0.1.0";

export function GET(): Response {
  return Response.json(metaSchema.parse({ apiVersion: API_VERSION, minAppVersion: MIN_APP_VERSION }), {
    headers: { "Cache-Control": "no-store" },
  });
}
