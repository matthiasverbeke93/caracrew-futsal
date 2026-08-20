#!/usr/bin/env node
/**
 * Mail out in-app bug reports.
 *
 * The app only inserts into `bug_reports` (see supabase/bug_reports.sql); this job
 * is what turns a row into an email. Run on a schedule, it picks up everything with
 * `emailed_at is null`, mails one message per report, and stamps the row. The row
 * stays the source of truth, so a broken mailer loses nothing — the reports are
 * still in the admin panel.
 *
 * SECURITY NOTE: a report's text, name and page URL come from an anonymous insert,
 * i.e. they are attacker-controlled. Everything is HTML-escaped before it goes into
 * the mail body; do not "simplify" that away.
 *
 * Env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — service role required: RLS makes
 *     bug_reports admin-only for select, and the stamping is an update
 *   RESEND_API_KEY — https://resend.com
 *   BUG_REPORT_TO_EMAIL — where reports go (required unless dry run)
 *   BUG_REPORT_FROM_EMAIL — optional, falls back to DIGEST_FROM_EMAIL, then to
 *     onboarding@resend.dev (which Resend only delivers to the account owner)
 *   BUG_REPORT_DRY_RUN — 1/true to print what would be sent, and send nothing
 *   BUG_REPORT_MAX — optional batch cap per run (default 25)
 *   PUBLIC_APP_URL — used to link back to the app
 */

import { createClient } from "@supabase/supabase-js";

/** Give up mailing a row after this many failed attempts, so one poison report
 *  cannot fail the job forever. It stays visible in the admin panel. */
export const MAX_ATTEMPTS = 5;

const DEFAULT_BATCH = 25;

export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isTruthyFlag(raw) {
  return /^(1|true|yes|on)$/i.test(String(raw ?? "").trim());
}

const KIND_LABELS = { bug: "Bug", data: "Wrong data", idea: "Idea" };
const SEVERITY_LABELS = { blocking: "Blocking", annoying: "Annoying", minor: "Minor" };

/** "who filed this", in one line, whatever we happen to know about them. */
export function describeReporter(report) {
  const name = report.reporter_name?.trim();
  const email = report.reporter_email?.trim();
  if (name && email) return `${name} <${email}>`;
  if (name) return name;
  if (email) return email;
  return report.auth_user_id ? "signed in, no player linked" : "anonymous";
}

/**
 * One report -> one email. Pure, so the shape (and the escaping) is unit-tested
 * rather than discovered in an inbox.
 */
