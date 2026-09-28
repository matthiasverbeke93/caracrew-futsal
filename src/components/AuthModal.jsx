import { useEffect, useRef, useState } from "react";
import { useModalFocus } from "../hooks/useModalFocus";

const COPY = {
  sign_in: {
    title: "Sign in",
    submit: "Sign in",
    switchText: "New here?",
    switchAction: "Create an account",
    switchTo: "sign_up",
  },
  sign_up: {
    title: "Create account",
    submit: "Create account",
    switchText: "Already have an account?",
    switchAction: "Sign in",
    switchTo: "sign_in",
  },
  forgot: {
    title: "Reset password",
    submit: "Send reset link",
    switchText: "Remembered it?",
    switchAction: "Back to sign in",
    switchTo: "sign_in",
  },
};

/** Mounted only while it is showing (see App), so `initialMode` / `initialError` seed the
 *  state once and a fresh open always starts clean — no reset effect needed. */
export default function AuthModal({
  onClose,
  signIn,
  signUp,
  requestPasswordReset,
  initialMode = "sign_in",
  initialError = null,
}) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(initialError);
  const [info, setInfo] = useState(null);
  const emailRef = useRef(null);

  const dialogRef = useRef(null);
  useModalFocus(dialogRef, true);

  // Focus once, on open. This used to share the Escape effect, which re-ran whenever
  // `onClose` changed identity — i.e. on parent re-renders — and yanked focus back to
  // the email field mid-password.
  useEffect(() => {
    const id = setTimeout(() => emailRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, []);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onCloseRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function goTo(next) {
    setMode(next);
    setMessage(null);
    setInfo(null);
    setPassword("");
  }

  const copy = COPY[mode] || COPY.sign_in;
  const needsPassword = mode !== "forgot";

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setMessage(null);
    setInfo(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail || (needsPassword && !password)) {
      setMessage(needsPassword ? "Email and password are required." : "Email is required.");
      return;
    }
    setBusy(true);
    const res =
      mode === "forgot"
        ? await requestPasswordReset(trimmedEmail)
        : await (mode === "sign_in" ? signIn : signUp)(trimmedEmail, password);
    setBusy(false);
    if (res.error) {
      setMessage(res.error);
      return;
    }
    if (mode === "sign_up") {
      setInfo("Account created. You can sign in right away with the same email and password.");
      return;
    }
    if (mode === "forgot") {
      setInfo(
        `If an account exists for ${trimmedEmail}, a reset link is on its way. ` +
          "Open it on this device — the link signs you in just long enough to set a new password."
      );
      return;
    }
    onClose();
  }

  return (
    <div
      className="auth-modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="auth-modal"
        role="dialog"
        ref={dialogRef}
        tabIndex={-1}
        aria-labelledby="auth-modal-title"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="auth-modal-header">
          <h2 id="auth-modal-title">{copy.title}</h2>
          <button
            type="button"
            className="auth-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            <span>Email</span>
            <input
              ref={emailRef}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          {needsPassword && (
            <label>
              <span>Password</span>
              <input
                type="password"
                autoComplete={mode === "sign_in" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </label>
          )}
          {mode === "sign_in" && (
            <button
              type="button"
              className="auth-inline-link"
              onClick={() => goTo("forgot")}
            >
              Forgot your password?
            </button>
          )}
          {message && <p className="auth-error">{message}</p>}
          {info && <p className="auth-info">{info}</p>}
          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? "…" : copy.submit}
          </button>
        </form>
        <div className="auth-switch">
          <span>{copy.switchText} </span>
          <button
            type="button"
            className="auth-switch-link"
            onClick={() => goTo(copy.switchTo)}
          >
            {copy.switchAction}
          </button>
        </div>
        {mode === "sign_up" && (
          <p className="auth-fineprint">
            After signing up, send your full name to the team admin so they can link your
            account to your player profile.
          </p>
        )}
        {mode === "forgot" && (
          <p className="auth-fineprint">
            The link is single-use and expires after about an hour. Check your spam folder if
            it does not show up.
          </p>
        )}
      </div>
    </div>
  );
}
