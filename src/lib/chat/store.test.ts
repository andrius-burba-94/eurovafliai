import { afterEach, describe, expect, it, vi } from "vitest";

import { fakePb } from "../../../tests/unit/helpers/fake-pb";

import {
  announce,
  lastMessageAt,
  parseChatRecord,
  postMessage,
  readMessages,
  retractMessage,
  toMessage,
} from "./store";

/**
 * Chat's PocketBase half. The two claims this file exists for: `announce`
 * never throws, and a retract genuinely clears the body rather than hiding it.
 */

const LEAGUE = "league_1";
const ME = "member_me";
const THEM = "member_them";

const members = [
  { id: ME, league: LEAGUE, team_name: "Chief FC" },
  { id: THEM, league: LEAGUE, team_name: "Vafliai" },
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("toMessage", () => {
  it("lets `kind` decide, not the author field", () => {
    // A system line that somehow carries an author is still a system line —
    // and a user line with no expand is still that member's, nameless.
    expect(
      toMessage({
        id: "m1",
        league: LEAGUE,
        kind: "system",
        author: ME,
        body: "x",
        expand: { author: { id: ME, team_name: "Chief FC" } },
      }),
    ).toMatchObject({ system: true, authorId: null, teamName: null });

    expect(
      toMessage({ id: "m2", league: LEAGUE, kind: "user", author: ME }),
    ).toMatchObject({
      system: false,
      authorId: ME,
      teamName: null,
      body: "",
      deleted: false,
      created: "",
    });
  });
});

describe("parseChatRecord", () => {
  it("accepts a realtime payload with extra fields and refuses a non-row", () => {
    expect(
      parseChatRecord({
        id: "m1",
        league: LEAGUE,
        kind: "user",
        collectionId: "abc",
        collectionName: "chat_messages",
        updated: "2026-09-02 12:00:00",
      }),
    ).toMatchObject({ id: "m1", league: LEAGUE });
    expect(parseChatRecord(null)).toBeNull();
    expect(parseChatRecord({ league: LEAGUE })).toBeNull();
    expect(parseChatRecord({ id: "m1", league: LEAGUE, deleted: "yes" })).toBeNull();
  });
});

describe("readMessages", () => {
  it("returns the league's transcript oldest first, with names resolved", async () => {
    const { client } = fakePb({
      data: {
        league_members: members,
        chat_messages: [
          {
            id: "m2",
            league: LEAGUE,
            author: THEM,
            kind: "user",
            body: "second",
            created: "2026-09-02 12:00:02",
          },
          {
            id: "m1",
            league: LEAGUE,
            kind: "system",
            body: "The draft is live.",
            created: "2026-09-02 12:00:01",
          },
          {
            id: "other",
            league: "league_2",
            kind: "system",
            body: "not ours",
            created: "2026-09-02 12:00:00",
          },
        ],
      },
    });

    const messages = await readMessages(client, LEAGUE);
    expect(messages.map((message) => message.id)).toEqual(["m1", "m2"]);
    expect(messages[1]).toMatchObject({
      authorId: THEM,
      teamName: "Vafliai",
      body: "second",
      system: false,
    });
  });
});

describe("postMessage", () => {
  it("writes a user line and returns it with the author expanded", async () => {
    const fake = fakePb({
      data: { league_members: members, chat_messages: [] },
    });

    const message = await postMessage(fake.client, {
      leagueId: LEAGUE,
      memberId: ME,
      body: "hello",
    });

    expect(message).toMatchObject({
      authorId: ME,
      teamName: "Chief FC",
      body: "hello",
      system: false,
      deleted: false,
    });
    expect(fake.rows("chat_messages")[0]).toMatchObject({
      kind: "user",
      deleted: false,
    });
  });

  it("throws when the write fails — the sender is waiting", async () => {
    const fake = fakePb({
      data: { league_members: members },
      hooks: {
        beforeCreate() {
          throw new Error("refused");
        },
      },
    });
    await expect(
      postMessage(fake.client, { leagueId: LEAGUE, memberId: ME, body: "x" }),
    ).rejects.toThrow("refused");
  });
});

describe("lastMessageAt", () => {
  it("reads this member's newest line as epoch millis", async () => {
    const { client } = fakePb({
      data: {
        chat_messages: [
          { id: "a", league: LEAGUE, author: ME, created: "2026-09-02 12:00:00" },
          { id: "b", league: LEAGUE, author: ME, created: "2026-09-02 12:00:09" },
          { id: "c", league: LEAGUE, author: THEM, created: "2026-09-02 12:00:30" },
        ],
      },
    });
    expect(await lastMessageAt(client, ME)).toBe(
      Date.parse("2026-09-02 12:00:09"),
    );
    expect(await lastMessageAt(client, "nobody")).toBeNull();
  });
});

describe("announce", () => {
  it("writes a system line with no author", async () => {
    const fake = fakePb({ data: { chat_messages: [] } });
    await announce(fake.client, LEAGUE, "Chief FC is on the clock.");
    expect(fake.rows("chat_messages")[0]).toMatchObject({
      league: LEAGUE,
      kind: "system",
      deleted: false,
      body: "Chief FC is on the clock.",
    });
    expect(fake.rows("chat_messages")[0]?.author).toBeUndefined();
  });

  it("never throws — a dropped line is logged, not raised", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const fake = fakePb({
      data: { chat_messages: [] },
      hooks: {
        beforeCreate() {
          throw new Error("PocketBase is away");
        },
      },
    });

    await expect(
      announce(fake.client, LEAGUE, "lost"),
    ).resolves.toBeUndefined();
    expect(fake.rows("chat_messages")).toEqual([]);
    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0]?.[0]).toContain(LEAGUE);
  });
});

describe("retractMessage", () => {
  const rows = () => [
    {
      id: "mine",
      league: LEAGUE,
      author: ME,
      kind: "user",
      body: "oops",
      deleted: false,
    },
    {
      id: "theirs",
      league: LEAGUE,
      author: THEM,
      kind: "user",
      body: "theirs",
      deleted: false,
    },
    {
      id: "sys",
      league: LEAGUE,
      kind: "system",
      body: "rolled back",
      deleted: false,
    },
  ];

  it("clears the body of the member's own message and leaves a tombstone", async () => {
    const fake = fakePb({ data: { chat_messages: rows() } });
    expect(
      await retractMessage(fake.client, { messageId: "mine", memberId: ME }),
    ).toBe(true);
    expect(fake.rows("chat_messages")[0]).toMatchObject({
      body: "",
      deleted: true,
    });
    expect(fake.rows("chat_messages")).toHaveLength(3);
  });

  it("refuses somebody else's message, a system line and a missing id", async () => {
    const fake = fakePb({ data: { chat_messages: rows() } });
    expect(
      await retractMessage(fake.client, { messageId: "theirs", memberId: ME }),
    ).toBe(false);
    expect(
      await retractMessage(fake.client, { messageId: "sys", memberId: ME }),
    ).toBe(false);
    expect(
      await retractMessage(fake.client, { messageId: "nope", memberId: ME }),
    ).toBe(false);
    expect(fake.writes).toEqual([]);
  });

  it("is idempotent: retracting twice writes once", async () => {
    const fake = fakePb({ data: { chat_messages: rows() } });
    await retractMessage(fake.client, { messageId: "mine", memberId: ME });
    expect(
      await retractMessage(fake.client, { messageId: "mine", memberId: ME }),
    ).toBe(true);
    expect(fake.writes).toEqual(["update chat_messages:mine"]);
  });
});
