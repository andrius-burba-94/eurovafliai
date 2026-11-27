import { describe, expect, it, vi } from "vitest";

import { apiErrorSchema } from "@eurovafliai/core/api/errors";
import { API_VERSION, meSchema, metaSchema, timeSchema } from "@eurovafliai/core/api/meta";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: async () => {} }));

let session: { token: string; user: { id: string; email: string; name: string; avatar: string } } | null = null;
vi.mock("@/lib/auth/session", () => ({ getSession: async () => session }));

const meta = await import("./meta/route");
const time = await import("./time/route");
const me = await import("./me/route");

describe("/api/v1 foundation", () => {
  it("meta names the API version and a semver floor, without a session", async () => {
    const body = metaSchema.parse(await meta.GET().json());
    expect(body.apiVersion).toBe(API_VERSION);
  });

  it("time is the server's clock in milliseconds", async () => {
    const before = Date.now();
    const { now } = timeSchema.parse(await (await time.GET()).json());
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });

  it("me refuses with the closed error shape when there is no session", async () => {
    session = null;
    const response = await me.GET();
    expect(response.status).toBe(401);
    expect(apiErrorSchema.parse(await response.json()).code).toBe("unauthenticated");
  });

  it("me returns the signed-in user and nothing else", async () => {
    session = { token: "t", user: { id: "U1", email: "a@example.test", name: "Ann Example", avatar: "x.png" } };
    const response = await me.GET();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual(
      meSchema.parse({ id: "U1", email: "a@example.test", name: "Ann Example" }),
    );
  });
});
