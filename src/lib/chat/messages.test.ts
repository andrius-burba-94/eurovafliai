import { describe, expect, it } from "vitest";

import {
  CHAT_MAX_LENGTH,
  CHAT_MIN_GAP_MS,
  announceComplete,
  announcePause,
  announcePick,
  announceRoll,
  announceRollback,
  announceStartOver,
  checkMessage,
} from "./messages";

/**
 * Every sentence the app can say in chat, read as text.
 *
 * This file is the whole reason the builders are functions. #54's copy defects
 * were all strings assembled inside JSX — a sentence spliced from conditional
 * fragments, a confirmation branched on the wrong number, a list joined so that
 * three items read "A and B and C" — and not one of them was reachable by a
 * test, because not one of them was a function. So the assertions here are
 * whole strings rather than substrings: a fragment match would pass on exactly
 * the prose that reads badly.
 */

describe("a pick, announced", () => {
  const pick = {
    teamName: "B Ballers",
    playerName: "Sloukas, Kostas",
    overallNo: 7,
    round: 1,
    isAuto: false,
  };

  it("names the team, the player and the place", () => {
    expect(announcePick(pick)).toBe(
      "B Ballers drafted Sloukas, Kostas at #7, round 1.",
    );
  });

  it("says so when the worker picked", () => {
    // The ticker's one editorial contribution, kept: somebody coming back to
    // their phone wants to know whether the app picked for them.
    expect(announcePick({ ...pick, isAuto: true })).toBe(
      "B Ballers autodrafted Sloukas, Kostas at #7, round 1.",
    );
  });

  it("never says 'you'", () => {
    // Twelve people read the same row. A line that says "you" is wrong for
    // eleven of them.
    expect(announcePick(pick)).not.toMatch(/\byou\b/i);
  });
});

describe("pause and resume", () => {
  it("says nobody is on the clock, which is the part that matters", () => {
    expect(announcePause(true)).toBe(
      "The draft is paused. Nobody is on the clock.",
    );
  });

  it("says it is running again", () => {
    expect(announcePause(false)).toBe("The draft is running again.");
  });
});

describe("a rollback — the line this slice exists for", () => {
  it("names the count and the pick it rewound to", () => {
    // "The draft was rolled back" tells somebody who was away nothing about
    // whether their own pick survived. Both numbers, always.
    expect(
      announceRollback({ discarded: 4, toPick: 9, byTeamName: "Chief FC" }),
    ).toBe(
      "Chief FC rolled the draft back to #9, discarding 4 picks. The draft is paused.",
    );
  });

  it("agrees its noun with one pick", () => {
    expect(
      announceRollback({ discarded: 1, toPick: 3, byTeamName: "Chief FC" }),
    ).toBe(
      "Chief FC rolled the draft back to #3, discarding 1 pick. The draft is paused.",
    );
  });
});

describe("the roll", () => {
  it("prints the whole order, numbered", () => {
    expect(
      announceRoll({ order: ["B Ballers", "Chief FC", "Other FC"], reshuffle: false }),
    ).toBe(
      "The draft order was rolled: 1. B Ballers · 2. Chief FC · 3. Other FC.",
    );
  });

  it("says reshuffled when the order changed under people", () => {
    expect(announceRoll({ order: ["Chief FC"], reshuffle: true })).toBe(
      "The draft order was reshuffled: 1. Chief FC.",
    );
  });

  it("does not render a dangling colon for an empty order", () => {
    // Reachable only through a bug, and the branch with no test is the branch
    // that renders "The draft order was rolled: ."
    expect(announceRoll({ order: [], reshuffle: false })).toBe(
      "The draft order was rolled.",
    );
  });
});

describe("start over and complete", () => {
  it("says what was destroyed and what was kept", () => {
    expect(announceStartOver("Chief FC")).toBe(
      "Chief FC started the draft over. Every pick was discarded and the draft order was kept.",
    );
  });

  it("agrees its noun with one round", () => {
    expect(announceComplete(13)).toBe(
      "The draft is complete after 13 rounds. Rosters are final.",
    );
    expect(announceComplete(1)).toBe(
      "The draft is complete after 1 round. Rosters are final.",
    );
  });
});

describe("every system line is a whole sentence", () => {
  // The house rule, asserted rather than trusted. These sit in a run beside
  // people's own messages, and a verbless fragment reads like a broken one —
  // which is exactly what 3.4b's critique found in the sheet's drop
  // announcement.
  const lines = [
    announcePick({
      teamName: "B Ballers",
      playerName: "Nunn",
      overallNo: 1,
      round: 1,
      isAuto: false,
    }),
    announcePause(true),
    announcePause(false),
    announceRollback({ discarded: 2, toPick: 5, byTeamName: "Chief FC" }),
    announceRoll({ order: ["A", "B"], reshuffle: false }),
    announceStartOver("Chief FC"),
    announceComplete(13),
  ];

  it.each(lines)("ends in a full stop and starts with a capital: %s", (line) => {
    expect(line).toMatch(/\.$/);
    expect(line[0]).toBe(line[0]!.toUpperCase());
  });

  it("never doubles a space or leaves one before punctuation", () => {
    // The shape of a spliced sentence: "and so does rank,tier,name" came from
    // exactly this class of join.
    for (const line of lines) {
      expect(line, line).not.toMatch(/ {2}/);
      expect(line, line).not.toMatch(/ [.,]/);
    }
  });
});

describe("checkMessage — the rate limit and the cap", () => {
  const now = 1_000_000;

  it("accepts a first message and trims it", () => {
    expect(checkMessage({ body: "  hello  ", now, lastAt: null })).toEqual({
      ok: true,
      body: "hello",
    });
  });

  it("refuses an empty message, and one that is only whitespace", () => {
    for (const body of ["", "   ", "\n\t "]) {
      expect(checkMessage({ body, now, lastAt: null })).toEqual({
        ok: false,
        error: "Write something first.",
      });
    }
  });

  it("refuses one over the cap, and names the number", () => {
    const result = checkMessage({
      body: "x".repeat(CHAT_MAX_LENGTH + 1),
      now,
      lastAt: null,
    });
    expect(result.ok).toBe(false);
    // Naming the number is the whole point of a refusal somebody has to act on.
    expect(result.ok === false && result.error).toContain(
      String(CHAT_MAX_LENGTH),
    );
  });

  it("accepts one exactly at the cap", () => {
    // The boundary, which is the case an off-by-one lives on.
    expect(
      checkMessage({ body: "x".repeat(CHAT_MAX_LENGTH), now, lastAt: null }).ok,
    ).toBe(true);
  });

  it("refuses a second message sent too fast", () => {
    expect(
      checkMessage({ body: "again", now, lastAt: now - (CHAT_MIN_GAP_MS - 1) }),
    ).toEqual({ ok: false, error: "Slow down a moment, then send it again." });
  });

  it("accepts one sent exactly at the gap", () => {
    expect(
      checkMessage({ body: "again", now, lastAt: now - CHAT_MIN_GAP_MS }).ok,
    ).toBe(true);
  });

  it("is pure — the clock is an argument, like every deadline in the engine", () => {
    const input = { body: "hi", now, lastAt: null } as const;
    expect(checkMessage(input)).toEqual(checkMessage(input));
  });
});
