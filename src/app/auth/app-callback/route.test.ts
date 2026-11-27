import { describe, expect, it } from "vitest";

import { GET } from "./route";

const bounce = (query: string) => GET(new Request(`https://eurovafliai.com/auth/app-callback${query}`));

describe("/auth/app-callback", () => {
  it("hands Google's code and state to the app and to nothing else", () => {
    const response = bounce("?code=4%2F0Ab&state=s1&scope=email&authuser=0");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("eurovafliai://auth?code=4%2F0Ab&state=s1");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("says Google refused rather than forwarding Google's wording", () => {
    expect(bounce("?error=access_denied&state=s1").headers.get("location")).toBe(
      "eurovafliai://auth?error=google_denied",
    );
  });

  it.each(["", "?code=abc", "?state=s1"])("reports a missing code for %j", (query) => {
    expect(bounce(query).headers.get("location")).toBe("eurovafliai://auth?error=missing_code");
  });

  it("cannot be turned into markup by what it echoes", async () => {
    const body = await bounce('?code="><script>x</script>&state=s').text();
    expect(body).not.toContain("<script>");
  });
});
