import { describe, expect, it } from "vitest";

import { parsePublicEnv, parseServerEnv } from "./schema";

const validServerEnv = {
  PB_INTERNAL_URL: "http://127.0.0.1:8095",
  PB_SUPERUSER_EMAIL: "admin@eurovafliai.test",
  PB_SUPERUSER_PASSWORD: "not-a-real-password",
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_CLIENT_SECRET: "client-secret",
  SESSION_COOKIE_NAME: "eurovafliai_session",
};

describe("parsePublicEnv", () => {
  it("accepts a proxied PocketBase URL", () => {
    const env = parsePublicEnv({
      NEXT_PUBLIC_PB_URL: "https://eurovafliai.labrium.online/pb",
    });
    expect(env.NEXT_PUBLIC_PB_URL).toBe(
      "https://eurovafliai.labrium.online/pb",
    );
  });

  it("rejects a value that is not a URL", () => {
    expect(() => parsePublicEnv({ NEXT_PUBLIC_PB_URL: "8095" })).toThrow(
      /NEXT_PUBLIC_PB_URL/,
    );
  });

  it("rejects a missing value", () => {
    expect(() => parsePublicEnv({})).toThrow(/NEXT_PUBLIC_PB_URL/);
  });
});

describe("parseServerEnv", () => {
  it("accepts a complete environment", () => {
    expect(parseServerEnv(validServerEnv)).toMatchObject(validServerEnv);
  });

  it("defaults the session cookie name", () => {
    const withoutCookieName: Record<string, string> = { ...validServerEnv };
    delete withoutCookieName.SESSION_COOKIE_NAME;
    expect(parseServerEnv(withoutCookieName).SESSION_COOKIE_NAME).toBe(
      "eurovafliai_session",
    );
  });

  it("names every missing variable in one error, and no values", () => {
    let message = "";
    try {
      parseServerEnv({
        PB_INTERNAL_URL: "http://127.0.0.1:8095",
        PB_SUPERUSER_EMAIL: "admin@eurovafliai.test",
        PB_SUPERUSER_PASSWORD: "not-a-real-password",
      });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain("GOOGLE_CLIENT_ID");
    expect(message).toContain("GOOGLE_CLIENT_SECRET");
    expect(message).not.toContain("not-a-real-password");
  });

  it("rejects a PocketBase URL that is not a URL", () => {
    expect(() =>
      parseServerEnv({ ...validServerEnv, PB_INTERNAL_URL: "127.0.0.1:8095" }),
    ).toThrow(/PB_INTERNAL_URL/);
  });
});
