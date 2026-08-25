import { describe, expect, it } from "vitest";
import { normalizeSiteUrl, readRecoveryFromUrl } from "./authRedirect";

describe("normalizeSiteUrl", () => {
  it("keeps an absolute URL and strips trailing slashes", () => {
    expect(normalizeSiteUrl("https://www.caracrew.org/")).toBe("https://www.caracrew.org");
    expect(normalizeSiteUrl("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("adds https to a host-only value", () => {
    expect(normalizeSiteUrl("www.caracrew.org")).toBe("https://www.caracrew.org");
    expect(normalizeSiteUrl("  //www.caracrew.org  ")).toBe("https://www.caracrew.org");
  });

  it("returns empty for nothing usable", () => {
    expect(normalizeSiteUrl("")).toBe("");
    expect(normalizeSiteUrl(null)).toBe("");
  });
});

describe("readRecoveryFromUrl", () => {
  it("detects a recovery link (implicit flow hash)", () => {
    const res = readRecoveryFromUrl("#access_token=abc&refresh_token=def&type=recovery", "");
    expect(res.recovery).toBe(true);
    expect(res.error).toBeNull();
  });

  it("reports an expired link instead of a recovery, since it carries no session", () => {
    const res = readRecoveryFromUrl(
      "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
      ""
    );
    expect(res.recovery).toBe(false);
    expect(res.error).toMatch(/invalid or has already been used/i);
  });

  it("ignores the app's own query routing", () => {
    expect(readRecoveryFromUrl("", "?season=2627&game=12")).toEqual({
      recovery: false,
      error: null,
    });
    expect(readRecoveryFromUrl("", "")).toEqual({ recovery: false, error: null });
    expect(readRecoveryFromUrl(undefined, undefined)).toEqual({ recovery: false, error: null });
  });

  it("also reads the query string, for PKCE-style redirects", () => {
    expect(readRecoveryFromUrl("", "?type=recovery&token_hash=xyz").recovery).toBe(true);
  });
});
