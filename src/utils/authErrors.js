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

  if (code === "same_password" || lower.includes("should be different from the old password")) {
    return "That is already your password. Pick a different one.";
  }

  if (code === "weak_password" || lower.includes("password should be at least")) {
    return "That password is too short — use at least 6 characters.";
  }

  // A recovery session is short-lived; once it lapses updateUser fails with no session.
  if (code === "session_not_found" || lower.includes("auth session missing")) {
    return "This reset link has expired. Request a new password reset email.";
  }

  return msg || "Something went wrong. Please try again.";
}
