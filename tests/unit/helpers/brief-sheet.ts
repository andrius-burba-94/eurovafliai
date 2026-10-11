import type { BriefFacts } from "@/lib/ai/brief-facts";
import type { TokenRef } from "@/lib/ai/tokens";

/**
 * Three teams. m3's section alone carries a move worth making (#P9), so a
 * brief for anyone else that cites it, or its +4.2, is refused.
 */
export function briefSheet(): BriefFacts {
  const header = [
    "BRIEF FACTS · version 1 · Euroleague round 5 · 3 teams",
    "TABLE AFTER ROUND 5 (season totals)",
    "@T1 · 1st · total 600.0 · 20.0 ahead of @T2",
    "@T2 · 2nd · total 580.0 · 80.0 ahead of @T3",
    "@T3 · 3rd · total 500.0",
  ].join("\n");
  const sections: Record<string, string> = {
    m1: ["TEAM @T1", "NIGHT · 1st of 3 on the night · 180.0 · won", "DECIDER · captain bonus · #P1 · +25.0", "STANDING · leads @T2 by 20.0", "NEXT ROUND 6 · 2 easy, 1 even, 0 hard"].join("\n"),
    m2: ["TEAM @T2", "NIGHT · 2nd of 3 on the night · 100.0 · held", "DECIDER · bench half lost · #P2 on the bench · -5.0", "STANDING · 20.0 behind @T1 · 80.0 ahead of @T3", "NEXT ROUND 6 · 1 easy, 1 even, 1 hard"].join("\n"),
    m3: ["TEAM @T3", "NIGHT · 3rd of 3 on the night · 40.0 · lost", "STANDING · 80.0 behind @T2", "NEXT ROUND 6 · 0 easy, 2 even, 1 hard · best move: drop #P3, add #P9 · +4.2 fantasy points a game over the next 5"].join("\n"),
  };
  const refs: Record<string, TokenRef> = {
    "@T1": { kind: "member", id: "m1" },
    "@T2": { kind: "member", id: "m2" },
    "@T3": { kind: "member", id: "m3" },
    "#P1": { kind: "player", id: "p1" },
    "#P2": { kind: "player", id: "p2" },
    "#P3": { kind: "player", id: "p3" },
    "#P9": { kind: "player", id: "p9" },
  };
  const tokens = (text: string) => new Set([...text.matchAll(/(@T|#P)\d+/g)].map((match) => match[0]));
  return {
    version: 1,
    round: 5,
    text: [header, ...Object.values(sections)].join("\n\n"),
    header,
    refs,
    privateNames: ["Einikio Kabliai"],
    memberIds: ["m1", "m2", "m3"],
    sectionFor: (memberId) => sections[memberId] ?? "",
    tokensFor: (memberId) => new Set([...tokens(header), ...tokens(sections[memberId] ?? "")]),
  };
}
