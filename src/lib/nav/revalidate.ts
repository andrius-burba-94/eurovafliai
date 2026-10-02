import "server-only";

import { revalidatePath } from "next/cache";

/**
 * Every page of every league. An action knows its league's id, and its
 * address is a slug the action would have to read; at ten people the
 * difference between one league's pages and all of them is nothing, and a
 * missed page after a write is a real bug.
 */
export function revalidateLeague(): void {
  revalidatePath("/l/[league]", "layout");
}
