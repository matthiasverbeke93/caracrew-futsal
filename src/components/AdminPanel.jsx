import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

function formatTimestamp(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminPanel({ open, onClose, onChanged }) {
  const [tab, setTab] = useState("claims");
  const [claims, setClaims] = useState([]);
  const [users, setUsers] = useState([]);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [claimsRes, usersRes, playersRes] = await Promise.all([
      supabase.rpc("admin_list_claims_with_email"),
      supabase.rpc("admin_list_auth_users"),
      supabase
        .from("players")
        .select("id, name, fixed, is_admin, auth_user_id")
        .order("name", { ascending: true }),
    ]);
    if (claimsRes.error) setError(claimsRes.error.message);
    if (usersRes.error) setError(usersRes.error.message);
    if (playersRes.error) setError(playersRes.error.message);
    setClaims(claimsRes.data || []);
    setUsers(usersRes.data || []);
    setPlayers(playersRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch updates many list states
    if (open) load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const pendingClaims = useMemo(() => claims.filter((c) => c.status === "pending"), [claims]);
  const historyClaims = useMemo(() => claims.filter((c) => c.status !== "pending"), [claims]);
  const unlinkedUsers = useMemo(
    () => users.filter((u) => !u.linked_player_id),
    [users]
  );
  const usersById = useMemo(() => {
    const m = new Map();
    for (const u of users) m.set(u.id, u);
    return m;
  }, [users]);

  async function run(key, action) {
    setBusyKey(key);
    setError(null);
    const { error: rpcErr } = await action();
    setBusyKey(null);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    await load();
    onChanged?.();
  }

  async function approveClaim(claim, promoteAdmin) {
    await run(`approve-${claim.id}`, () =>
      supabase.rpc("admin_approve_claim", {
        claim_id: claim.id,
        promote_admin: !!promoteAdmin,
      })
    );
  }

  async function rejectClaim(claim) {
    await run(`reject-${claim.id}`, () =>
      supabase.rpc("admin_reject_claim", { claim_id: claim.id, note: null })
    );
  }

  async function setAdmin(player, makeAdmin) {
    await run(`admin-${player.id}`, () =>
      supabase.rpc("admin_set_admin_flag", { player_id_arg: player.id, make_admin: makeAdmin })
    );
  }

  async function unlinkPlayer(player) {
    await run(`unlink-${player.id}`, () =>
      supabase.rpc("admin_unlink_player", { player_id_arg: player.id })
    );
  }

  async function linkPlayer(player, userId) {
    await run(`link-${player.id}`, () =>
      supabase.rpc("admin_link_player", { player_id_arg: player.id, user_id_arg: userId })
    );
  }

  if (!open) return null;

  return (
    <div className="auth-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="auth-modal admin-panel"
        role="dialog"
        aria-labelledby="admin-panel-title"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="auth-modal-header">
          <h2 id="admin-panel-title">Admin panel</h2>
          <button type="button" className="auth-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="admin-tabs">
          <button
            type="button"
            className={tab === "claims" ? "active" : ""}
            onClick={() => setTab("claims")}
          >
            Claims
            {pendingClaims.length > 0 && (
              <span className="admin-tab-badge">{pendingClaims.length}</span>
            )}
          </button>
          <button
            type="button"
            className={tab === "players" ? "active" : ""}
            onClick={() => setTab("players")}
          >
            Players
          </button>
          <button
            type="button"
            className={tab === "accounts" ? "active" : ""}
            onClick={() => setTab("accounts")}
          >
            Accounts
            {unlinkedUsers.length > 0 && (
              <span className="admin-tab-badge muted">{unlinkedUsers.length}</span>
            )}
          </button>
        </div>

        {error && <div className="auth-error admin-error">{error}</div>}
        {loading && <p className="admin-loading">Loading…</p>}

        {tab === "claims" && !loading && (
          <div className="admin-section">
            {pendingClaims.length === 0 && historyClaims.length === 0 && (
              <p className="admin-empty">No claims yet.</p>
            )}

            {pendingClaims.length > 0 && (
              <>
                <h3 className="admin-section-title">Pending</h3>
                <ul className="admin-claim-list">
                  {pendingClaims.map((c) => (
                    <li key={c.id} className="admin-claim-row">
                      <div className="admin-claim-meta">
                        <div className="admin-claim-line">
                          <strong>{c.user_email}</strong>
                          <span className="admin-claim-sep">→</span>
                          <strong>{c.player_name}</strong>
                        </div>
                        <div className="admin-claim-sub">
                          Submitted {formatTimestamp(c.created_at)}
                          {c.message ? ` · "${c.message}"` : ""}
                        </div>
                      </div>
                      <div className="admin-claim-actions">
                        <button
                          type="button"
                          className="admin-btn primary"
                          disabled={busyKey === `approve-${c.id}`}
                          onClick={() => approveClaim(c, false)}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="admin-btn"
                          disabled={busyKey === `approve-${c.id}`}
                          onClick={() => approveClaim(c, true)}
                          title="Approve and grant admin"
                        >
                          Approve + admin
                        </button>
                        <button
                          type="button"
                          className="admin-btn danger"
                          disabled={busyKey === `reject-${c.id}`}
                          onClick={() => rejectClaim(c)}
                        >
                          Reject
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {historyClaims.length > 0 && (
              <>
                <h3 className="admin-section-title">History</h3>
                <ul className="admin-claim-list muted">
                  {historyClaims.map((c) => (
                    <li key={c.id} className="admin-claim-row">
                      <div className="admin-claim-meta">
                        <div className="admin-claim-line">
                          <strong>{c.user_email}</strong>
                          <span className="admin-claim-sep">→</span>
                          <strong>{c.player_name}</strong>
                          <span className={`admin-claim-status status-${c.status}`}>
                            {c.status}
                          </span>
                        </div>
                        <div className="admin-claim-sub">
                          {formatTimestamp(c.decided_at || c.created_at)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {tab === "players" && !loading && (
          <div className="admin-section">
            <ul className="admin-player-list">
              {players.map((p) => {
                const linkedUser = usersById.get(p.auth_user_id);
                return (
                  <li key={p.id} className="admin-player-row">
                    <div className="admin-player-meta">
                      <div className="admin-player-line">
                        <strong>{p.name}</strong>
                        {p.is_admin && <span className="admin-pill role-admin">Admin</span>}
                        {!p.fixed && <span className="admin-pill role-guest">Guest</span>}
                      </div>
                      <div className="admin-player-sub">
                        {linkedUser
                          ? `Linked to ${linkedUser.email}`
                          : p.auth_user_id
                            ? `Linked (auth ${p.auth_user_id.slice(0, 8)}…)`
                            : "Not linked"}
                      </div>
                    </div>
                    <div className="admin-player-actions">
                      <button
                        type="button"
                        className="admin-btn"
                        disabled={busyKey === `admin-${p.id}`}
                        onClick={() => setAdmin(p, !p.is_admin)}
                      >
                        {p.is_admin ? "Remove admin" : "Make admin"}
                      </button>
                      {p.auth_user_id ? (
                        <button
                          type="button"
                          className="admin-btn danger"
                          disabled={busyKey === `unlink-${p.id}`}
                          onClick={() => unlinkPlayer(p)}
                        >
                          Unlink
                        </button>
                      ) : (
                        <select
                          className="admin-link-select"
                          defaultValue=""
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val) linkPlayer(p, val);
                          }}
                          disabled={busyKey === `link-${p.id}`}
                        >
                          <option value="">Link to account…</option>
                          {unlinkedUsers.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.email}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {tab === "accounts" && !loading && (
          <div className="admin-section">
            <h3 className="admin-section-title">
              Unlinked accounts {unlinkedUsers.length > 0 ? `(${unlinkedUsers.length})` : ""}
            </h3>
            {unlinkedUsers.length === 0 ? (
              <p className="admin-empty">Every account is linked.</p>
            ) : (
              <ul className="admin-claim-list">
                {unlinkedUsers.map((u) => (
                  <li key={u.id} className="admin-claim-row">
                    <div className="admin-claim-meta">
                      <div className="admin-claim-line">
                        <strong>{u.email}</strong>
                      </div>
                      <div className="admin-claim-sub">
                        Signed up {formatTimestamp(u.created_at)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <h3 className="admin-section-title" style={{ marginTop: 16 }}>
              All accounts
            </h3>
            <ul className="admin-claim-list muted">
              {users.map((u) => (
                <li key={u.id} className="admin-claim-row">
                  <div className="admin-claim-meta">
                    <div className="admin-claim-line">
                      <strong>{u.email}</strong>
                      {u.linked_player_name && (
                        <span className="admin-pill role-player">{u.linked_player_name}</span>
                      )}
                    </div>
                    <div className="admin-claim-sub">{formatTimestamp(u.created_at)}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
