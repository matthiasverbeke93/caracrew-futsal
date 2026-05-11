import { useEffect, useRef, useState } from "react";

const COPY = {
  sign_in: {
    title: "Sign in",
    submit: "Sign in",
    switchText: "New here?",
    switchAction: "Create an account",
  },
  sign_up: {
    title: "Create account",
    submit: "Create account",
    switchText: "Already have an account?",
    switchAction: "Sign in",
  },
};

export default function AuthModal({ open, onClose, signIn, signUp }) {
  const [mode, setMode] = useState("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [info, setInfo] = useState(null);
  const emailRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    setTimeout(() => emailRef.current?.focus(), 0);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function switchMode() {
    setMode((m) => (m === "sign_in" ? "sign_up" : "sign_in"));
    setMessage(null);
    setInfo(null);
  }

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setMessage(null);
    setInfo(null);
    if (!email || !password) {
      setMessage("Email and password are required.");
      return;
    }
    setBusy(true);
    const fn = mode === "sign_in" ? signIn : signUp;
    const res = await fn(email.trim(), password);
    setBusy(false);
    if (res.error) {
      setMessage(res.error);
      return;
    }
    if (mode === "sign_up") {
      setInfo(
        "Account created. If email confirmation is enabled in Supabase, check your inbox before signing in."
      );
      return;
    }
    onClose();
  }

  const copy = COPY[mode];

  return (
    <div
      className="auth-modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="auth-modal"
        role="dialog"
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
            onClick={switchMode}
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
      </div>
    </div>
  );
}
