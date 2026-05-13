/**
 * Turn Supabase Auth errors into short, user-facing copy.
 * @param {import("@supabase/supabase-js").AuthError | null | undefined} err
 * @returns {string}
 */
export function formatAuthError(err) {
  if (!err) return "Something went wrong. Please try again.";
  const code = err.code || "";
  const msg = (err.message || "").trim();
  const lower = msg.toLowerCase();

  if (
    code === "over_email_send_rate_limit" ||
    lower.includes("email rate limit") ||
    lower.includes("rate limit exceeded")
  ) {
    return (
      "Too many account or reset emails were sent from this app recently (team-wide limit). " +
      "Wait about an hour and try again, or contact your admin if it keeps happening."
    );
  }

  return msg || "Something went wrong. Please try again.";
}
