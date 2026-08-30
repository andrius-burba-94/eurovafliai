import { describe, expect, it } from "vitest";

import {
  buildAuthorizeUrl,
  cookieMaxAgeFromToken,
  redirectUriFor,
  statesMatch,
} from "./oauth";

describe("redirectUriFor", () => {
  it("appends the callback path", () => {
    expect(redirectUriFor("http://localhost:3007")).toBe(
      "http://localhost:3007/auth/callback",
    );
  });

  it("does not double the slash when the origin has a trailing one", () => {
    expect(redirectUriFor("https://eurovafliai.labrium.online/")).toBe(
      "https://eurovafliai.labrium.online/auth/callback",
    );
  });

  it("keeps localhost as localhost — Google registered that exact form", () => {
    // 127.0.0.1 is a *different* redirect URI to Google and is not registered.
    expect(redirectUriFor("http://localhost:3007")).toContain("localhost");
  });
});

describe("buildAuthorizeUrl", () => {
  const authURL =
    "https://accounts.google.com/o/oauth2/v2/auth?client_id=x&state=abc&redirect_uri=";

  it("appends the percent-encoded redirect URI", () => {
    expect(buildAuthorizeUrl(authURL, "http://localhost:3007/auth/callback")).toBe(
      `${authURL}http%3A%2F%2Flocalhost%3A3007%2Fauth%2Fcallback`,
    );
  });

  it("throws rather than build a malformed URL if PocketBase changes shape", () => {
    expect(() =>
      buildAuthorizeUrl(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id=x",
        "http://localhost:3007/auth/callback",
      ),
    ).toThrow(/redirect_uri=/);
  });
});

describe("statesMatch", () => {
  it("accepts an exact match", () => {
    expect(statesMatch("s0m3state", "s0m3state")).toBe(true);
  });

  it("rejects a different value of the same length", () => {
    expect(statesMatch("aaaaaaaa", "aaaaaaab")).toBe(false);
  });

  it("rejects differing lengths without throwing", () => {
    expect(statesMatch("short", "longer-value")).toBe(false);
  });

  it("rejects a missing expected or received state", () => {
    expect(statesMatch(undefined, "x")).toBe(false);
    expect(statesMatch("x", undefined)).toBe(false);
    expect(statesMatch(undefined, undefined)).toBe(false);
    expect(statesMatch("", "")).toBe(false);
  });
});

describe("cookieMaxAgeFromToken", () => {
  const tokenWithExp = (exp: unknown) =>
    [
      Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url"),
      Buffer.from(JSON.stringify({ exp })).toString("base64url"),
      "signature",
    ].join(".");

  it("returns the seconds remaining until the token expires", () => {
    const now = 1_800_000_000_000; // ms
    const exp = Math.floor(now / 1000) + 3600;
    expect(cookieMaxAgeFromToken(tokenWithExp(exp), now)).toBe(3600);
  });

  it("returns null for an already expired token", () => {
    const now = 1_800_000_000_000;
    const exp = Math.floor(now / 1000) - 1;
    expect(cookieMaxAgeFromToken(tokenWithExp(exp), now)).toBeNull();
  });

  it("returns null when exp is missing or not a number", () => {
    expect(cookieMaxAgeFromToken(tokenWithExp("soon"))).toBeNull();
    expect(
      cookieMaxAgeFromToken(
        [
          Buffer.from("{}").toString("base64url"),
          Buffer.from("{}").toString("base64url"),
          "sig",
        ].join("."),
      ),
    ).toBeNull();
  });

  it("returns null for a token that is not a JWT at all", () => {
    expect(cookieMaxAgeFromToken("not-a-jwt")).toBeNull();
    expect(cookieMaxAgeFromToken("")).toBeNull();
    expect(cookieMaxAgeFromToken("a.b.c")).toBeNull();
  });
});
