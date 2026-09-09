import { describe, expect, it } from "vitest";

import {
  CHAT_LENGTH_WARN_AT,
  CHAT_MAX_LENGTH,
  CHAT_MIN_GAP_MS,
  CHAT_UI,
  chatRemaining,
  chatTime,
  chatTotal,
  chatUnread,
  announceComplete,
  announceDrop,
  announceAdd,
  announceImpact,
  announceTrade,
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
      "The draft is complete after 13 rounds. Rosters are set.",
    );
    expect(announceComplete(1)).toBe(
      "The draft is complete after 1 round. Rosters are set.",
    );
  });
});

describe("a recorded transaction", () => {
  it("names both teams, both players, and the counting round", () => {
    expect(
      announceTrade({
        teamA: "Chief FC",
        teamB: "B Ballers",
        sent: ["Nunn"],
        received: ["Sloukas, Kostas"],
        fromRound: 2,
      }),
    ).toBe(
      "Chief FC traded Nunn to B Ballers for Sloukas, Kostas, counting from round 2.",
    );
  });

  it("never says you", () => {
    expect(
      announceTrade({
        teamA: "Chief FC",
        teamB: "B Ballers",
        sent: ["A"],
        received: ["B"],
        fromRound: 1,
      }),
    ).not.toMatch(/\byou\b/i);
  });
});

describe("a live delta", () => {
  it("names the kind and the signed fantasy total", () => {
    expect(announceImpact({ type: "trade", deltaTenths: 37 })).toBe(
      "This trade is +3.7 fantasy so far.",
    );
    expect(announceImpact({ type: "drop", deltaTenths: -50 })).toBe(
      "This drop is -5.0 fantasy so far.",
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
    announceTrade({
      teamA: "Chief FC",
      teamB: "B Ballers",
      sent: ["Nunn"],
      received: ["Sloukas, Kostas"],
      fromRound: 2,
    }),
    announceDrop({ teamName: "Chief FC", players: ["Nunn"], fromRound: 3 }),
    announceAdd({ teamName: "Chief FC", players: ["Nunn"], fromRound: 3 }),
    announceImpact({ type: "trade", deltaTenths: 37 }),
    announceImpact({ type: "drop", deltaTenths: -50 }),
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

describe("the panel's own strings, read as prose", () => {
  // These were assembled in JSX until 3.5's critique noticed the irony: this
  // file exists *because* strings built in JSX shipped four copy defects, and
  // the component that imports it had built five of its own — three of them
  // fragments sitting in a run of full-stopped sentences.
  const sentences = [
    CHAT_UI.emptyLatest,
    CHAT_UI.empty,
    CHAT_UI.retracted,
    CHAT_UI.disconnected,
  ];

  it.each(sentences)("is a whole sentence: %s", (line) => {
    expect(line).toMatch(/\.$/);
    expect(line[0]).toBe(line[0]!.toUpperCase());
    expect(line).not.toMatch(/ {2}/);
    expect(line).not.toMatch(/ [.,]/);
  });

  it("does not shout, and does not use an em dash", () => {
    // The reconnect notice was a 42-character sentence set in 11px caps, which
    // is the `all-caps-body` defect two earlier critiques already flagged. The
    // fix was the *material*, but the copy is asserted too so a future rewrite
    // does not reach for a dash where a comma reads better.
    for (const line of sentences) {
      expect(line).not.toBe(line.toUpperCase());
      expect(line).not.toContain("—");
    }
  });

  it("leaves a trailing space on the system prefix", () => {
    // Without it a screen reader reads "The app:The draft is complete…" —
    // measured verbatim in the browser by both assessments.
    expect(CHAT_UI.systemPrefix).toBe("The app: ");
    expect(CHAT_UI.systemPrefix).toMatch(/ $/);
  });
});

describe("the panel's counts", () => {
  it("agrees its noun with one message", () => {
    expect(chatTotal(1)).toBe("1 message");
    expect(chatTotal(0)).toBe("0 messages");
    expect(chatTotal(45)).toBe("45 messages");
  });

  it("says how many are new", () => {
    expect(chatUnread(3)).toBe("3 new");
  });

  it("shows a length only once it is close to the cap", () => {
    // A counter on every keystroke is noise; a counter that appears when it
    // starts to matter is a warning. The critique's Error Prevention finding
    // was that the cap existed and the component never mentioned it.
    expect(chatRemaining(10)).toBeNull();
    expect(chatRemaining(CHAT_LENGTH_WARN_AT - 1)).toBeNull();
    expect(chatRemaining(CHAT_LENGTH_WARN_AT)).toBe("1,800 / 2,000");
    expect(chatRemaining(CHAT_MAX_LENGTH)).toBe("2,000 / 2,000");
  });
});

describe("a message's time", () => {
  it("is hours and minutes, 24-hour", () => {
    // CONTEXT.md calls chat "the record of draft night", and 3.5 shipped it
    // without a clock — so reconstructing "did my pick survive the rollback?"
    // meant reading upward through prose.
    expect(chatTime("2026-09-07T20:05:00Z")).toMatch(/^\d{2}:\d{2}$/);
  });

  it("returns nothing for a value that is not a date", () => {
    // `created` is a string off a JSON API. An "Invalid Date" on every row is
    // worse than no time at all.
    expect(chatTime("")).toBe("");
    expect(chatTime("not a date")).toBe("");
  });
});
