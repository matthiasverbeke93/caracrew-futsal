import { describe, expect, it } from "vitest";
import {
  describeReporter,
  escapeHtml,
  formatBugReportEmail,
  MAX_ATTEMPTS,
} from "./send-bug-reports.mjs";

const base = {
  id: "11111111-2222-3333-4444-555555555555",
  created_at: "2026-08-20T09:30:00.000Z",
  kind: "bug",
  severity: "blocking",
  message: "Attendance count is stuck at 6",
  reporter_name: "Stef Claes",
  reporter_email: "stef@example.com",
  page_url: "https://caracrew.org/?season=2627&game=abc",
  season_slug: "2627",
  viewport: "390x844",
  app_build: "2026-08-20T08:00:00.000Z",
  user_agent: "Mozilla/5.0 (iPhone)",
};

describe("describeReporter", () => {
  it("prefers name and email together", () => {
    expect(describeReporter(base)).toBe("Stef Claes <stef@example.com>");
  });

  it("falls back through name, then email", () => {
    expect(describeReporter({ ...base, reporter_email: null })).toBe("Stef Claes");
    expect(describeReporter({ ...base, reporter_name: null })).toBe("stef@example.com");
  });

  it("distinguishes an anonymous report from an unlinked account", () => {
    expect(describeReporter({ reporter_name: null, reporter_email: null })).toBe("anonymous");
    expect(
      describeReporter({ reporter_name: null, reporter_email: null, auth_user_id: "uid" })
    ).toBe("signed in, no player linked");
  });
});

describe("formatBugReportEmail", () => {
  it("puts the gist in the subject", () => {
    const { subject } = formatBugReportEmail(base);
    expect(subject).toBe("[Caracrew bug] blocking — Attendance count is stuck at 6");
  });

  it("uses only the first line of a multi-line report in the subject", () => {
    const { subject } = formatBugReportEmail({
      ...base,
      message: "Score is wrong\nIt says 10-2 but we lost 2-10",
    });
    expect(subject).toBe("[Caracrew bug] blocking — Score is wrong");
  });

  it("truncates a long subject rather than filling the mailbox list", () => {
    const { subject } = formatBugReportEmail({ ...base, message: "x".repeat(200) });
    expect(subject.length).toBeLessThan(120);
    expect(subject.endsWith("…")).toBe(true);
  });

  it("survives a report with no description", () => {
    const { subject } = formatBugReportEmail({ ...base, message: "" });
    expect(subject).toContain("no description");
  });

  it("labels unknown kinds and severities instead of dropping them", () => {
    const { subject } = formatBugReportEmail({ ...base, kind: "weird", severity: "spicy" });
    expect(subject).toContain("weird");
    expect(subject).toContain("spicy");
  });

  it("keeps the message and every context field in the text body", () => {
    const { text } = formatBugReportEmail(base, { appUrl: "https://caracrew.org" });
    expect(text).toContain("Attendance count is stuck at 6");
    expect(text).toContain("From: Stef Claes <stef@example.com>");
    expect(text).toContain("Page: https://caracrew.org/?season=2627&game=abc");
    expect(text).toContain("Screen: 390x844");
    expect(text).toContain("Build: 2026-08-20T08:00:00.000Z");
    expect(text).toContain(`Report id: ${base.id}`);
    expect(text).toContain("App: https://caracrew.org");
  });

  it("renders em-dashes for missing context rather than 'null'", () => {
    const { text } = formatBugReportEmail({
      id: "x",
      kind: "idea",
      severity: "minor",
      message: "add a dark mode",
    });
    expect(text).not.toMatch(/null|undefined/);
    expect(text).toContain("Page: —");
  });

  // The report body arrives via an anonymous insert, so it is hostile input.
  it("escapes HTML in the message so a report cannot inject markup", () => {
    const { html } = formatBugReportEmail({
      ...base,
      message: '<img src=x onerror="alert(1)"> & <b>bold</b>',
    });
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>bold</b>");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("&amp;");
  });

  it("escapes HTML in the reporter name and page url too", () => {
    const { html } = formatBugReportEmail({
      ...base,
      reporter_name: "<script>x</script>",
      page_url: 'https://x/"><script>y</script>',
    });
    expect(html).not.toContain("<script>");
  });

  it("omits the app link when no url is configured", () => {
    expect(formatBugReportEmail(base).html).not.toContain("Open the app");
    expect(formatBugReportEmail(base).text).not.toContain("App:");
  });
});

describe("escapeHtml", () => {
  it("handles the five characters that matter and nullish input", () => {
    expect(escapeHtml('<>&"')).toBe("&lt;&gt;&amp;&quot;");
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });
});

describe("MAX_ATTEMPTS", () => {
  it("gives up eventually, so one poison report cannot fail every run forever", () => {
    expect(MAX_ATTEMPTS).toBeGreaterThan(1);
    expect(MAX_ATTEMPTS).toBeLessThanOrEqual(10);
  });
});
