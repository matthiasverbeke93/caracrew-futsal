import { describe, expect, it } from "vitest";
import {
  buildBugReportRow,
  clip,
  collectBugContext,
  MESSAGE_MAX,
  validateBugReport,
} from "./bugReport";

describe("validateBugReport", () => {
  it("rejects an empty or whitespace-only message", () => {
    expect(validateBugReport({ message: "" })).toMatch(/what went wrong/i);
    expect(validateBugReport({ message: "   \n  " })).toMatch(/what went wrong/i);
  });

  it("rejects a message shorter than the DB's 3-character floor", () => {
    expect(validateBugReport({ message: "ab" })).toBeTruthy();
    expect(validateBugReport({ message: "abc" })).toBeNull();
  });

  it("rejects a message past the DB's cap", () => {
    expect(validateBugReport({ message: "x".repeat(MESSAGE_MAX) })).toBeNull();
    expect(validateBugReport({ message: "x".repeat(MESSAGE_MAX + 1) })).toMatch(/under/i);
  });

  it("rejects a kind or severity outside the check constraint", () => {
    expect(validateBugReport({ message: "broken", kind: "wat" })).toMatch(/type/i);
    expect(validateBugReport({ message: "broken", severity: "urgent" })).toMatch(/blocking/i);
    expect(validateBugReport({ message: "broken", kind: "data", severity: "minor" })).toBeNull();
  });
});

describe("clip", () => {
  it("trims, nulls out empties and caps length", () => {
    expect(clip("  hi  ", 10)).toBe("hi");
    expect(clip("   ", 10)).toBeNull();
    expect(clip(null, 10)).toBeNull();
    expect(clip(undefined, 10)).toBeNull();
    expect(clip("abcdefghij", 4)).toBe("abcd");
  });
});

describe("collectBugContext", () => {
  it("captures the page, season, build and viewport", () => {
    expect(
      collectBugContext({
        url: "https://caracrew.org/?season=2627&game=x",
        seasonSlug: "2627",
        appBuild: "2026-08-20T09:00:00.000Z",
        userAgent: "Mozilla/5.0 (iPhone)",
        viewportWidth: 390,
        viewportHeight: 844,
      })
    ).toEqual({
      page_url: "https://caracrew.org/?season=2627&game=x",
      season_slug: "2627",
      app_build: "2026-08-20T09:00:00.000Z",
      user_agent: "Mozilla/5.0 (iPhone)",
      viewport: "390x844",
    });
  });

  it("truncates rather than letting Postgres reject the insert", () => {
    // A real Chrome-on-Android UA already runs long; the column caps at 500.
    const ctx = collectBugContext({
      url: `https://caracrew.org/?q=${"a".repeat(900)}`,
      userAgent: "U".repeat(900),
    });
    expect(ctx.page_url).toHaveLength(500);
    expect(ctx.user_agent).toHaveLength(500);
  });

  it("omits a viewport it cannot make sense of", () => {
    expect(collectBugContext({}).viewport).toBeNull();
    expect(collectBugContext({ viewportWidth: 0, viewportHeight: 0 }).viewport).toBeNull();
    expect(collectBugContext({ viewportWidth: NaN, viewportHeight: 800 }).viewport).toBeNull();
  });

  it("rounds fractional viewports (zoomed browsers report decimals)", () => {
    expect(collectBugContext({ viewportWidth: 390.4, viewportHeight: 843.6 }).viewport).toBe(
      "390x844"
    );
  });
});

describe("buildBugReportRow", () => {
  const user = { id: "uid-1", email: "matthias@example.com" };
  const player = { id: "matthias-verbeke", name: "Matthias Verbeke" };

  it("takes identity from the session when signed in", () => {
    const row = buildBugReportRow({
      message: "  Score is wrong  ",
      kind: "data",
      severity: "annoying",
      user,
      currentPlayer: player,
    });
    expect(row).toMatchObject({
      kind: "data",
      severity: "annoying",
      message: "Score is wrong",
      auth_user_id: "uid-1",
      reporter_player_id: "matthias-verbeke",
      reporter_name: "Matthias Verbeke",
      reporter_email: "matthias@example.com",
    });
  });

  it("ignores typed identity when signed in, so a report can't be misattributed", () => {
    const row = buildBugReportRow({
      message: "broken",
      user,
      currentPlayer: player,
      reporterName: "Someone Else",
      reporterEmail: "someone@else.com",
    });
    expect(row.reporter_name).toBe("Matthias Verbeke");
    expect(row.reporter_email).toBe("matthias@example.com");
  });

  it("falls back to the typed name and email for a signed-out visitor", () => {
    const row = buildBugReportRow({
      message: "broken",
      reporterName: "  Guest Keeper ",
      reporterEmail: "guest@example.com ",
    });
    expect(row.auth_user_id).toBeNull();
    expect(row.reporter_player_id).toBeNull();
    expect(row.reporter_name).toBe("Guest Keeper");
    expect(row.reporter_email).toBe("guest@example.com");
  });

  it("leaves a signed-in-but-unlinked account without a player id", () => {
    const row = buildBugReportRow({ message: "broken", user, currentPlayer: null });
    expect(row.auth_user_id).toBe("uid-1");
    expect(row.reporter_player_id).toBeNull();
    expect(row.reporter_name).toBeNull();
    expect(row.reporter_email).toBe("matthias@example.com");
  });

  it("never sets the delivery columns RLS insists are null", () => {
    const row = buildBugReportRow({ message: "broken" });
    expect(row).not.toHaveProperty("emailed_at");
    expect(row).not.toHaveProperty("email_error");
    expect(row).not.toHaveProperty("resolved_at");
  });

  it("defaults to a plain bug of middling severity", () => {
    const row = buildBugReportRow({ message: "broken" });
    expect(row.kind).toBe("bug");
    expect(row.severity).toBe("annoying");
  });
});
