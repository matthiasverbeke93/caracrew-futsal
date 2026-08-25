import { useEffect, useRef, useState } from "react";

const MIN_LENGTH = 6;

/**
 * Shown when the user lands back on the app from a Supabase password-recovery link.
 * At that point they already hold a (short-lived) session, so this is the last step:
 * set a password and keep the session.
 */
export default function NewPasswordModal({ onDismiss, updatePassword }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [done, setDone] = useState(false);
  const passwordRef = useRef(null);

  useEffect(() => {
    setTimeout(() => passwordRef.current?.focus(), 0);
    function onKey(e) {
      if (e.key === "Escape") onDismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setMessage(null);
    if (password.length < MIN_LENGTH) {
      setMessage(`Use at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setMessage("The two passwords do not match.");
      return;
    }
    setBusy(true);
    const res = await updatePassword(password);
    setBusy(false);
    if (res.error) {
      setMessage(res.error);
      return;
    }
    setDone(true);
  }

  return (
    <div className="auth-modal-backdrop" role="presentation">
      <div
        className="auth-modal"
        role="dialog"
        aria-labelledby="new-password-title"
        aria-modal="true"
      >
        <div className="auth-modal-header">
          <h2 id="new-password-title">{done ? "Password updated" : "Set a new password"}</h2>
          <button
            type="button"
            className="auth-modal-close"
            onClick={onDismiss}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {done ? (
          <div className="auth-form">
            <p className="auth-info">
              Your password has been changed and you are signed in on this device.
            </p>
            <button type="button" className="auth-submit" onClick={onDismiss}>
              Continue
            </button>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <label>
              <span>New password</span>
              <input
                ref={passwordRef}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={MIN_LENGTH}
              />
            </label>
            <label>
              <span>Repeat new password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={MIN_LENGTH}
              />
            </label>
            {message && <p className="auth-error">{message}</p>}
            <button type="submit" className="auth-submit" disabled={busy}>
              {busy ? "…" : "Save password"}
            </button>
          </form>
        )}
        {!done && (
          <p className="auth-fineprint">
            This link is single-use. Close this without saving and you will need a fresh reset
            email.
          </p>
        )}
      </div>
    </div>
  );
}
