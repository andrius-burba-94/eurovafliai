import { BRIEF_LINES, storedBrief } from "./briefs";
import { renderSegments, type Names, type Segment, type TokenRef } from "./tokens";
import { storedWriteup, type SectionKey } from "./voice";

/**
 * A stored write-up as a page draws it — slice 7.1. Pure: the reader hands
 * in the stored row and the league's names; the page turns segments into
 * links.
 *
 * Everything goes through one `renderSegments` call in the order the Recap
 * page reads (headline, lines, the summary panel's sections, then the notes
 * on the table, best night and swing panels), because a player is named in
 * full where he is first read and by surname after.
 */

export type WriteupView = {
  /** Plain text: a headline is display type, and display type carries no links. */
  readonly headline: string;
  readonly lines: readonly (readonly Segment[])[];
  readonly sections: Readonly<Partial<Record<SectionKey, readonly Segment[]>>>;
};

const READING_ORDER: readonly SectionKey[] = ["over", "under", "surprises", "table", "stars", "swing"];

function isRefs(value: unknown): value is Record<string, TokenRef> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(value).every(
      (ref) => typeof ref === "object" && ref !== null && (ref.kind === "member" || ref.kind === "player") && typeof ref.id === "string",
    )
  );
}

export function writeupView(output: unknown, refs: unknown, names: Names): WriteupView | null {
  const writeup = storedWriteup(output);
  if (!writeup || !isRefs(refs)) return null;
  const present = READING_ORDER.filter((key) => writeup.sections[key] !== undefined);
  const rendered = renderSegments(
    [writeup.headline, ...writeup.lines, ...present.map((key) => writeup.sections[key]!)],
    refs,
    names,
  );
  const [headline, ...rest] = rendered;
  const lines = rest.slice(0, writeup.lines.length);
  const sectionSegments = rest.slice(writeup.lines.length);
  const sections: Partial<Record<SectionKey, readonly Segment[]>> = {};
  present.forEach((key, at) => {
    sections[key] = sectionSegments[at]!;
  });
  // A headline is a title: the model's habit of a closing full stop goes.
  const title = headline!.map((segment) => segment.text).join("").replace(/(?<!\.)\.\s*$/, "");
  return { headline: title, lines, sections };
}

/** A member's brief as Recap draws it — slice 7.3 D: its three lines, names put back. */
export type BriefView = Readonly<Record<(typeof BRIEF_LINES)[number], readonly Segment[]>>;

export function briefView(output: unknown, refs: unknown, names: Names): BriefView | null {
  const brief = storedBrief(output);
  if (!brief || !isRefs(refs)) return null;
  const [result, standing, next] = renderSegments(
    BRIEF_LINES.map((key) => brief[key]),
    refs,
    names,
  );
  return { result: result!, standing: standing!, next: next! };
}

/**
 * The brief's corner: the member's place on Recap's own ladder, which ranks
 * ties as the brief's sheet does (#204, as revised). Null when the night did
 * not rank them.
 */
export function briefPlace(
  ladder: readonly { readonly memberId: string }[],
  memberId: string,
): { readonly place: number; readonly teams: number } | null {
  const index = ladder.findIndex((row) => row.memberId === memberId);
  return index < 0 ? null : { place: index + 1, teams: ladder.length };
}

/**
 * Why a write-up could not be written, in the two words a manager needs:
 * the answer did not check out (the guard, or an unusable answer), or
 * Google did not answer at all (quota, key, outage). The row keeps the detail.
 */
export function failureKind(error: string | undefined): "guard" | "google" {
  const text = error ?? "";
  return text.startsWith("Gemini") && !text.startsWith("Gemini gave no usable answer") ? "google" : "guard";
}
