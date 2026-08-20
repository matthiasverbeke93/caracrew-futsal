import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  BUG_KINDS,
  BUG_SEVERITIES,
  buildBugReportRow,
  MESSAGE_MAX,
  validateBugReport,
} from "../utils/bugReport";

/**
 * "Report a bug" — writes one row to `bug_reports`; a scheduled Action mails it on
 * (see scripts/send-bug-reports.mjs). Open to signed-out visitors too, which is why
 * there is a name/email fallback: without it an anonymous report is unanswerable.
 *
 * Deliberately NOT an optimistic write. Everywhere else in the app the user can see
 * whether their change landed, so rolling back is honest; here they cannot, and
 * "thanks, logged it" for a report that never arrived is worse than a spinner.
 */
export default function BugReportModal({ onClose, user, currentPlayer, seasonSlug }) {
  const [message, setMessage] = useState("");
  const [kind, setKind] = useState("bug");
  const [severity, setSeverity] = useState("annoying");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);

  const signedIn = Boolean(user?.id);

  // App mounts this only while it is open, so every open is a fresh mount with a
  // clean form — no reset effect, and no cascading renders from one.
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;
    const invalid = validateBugReport({ message, kind, severity });
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);

    const row = buildBugReportRow({
      message,
      kind,
      severity,
      user,
      currentPlayer,
      reporterName: name,
      reporterEmail: email,
      context: {
        url: window.location.href,
        seasonSlug,
        appBuild: import.meta.env.VITE_APP_BUILD,
        userAgent: window.navigator?.userAgent,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      },
    });

    const { error: insertError } = await supabase.from("bug_reports").insert(row);
    setBusy(false);
    if (insertError) {
      setError(insertError.message || "Could not send the report. Try again in a moment.");
      return;
    }
    setSent(true);
  }

  const remaining = MESSAGE_MAX - message.trim().length;

  return (
    <div className="auth-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="auth-modal bug-modal"
        role="dialog"
        aria-labelledby="bug-modal-title"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="auth-modal-header">
          <h2 id="bug-modal-title">{sent ? "Thanks!" : "Report a bug"}</h2>
          <button type="button" className="auth-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {sent ? (
          <div className="bug-sent">
            <p>
              Logged and on its way to the admin. If you left an address you may get a reply.
            </p>
            <button type="button" className="auth-submit" onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <form className="auth-form bug-form" onSubmit={handleSubmit}>
            <p className="bug-modal-intro">
              Found something broken, a wrong score, or have an idea? The page you are on,
              the season and your browser are attached automatically — no need to describe them.
            </p>

            <div className="bug-choice-row">
              <label>
                <span>Type</span>
                <select value={kind} onChange={(e) => setKind(e.target.value)}>
                  {BUG_KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>How bad</span>
                <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
                  {BUG_SEVERITIES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label>
              <span>What happened?</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                maxLength={MESSAGE_MAX}
                required
                autoFocus
                placeholder="e.g. I marked myself In for the Jan Breydel game but the count still says 6"
              />
            </label>
            {remaining < 200 && (
              <p className="bug-charcount">{remaining} characters left</p>
            )}

            {signedIn ? (
              <p className="bug-identity">
                Filed as <strong>{currentPlayer?.name || user.email}</strong>
                {currentPlayer && user?.email ? ` (${user.email})` : ""}.
              </p>
            ) : (
              <div className="bug-choice-row">
                <label>
                  <span>Your name (optional)</span>
                  <input
                    type="text"
                    value={name}
                    maxLength={120}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="So we know who to thank"
                  />
                </label>
                <label>
                  <span>Email (optional)</span>
                  <input
                    type="email"
                    value={email}
                    maxLength={200}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Only if you want a reply"
                  />
                </label>
              </div>
            )}

            {error && <p className="auth-error">{error}</p>}

            <button type="submit" className="auth-submit" disabled={busy}>
              {busy ? "Sending…" : "Send report"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
