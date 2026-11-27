import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import proxy from "./proxy";

const request = (path: string, headers: Record<string, string> = {}) =>
  new NextRequest(new URL(path, "https://eurovafliai.com"), { headers });

describe("proxy for /api/v1", () => {
  it("answers 401 JSON rather than redirecting an app request to /login", async () => {
    const response = proxy(request("/api/v1/me"));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("lets a bearer token through to the handler, which decides what it is worth", () => {
    expect(proxy(request("/api/v1/me", { authorization: "Bearer t" })).headers.get("x-middleware-next")).toBe("1");
  });

  it("keeps meta open, so an old build can learn it must update", () => {
    expect(proxy(request("/api/v1/meta")).headers.get("x-middleware-next")).toBe("1");
  });

  it("still sends a signed-out browser page to /login", () => {
    expect(proxy(request("/l/couch")).headers.get("location")).toContain("/login");
  });

  it("leaves the app's sign-in bounce public", () => {
    expect(proxy(request("/auth/app-callback?code=c&state=s")).headers.get("x-middleware-next")).toBe("1");
  });
});
