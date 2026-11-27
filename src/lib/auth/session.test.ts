import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const jar = new Map<string, string>();
const sent = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { value: jar.get(name) } : undefined) }),
  headers: async () => ({ get: (name: string) => sent.get(name.toLowerCase()) ?? null }),
}));
vi.mock("@/lib/config/server", () => ({ serverConfig: () => ({ SESSION_COOKIE_NAME: "session" }) }));

/** Tokens PocketBase would accept, by user; anything else is refused. */
const users: Record<string, { id: string; email: string; name: string }> = {
  "web-token": { id: "U1", email: "a@example.test", name: "Ann Example" },
  "app-token": { id: "U2", email: "b@example.test", name: "Ben Example" },
};
vi.mock("@/lib/pb/server", () => ({
  createUserClient: (token: string) => ({
    authStore: { isValid: token !== "expired" },
    collection: () => ({
      authRefresh: async () => {
        const record = users[token];
        if (!record) throw new Error("401");
        return { record };
      },
    }),
  }),
}));

const { bearerToken, getSession } = await import("./session");

beforeEach(() => {
  jar.clear();
  sent.clear();
});

describe("bearerToken", () => {
  it.each([
    ["Bearer abc.def", "abc.def"],
    ["bearer abc", "abc"],
    ["  Bearer   abc  ", "abc"],
  ])("reads %j", (header, token) => expect(bearerToken(header)).toBe(token));

  it.each([null, "", "Bearer", "Basic abc", "Bearer a b", "abc"])("refuses %j", (header) =>
    expect(bearerToken(header)).toBeUndefined(),
  );
});

describe("getSession", () => {
  it("is null with neither a cookie nor a bearer header", async () => {
    expect(await getSession()).toBeNull();
  });

  it("reads the session cookie, as the web always has", async () => {
    jar.set("session", "web-token");
    expect((await getSession())?.user.id).toBe("U1");
  });

  it("reads a bearer token when there is no cookie", async () => {
    sent.set("authorization", "Bearer app-token");
    expect(await getSession()).toMatchObject({ token: "app-token", user: { id: "U2", name: "Ben Example" } });
  });

  it("prefers the cookie when a request somehow carries both", async () => {
    jar.set("session", "web-token");
    sent.set("authorization", "Bearer app-token");
    expect((await getSession())?.user.id).toBe("U1");
  });

  it("refuses a bearer token PocketBase does not recognise", async () => {
    sent.set("authorization", "Bearer forged");
    expect(await getSession()).toBeNull();
  });

  it("refuses an expired bearer token without asking PocketBase", async () => {
    sent.set("authorization", "Bearer expired");
    expect(await getSession()).toBeNull();
  });
});
