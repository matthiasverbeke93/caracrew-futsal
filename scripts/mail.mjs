// Shared Resend plumbing for the digest and bug-report jobs.
//
// Both run on a PUBLIC repo, so their Actions logs are public too: never log a full address or a
// player's name from these jobs — use maskEmail() or counts.
import { fetchWithRetry } from "./http.mjs";

/** "matthias@example.com" -> "m***@example.com". Enough to tell two lines apart in a log. */
export function maskEmail(email) {
  const s = String(email ?? "").trim();
  const at = s.lastIndexOf("@");
  if (at <= 0) return "***";
  return `${s[0]}***${s.slice(at)}`;
}

/** Mask every address inside free text — Resend's error bodies can quote one. */
export function redactEmails(text) {
  return String(text ?? "").replace(/[^\s<>"'(),;:]+@[^\s<>"'(),;:]+\.[a-z]{2,}/gi, maskEmail);
}

/** ISO-8601 week label of a date, e.g. "2026-W40" — stable across the Friday a digest is sent. */
export function isoWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day); // Thursday of this week decides the ISO year
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * POST one email to Resend. `idempotencyKey` is required: Resend drops a repeat of the same key
 * for 24 h, which is what makes a re-run (or a retry after a lost response) safe instead of
 * mailing the same people twice — and is the only reason this POST may be retried at all.
 */
export async function sendResendEmail(resendKey, payload, idempotencyKey) {
  if (!idempotencyKey) throw new Error("sendResendEmail needs an idempotency key");
  const res = await fetchWithRetry(
    "https://api.resend.com/emails",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(payload),
    },
    { label: "resend" }
  );
  const body = await res.text();
  // 409 on the key means this mail already went (or is going) out under it. A re-run can build a
  // slightly different body (someone RSVP'd since), which Resend rejects as a different payload
  // for the same key rather than sending — that is the "don't double-mail" outcome we want.
  if (res.status === 409 && /idempoten/i.test(body)) return { duplicate: true };
  if (!res.ok) throw new Error(`Resend ${res.status}: ${redactEmails(body)}`);
  return { duplicate: false, body };
}
