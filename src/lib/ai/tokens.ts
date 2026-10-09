import { displayName, surname } from "@/lib/players/name";

/**
 * The model never sees a name — 7.0.
 *
 * Teams go out as `@T1…` and players as `#P1…`; the prose comes back written
 * in those tokens and names are put in only when somebody reads it. Three
 * reasons, any one of which would do: friends' names are not ours to send
 * anywhere, a model that sees no free text has nothing to be talked into, and
 * the guard can check every entity against a closed list. Rendering at read
 * time also means a team rename updates every old write-up.
 */

export type TokenRef =
  | { readonly kind: "member"; readonly id: string }
  | { readonly kind: "player"; readonly id: string };

export type Tokens = {
  readonly member: ReadonlyMap<string, string>;
  readonly player: ReadonlyMap<string, string>;
  /** Token → what it stands for: stored beside the prose so it can be rendered later. */
  readonly refs: Readonly<Record<string, TokenRef>>;
};

/**
 * Tokens in sorted-id order, so the same league and the same players get the
 * same tokens however the reads happened to come back — the facts hash
 * depends on it.
 */
export function assignTokens(memberIds: Iterable<string>, playerIds: Iterable<string>): Tokens {
  const member = new Map<string, string>();
  const player = new Map<string, string>();
  const refs: Record<string, TokenRef> = {};
  [...new Set(memberIds)].sort().forEach((id, index) => {
    const token = `@T${index + 1}`;
    member.set(id, token);
    refs[token] = { kind: "member", id };
  });
  [...new Set(playerIds)].sort().forEach((id, index) => {
    const token = `#P${index + 1}`;
    player.set(id, token);
    refs[token] = { kind: "player", id };
  });
  return { member, player, refs };
}

/** `@T12` is never read as `@T1` followed by a 2. */
export const TOKEN_PATTERN = /(@T|#P)\d+(?![\p{L}\p{N}_])/gu;

export type Segment =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "member"; readonly id: string; readonly text: string }
  | { readonly type: "player"; readonly id: string; readonly text: string };

export type Names = {
  /** Member id → team name as the league reads it. */
  readonly members: Readonly<Record<string, string>>;
  /** Player id → the stored "Surname, First" name. */
  readonly players: Readonly<Record<string, string>>;
};

/**
 * One write-up's lines as segments a page can draw (and link) itself. A
 * player is named in full the first time and by surname after — across all
 * the lines, which is why the caller passes them together — unless another
 * player in the same write-up shares the surname.
 */
export function renderSegments(
  lines: readonly string[],
  refs: Readonly<Record<string, TokenRef>>,
  names: Names,
): Segment[][] {
  const surnames = new Map<string, number>();
  for (const ref of Object.values(refs)) {
    if (ref.kind !== "player") continue;
    const stored = names.players[ref.id];
    if (stored === undefined) continue;
    const key = surname(stored);
    surnames.set(key, (surnames.get(key) ?? 0) + 1);
  }

  const named = new Set<string>();
  return lines.map((line) => {
    const segments: Segment[] = [];
    let cursor = 0;
    for (const match of line.matchAll(TOKEN_PATTERN)) {
      const index = match.index ?? 0;
      if (index > cursor) segments.push({ type: "text", text: line.slice(cursor, index) });
      segments.push(segmentFor(match[0], refs, names, named, surnames));
      cursor = index + match[0].length;
    }
    if (cursor < line.length) segments.push({ type: "text", text: line.slice(cursor) });
    return segments;
  });
}

function segmentFor(
  token: string,
  refs: Readonly<Record<string, TokenRef>>,
  names: Names,
  named: Set<string>,
  surnames: ReadonlyMap<string, number>,
): Segment {
  const ref = refs[token];
  if (ref?.kind === "member") {
    const team = names.members[ref.id]?.trim();
    if (team) return { type: "member", id: ref.id, text: team };
  }
  if (ref?.kind === "player") {
    const stored = names.players[ref.id];
    if (stored !== undefined) {
      const first = !named.has(ref.id);
      named.add(ref.id);
      const short = surname(stored);
      const text = first || (surnames.get(short) ?? 0) > 1 ? displayName(stored) : short;
      return { type: "player", id: ref.id, text };
    }
  }
  // The guard refuses unknown tokens before anything is stored; this is the
  // read side's last resort, and showing the token beats inventing a name.
  return { type: "text", text: token };
}

export function renderPlain(
  lines: readonly string[],
  refs: Readonly<Record<string, TokenRef>>,
  names: Names,
): string[] {
  return renderSegments(lines, refs, names).map((segments) => segments.map((segment) => segment.text).join(""));
}
