"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import { POSITION_WORD } from "@/lib/positions";
import { getSuperuserClient } from "@/lib/pb/superuser";
import { getSafeActionError } from "@/lib/safe-error";
import type { MappingResult } from "@/lib/mapping/actions";

import { SOURCE_NAMES } from "./queries";
import { answerQuestion } from "./store";

/**
 * A manager answers a position question on the mapping queue (7.2 D). The
 * store checks that the viewer manages the question's league; this half only
 * supplies who is asking and refreshes the pages that count questions.
 */
export async function answerPositionQuestion(_previous: MappingResult, formData: FormData): Promise<MappingResult> {
  const session = await requireSession();
  try {
    const pb = await getSuperuserClient();
    const result = await answerQuestion(pb, {
      questionId: String(formData.get("question") ?? ""),
      playerId: String(formData.get("player") ?? "") || undefined,
      position: String(formData.get("position") ?? ""),
      userId: session.user.id,
      now: new Date(),
    });
    if (!result.ok) return { error: result.error };
    revalidatePath("/players/mapping");
    revalidatePath("/l/[league]", "layout");
    return {
      error: null,
      done: `Stored as a ${POSITION_WORD[result.position][0]} in ${SOURCE_NAMES[result.source]} leagues. No read will change it.`,
      playerId: result.playerId,
    };
  } catch (error) {
    return { error: getSafeActionError(error, "The answer could not be saved. Try again.") };
  }
}
