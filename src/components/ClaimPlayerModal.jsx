import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

export default function ClaimPlayerModal({ open, onClose, onSubmit }) {
  const [players, setPlayers] = useState([]);
  const [pendingPlayerIds, setPendingPlayerIds] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [pickedId, setPickedId] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setMessage(null);
      const [playersRes, claimsRes] = await Promise.all([
        supabase
          .from("players")
          .select("id, name, fixed, auth_user_id")
          .is("auth_user_id", null)
          .order("name", { ascending: true }),
        supabase
          .from("player_claims")
          .select("player_id")
          .eq("status", "pending"),
      ]);
      if (cancelled) return;
      setPlayers(playersRes.data || []);
      setPendingPlayerIds(new Set((claimsRes.data || []).map((c) => c.player_id)));
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const claimable = useMemo(
    () => players.filter((p) => !pendingPlayerIds.has(p.id)),
    [players, pendingPlayerIds]
  );

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy || !pickedId) return;
    setBusy(true);
    setMessage(null);
    const res = await onSubmit(pickedId, note);
    setBusy(false);
    if (res?.error) {
      setMessage(res.error);
      return;
    }
    onClose();
  }

  return (
    <div className="auth-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="auth-modal claim-modal"
        role="dialog"
        aria-labelledby="claim-modal-title"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="auth-modal-header">
          <h2 id="claim-modal-title">Claim your player</h2>
          <button type="button" className="auth-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="claim-modal-intro">
          Pick your name from the roster. The team admin will get a request to confirm it's
          you, then your account will be linked.
        </p>

        {loading ? (
          <p className="claim-empty">Loading roster…</p>
        ) : claimable.length === 0 ? (
          <p className="claim-empty">
            No unclaimed players right now. Ask the admin to add your roster row first.
          </p>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="claim-players-grid" role="radiogroup" aria-label="Pick your player">
              {claimable.map((p) => (
                <label
                  key={p.id}
                  className={`claim-player-card ${pickedId === p.id ? "selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="claim-player"
                    value={p.id}
                    checked={pickedId === p.id}
                    onChange={() => setPickedId(p.id)}
                  />
                  <span className="claim-player-name">{p.name}</span>
                  <span className="claim-player-role">{p.fixed ? "Fixed" : "Guest"}</span>
                </label>
              ))}
            </div>

            <label>
              <span>Optional note for the admin</span>
              <input
                type="text"
                value={note}
                placeholder="e.g. nickname, last game played, …"
                onChange={(e) => setNote(e.target.value)}
                maxLength={140}
              />
            </label>

            {message && <p className="auth-error">{message}</p>}

            <button
              type="submit"
              className="auth-submit"
              disabled={!pickedId || busy}
            >
              {busy ? "Submitting…" : "Submit claim"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
