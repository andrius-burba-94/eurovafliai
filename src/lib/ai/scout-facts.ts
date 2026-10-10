import type { Ruleset } from "@/lib/advisor/outlook";
import type { ScoutMove } from "@/lib/advisor/scout";
import { formatOutlook, type WireRow } from "@/lib/advisor/wire";

import { assignTokens, type TokenRef } from "./tokens";

/**
 * The reasons' fact sheet — slice 7.2 G. Pure.
 *
 * One block per move, every figure pre-formatted, tokens only. A reason is
 * guarded against its own block alone, which is what keeps advice private: a
 * sentence about one member's move cannot cite a player or a number from
 * another member's, because those are not in its block. The sheet carries no
 * judgement the advisor did not make; the win-chance words are the one label
 * added here, at named thresholds.
 */

export const SCOUT_FACTS_VERSION = 1;
/** A club at or above this average win chance over its next five is the favourite. */
export const FAVOURITE_FROM = 60;
export const UNDERDOG_TO = 40;

export type ScoutFactsMove = {
  /** M1, M2…: the key the answer is written under. */
  readonly id: string;
  readonly memberId: string;
  readonly dropId: string;
  readonly addId: string;
  /** The block, as sent: what this move's reason may cite. */
  readonly text: string;
  readonly tokens: ReadonlySet<string>;
};

export type ScoutFacts = {
  readonly version: number;
  /** The whole sheet: the header and every member's section. */
  readonly text: string;
  readonly header: string;
  readonly refs: Readonly<Record<string, TokenRef>>;
  readonly tokens: ReadonlyMap<string, string>;
  readonly moves: readonly ScoutFactsMove[];
  readonly privateNames: readonly string[];
  /** One member's section, header excluded: what that member's row is hashed on. */
  sectionFor(memberId: string): string;
};

const winWord = (percent: number | null) =>
  percent === null ? null : percent >= FAVOURITE_FROM ? "favourite" : percent <= UNDERDOG_TO ? "underdog" : "even";

const AVAILABILITY: Record<string, string> = { injured: "out", doubtful: "doubtful" };

function playerLine(label: "ADD" | "DROP", row: WireRow, token: string, ruleset: Ruleset): string {
  const outlook = row.outlook!;
  const { inputs } = outlook;
  const rateUnit = ruleset === "basketnews" ? "Modern points a minute" : "PIR a minute";
  const parts = [
    `${label} ${token}`,
    `next 5 / 10 / 15: ${outlook.next.map((value) => (value === null ? "no game" : formatOutlook(value))).join(" / ")}`,
    `${(inputs.ratePerMinute / 100).toFixed(2)} ${rateUnit}`,
    `${(inputs.minutes / 10).toFixed(1)} minutes a game ${outlook.role === "starter" ? "as a starter" : "off the bench"}`,
    `started ${inputs.startsRecent} of his last ${inputs.gamesRecent}`,
    ...(outlook.baseSource === "last" ? ["rated on last season's games"] : []),
    ...(outlook.runs[0] ? [`next 5 games: ${outlook.runs[0]} run`] : []),
    ...(winWord(inputs.winChance) ? [`club: ${winWord(inputs.winChance)}`] : []),
    AVAILABILITY[row.status] ?? "available",
  ];
  return parts.join(" · ");
}

export function buildScoutFacts({
  ruleset,
  members,
  privateNames,
}: {
  ruleset: Ruleset;
  members: readonly { readonly memberId: string; readonly moves: readonly ScoutMove[] }[];
  privateNames: readonly string[];
}): ScoutFacts {
  const ordered = [...members].sort((a, b) => a.memberId.localeCompare(b.memberId));
  const tokens = assignTokens(
    ordered.map((member) => member.memberId),
    ordered.flatMap((member) => member.moves.flatMap((move) => [move.drop.id, move.add.id])),
  );
  const unit = ruleset === "basketnews" ? "Modern points a game" : "fantasy points a game";
  const header = [
    `SCOUT FACTS v${SCOUT_FACTS_VERSION} · figures are ${unit}`,
    "Each move swaps a player a team holds for a free agent at the same position. The gain is the added player's next-5 figure minus the dropped player's.",
  ].join("\n");

  const moves: ScoutFactsMove[] = [];
  const sections = new Map<string, string>();
  let n = 0;
  for (const member of ordered) {
    const team = tokens.member.get(member.memberId)!;
    const blocks = member.moves.map((move) => {
      n += 1;
      const id = `M${n}`;
      const drop = tokens.player.get(move.drop.id)!;
      const add = tokens.player.get(move.add.id)!;
      const text = [
        `MOVE ${id} · drop ${drop} · add ${add} · gain +${formatOutlook(move.gain)} ${unit} over the next 5 · confidence ${move.confidence}`,
        playerLine("ADD", move.add, add, ruleset),
        playerLine("DROP", move.drop, drop, ruleset),
      ].join("\n");
      moves.push({ id, memberId: member.memberId, dropId: move.drop.id, addId: move.add.id, text, tokens: new Set([drop, add]) });
      return text;
    });
    sections.set(member.memberId, [`TEAM ${team}`, ...blocks].join("\n"));
  }

  return {
    version: SCOUT_FACTS_VERSION,
    text: [header, ...ordered.map((member) => sections.get(member.memberId)!)].join("\n\n"),
    header,
    refs: tokens.refs,
    tokens: new Map([...tokens.member, ...tokens.player]),
    moves,
    privateNames,
    sectionFor: (memberId) => sections.get(memberId) ?? "",
  };
}
