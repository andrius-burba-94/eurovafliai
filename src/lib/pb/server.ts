import "server-only";

import PocketBase from "pocketbase";

import { serverConfig } from "@/lib/config/server";

/**
 * Server-side PocketBase clients. The single seam through which server code
 * reaches PocketBase — nothing else constructs a client.
 *
 * These always talk to `PB_INTERNAL_URL` (127.0.0.1), never the public `/pb/`
 * proxy: the proxy exists for browsers. Note the asymmetry with the app's own
 * origin, which must use `localhost` for Google's sake (see AGENTS.md).
 */

/**
 * An unauthenticated client. Used for the auth handshake itself, where there is
 * no session yet.
 */
export function createPbClient(): PocketBase {
  return new PocketBase(serverConfig().PB_INTERNAL_URL);
}

/**
 * A client acting as the signed-in user, so PocketBase API rules apply to every
 * read. This is the normal way to read data on behalf of a request.
 *
 * The token is loaded into the auth store without a record; `authRefresh()`
 * fills in the record and confirms with the server that the token is still good.
 */
export function createUserClient(token: string): PocketBase {
  const pb = createPbClient();
  pb.authStore.save(token, null);
  return pb;
}
