import "server-only";

import { getSession } from "@/lib/auth/session";
import { createUserClient } from "@/lib/pb/server";

/** A URL's player segment, slug or id, as the player's id; null when there is no such player. */
export async function resolvePlayerId(ref: string): Promise<string | null> {
  const session = await getSession();
  if (!session) return null;
  const pb = createUserClient(session.token);
  try {
    const player = await pb
      .collection("players")
      .getFirstListItem<{ id: string }>(pb.filter("slug = {:ref} || id = {:ref}", { ref }), { fields: "id", requestKey: null });
    return player.id;
  } catch {
    return null;
  }
}