export function formatBugReportEmail(report, { appUrl = "" } = {}) {
  const kind = KIND_LABELS[report.kind] || report.kind || "Report";
  const severity = SEVERITY_LABELS[report.severity] || report.severity || "";
  const message = String(report.message ?? "").trim();

  // Subject carries the gist; a mailbox list view shows little else.
  const firstLine = message.split("\n")[0].trim();
  const gist = firstLine.length > 70 ? `${firstLine.slice(0, 69)}…` : firstLine;
  const subject = `[Caracrew ${kind.toLowerCase()}] ${severity.toLowerCase()} — ${gist || "no description"}`;

  const rows = [
    ["Type", kind],
    ["Severity", severity],
    ["From", describeReporter(report)],
    ["Page", report.page_url || "—"],
    ["Season", report.season_slug || "—"],
    ["Screen", report.viewport || "—"],
    ["Build", report.app_build || "—"],
    ["Browser", report.user_agent || "—"],
    ["Filed", report.created_at || "—"],
    ["Report id", report.id || "—"],
  ];

  const text = [
    message,
    "",
    "—",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    appUrl ? `\nApp: ${appUrl}` : "",
  ].join("\n");

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:16px;background:#f5f7fa;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;margin:0 auto;">
    <tr><td style="padding:12px 16px;background:#146c43;border-radius:12px 12px 0 0;color:#ffffff;font-weight:700;">
      ${escapeHtml(kind)} · ${escapeHtml(severity)}
    </td></tr>
    <tr><td style="padding:16px;background:#ffffff;border:1px solid #e2e8f0;border-top:0;">
      <div style="font-size:15px;line-height:1.55;white-space:pre-wrap;word-break:break-word;">${escapeHtml(
        message
      )}</div>
    </td></tr>
    <tr><td style="padding:12px 16px;background:#ffffff;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size:12px;color:#475569;">
        ${rows
          .map(
            ([k, v]) =>
              `<tr><td style="padding:2px 8px 2px 0;white-space:nowrap;vertical-align:top;"><strong>${escapeHtml(
                k
              )}</strong></td><td style="padding:2px 0;word-break:break-all;">${escapeHtml(
                v
              )}</td></tr>`
          )
          .join("")}
      </table>
      ${
        appUrl
          ? `<p style="margin:12px 0 0;font-size:12px;"><a href="${escapeHtml(
              appUrl
            )}" style="color:#146c43;">Open the app</a></p>`
          : ""
      }
    </td></tr>
  </table>
</body></html>`;

  return { subject, html, text };
}

async function sendOneEmail(resendKey, payload) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Resend ${res.status}: ${body}`);
  return body;
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const dryRun = isTruthyFlag(process.env.BUG_REPORT_DRY_RUN);
  const to = String(process.env.BUG_REPORT_TO_EMAIL || "").trim();
  const from =
    process.env.BUG_REPORT_FROM_EMAIL ||
    process.env.DIGEST_FROM_EMAIL ||
    "Caracrew bugs <onboarding@resend.dev>";
  const appUrl = String(process.env.PUBLIC_APP_URL || "").trim();
  const batch = Number(process.env.BUG_REPORT_MAX) || DEFAULT_BATCH;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  if (!dryRun && !resendKey) throw new Error("Missing RESEND_API_KEY");
  if (!dryRun && !to) throw new Error("Missing BUG_REPORT_TO_EMAIL — nowhere to send reports");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: reports, error } = await supabase
    .from("bug_reports")
    .select("*")
    .is("emailed_at", null)
    .lt("email_attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(batch);
  if (error) throw new Error(`Reading bug_reports failed: ${error.message}`);

  // Rows that hit the attempt ceiling are dropped from the queue, not lost — say so,
  // otherwise "I filed a report and heard nothing" has no explanation.
  const { count: stuckCount } = await supabase
    .from("bug_reports")
    .select("id", { count: "exact", head: true })
    .is("emailed_at", null)
    .gte("email_attempts", MAX_ATTEMPTS);
  if (stuckCount) {
    console.warn(
      `[bugs] ${stuckCount} report(s) gave up after ${MAX_ATTEMPTS} attempts — still in the admin panel, never mailed`
    );
  }

  if (!reports?.length) {
    console.log("[bugs] nothing to send");
    return;
  }
  console.log(`[bugs] ${reports.length} report(s) to mail -> ${dryRun ? "(dry run)" : to}`);

  if (/resend\.dev/i.test(from)) {
    console.warn(
      "[bugs] WARNING: sending from a resend.dev address — Resend only delivers those to the account owner. Set BUG_REPORT_FROM_EMAIL to a verified domain."
    );
  }

  const failures = [];
  for (const [i, report] of reports.entries()) {
    const { subject, html, text } = formatBugReportEmail(report, { appUrl });
    if (dryRun) {
      console.log(`  - ${report.id} ${subject}`);
      continue;
    }
    if (i > 0) await sleep(600); // Resend allows ~2 req/s
    try {
      await sendOneEmail(resendKey, { from, to: [to], subject, html, text });
      const { error: stampErr } = await supabase
        .from("bug_reports")
        .update({ emailed_at: new Date().toISOString(), email_error: null })
        .eq("id", report.id);
      // A send that cannot be stamped WILL be sent again next run. Better a duplicate
      // in the inbox than a silently swallowed report, but it needs to be loud.
      if (stampErr) {
        console.error(`[bugs] SENT BUT NOT STAMPED ${report.id}: ${stampErr.message}`);
        failures.push({ id: report.id, message: `stamp failed: ${stampErr.message}` });
      } else {
        console.log(`[bugs] sent ${report.id}`);
      }
    } catch (err) {
      const msg = err?.message || String(err);
      failures.push({ id: report.id, message: msg });
      console.error(`[bugs] FAILED ${report.id}: ${msg}`);
      await supabase
        .from("bug_reports")
        .update({
          email_error: msg.slice(0, 1000),
          email_attempts: (report.email_attempts ?? 0) + 1,
        })
        .eq("id", report.id);
    }
  }

  if (dryRun) {
    console.log("[bugs] DRY RUN — nothing sent, nothing stamped");
    return;
  }

  console.log(`[bugs] done: ${reports.length - failures.length}/${reports.length} sent`);
  if (failures.length) {
    throw new Error(`${failures.length} of ${reports.length} report mails failed`);
  }
}

const isMain =
  import.meta.url ===
  (process.argv[1] ? new URL(`file://${process.argv[1].replace(/\\/g, "/")}`).href : null);

if (isMain) {
  main().catch((err) => {
    console.error("[bugs] Fatal:", err);
    process.exit(1);
  });
}
