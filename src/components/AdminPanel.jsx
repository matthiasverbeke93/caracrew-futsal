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

function slugifyName(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function AdminPanel({ open, onClose, onChanged }) {
  const [tab, setTab] = useState("claims");
  const [claims, setClaims] = useState([]);
  const [users, setUsers] = useState([]);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState(null);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newId, setNewId] = useState("");
  const [newFixed, setNewFixed] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [claimsRes, usersRes, playersRes] = await Promise.all([
      supabase.rpc("admin_list_claims_with_email"),
      supabase.rpc("admin_list_auth_users"),
      supabase
        .from("players")
        .select("id, name, fixed, is_admin, auth_user_id, archived_at")
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
  const playerIds = useMemo(() => new Set(players.map((p) => p.id)), [players]);
  const activePlayers = useMemo(
    () => players.filter((p) => !p.archived_at),
    [players]
  );
  const archivedPlayers = useMemo(
    () => players.filter((p) => !!p.archived_at),
    [players]
  );

  const suggestedId = useMemo(() => {
    const base = slugifyName(newName);
    if (!base) return "";
    if (!playerIds.has(base)) return base;
    let n = 2;
    while (playerIds.has(`${base}-${n}`)) n += 1;
    return `${base}-${n}`;
  }, [newName, playerIds]);

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

  async function archivePlayer(player) {
    await run(`archive-${player.id}`, () =>
      supabase.rpc("admin_archive_player", { player_id_arg: player.id })
    );
  }

  async function restorePlayer(player) {
    await run(`restore-${player.id}`, () =>
      supabase.rpc("admin_restore_player", { player_id_arg: player.id })
    );
  }

  async function hardDeletePlayer(player) {
    const ok = window.confirm(
      `Permanently delete ${player.name}?\n\nThis removes ALL their attendance, stats, claims and votes. There is no undo.`
    );
    if (!ok) return;
    await run(`delete-${player.id}`, () =>
      supabase.rpc("admin_delete_player", { player_id_arg: player.id })
    );
  }

  async function toggleFixed(player) {
    await run(`fixed-${player.id}`, () =>
      supabase.rpc("admin_update_player", {
        player_id_arg: player.id,
        name_arg: null,
        fixed_arg: !player.fixed,
      })
    );
  }

  function startRename(player) {
    setEditingId(player.id);
    setEditingName(player.name);
  }

  function cancelRename() {
    setEditingId(null);
    setEditingName("");
  }

  async function saveRename(player) {
    const trimmed = editingName.trim();
    if (!trimmed || trimmed === player.name) {
      cancelRename();
      return;
    }
    await run(`rename-${player.id}`, () =>
      supabase.rpc("admin_update_player", {
        player_id_arg: player.id,
        name_arg: trimmed,
        fixed_arg: null,
      })
    );
    cancelRename();
  }

  async function createPlayer(e) {
    e.preventDefault();
    const finalName = newName.trim();
    const finalId = (newId.trim() || suggestedId).trim();
    if (!finalName || !finalId) return;
    await run("add-player", () =>
      supabase.rpc("admin_add_player", {
        player_id_arg: finalId,
        name_arg: finalName,
        fixed_arg: newFixed,
      })
    );
    setNewName("");
    setNewId("");
    setNewFixed(true);
    setShowAddForm(false);
  }

  function renderPlayerRow(p) {
    const linkedUser = usersById.get(p.auth_user_id);
    const isEditing = editingId === p.id;
    const isArchived = !!p.archived_at;
    return (
      <li key={p.id} className={`admin-player-row ${isArchived ? "archived" : ""}`}>
        <div className="admin-player-meta">
          <div className="admin-player-line">
            {isEditing ? (
              <input
                type="text"
                className="admin-rename-input"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveRename(p);
                  if (e.key === "Escape") cancelRename();
                }}
                autoFocus
              />
            ) : (
              <strong>{p.name}</strong>
            )}
            {p.is_admin && <span className="admin-pill role-admin">Admin</span>}
            {!p.fixed && <span className="admin-pill role-guest">Guest</span>}
            {isArchived && <span className="admin-pill role-archived">Archived</span>}
          </div>
          <div className="admin-player-sub">
            {linkedUser
              ? `Linked to ${linkedUser.email}`
              : p.auth_user_id
                ? `Linked (auth ${p.auth_user_id.slice(0, 8)}…)`
                : "Not linked"}
            {isArchived && ` · archived ${formatTimestamp(p.archived_at)}`}
          </div>
        </div>
        <div className="admin-player-actions">
          {isEditing ? (
            <>
              <button
                type="button"
                className="admin-btn primary"
                disabled={busyKey === `rename-${p.id}`}
                onClick={() => saveRename(p)}
              >
                Save
              </button>
              <button type="button" className="admin-btn" onClick={cancelRename}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="admin-btn"
                onClick={() => startRename(p)}
                title="Rename"
              >
                Rename
              </button>
              <button
                type="button"
                className="admin-btn"
                disabled={busyKey === `fixed-${p.id}`}
                onClick={() => toggleFixed(p)}
                title={p.fixed ? "Mark as guest" : "Promote to fixed roster"}
              >
                {p.fixed ? "→ Guest" : "→ Fixed"}
              </button>
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
                  className="admin-btn"
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
                  disabled={busyKey === `link-${p.id}` || unlinkedUsers.length === 0}
                >
                  <option value="">
                    {unlinkedUsers.length === 0 ? "No unlinked accounts" : "Link to account…"}
                  </option>
                  {unlinkedUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.email}
                    </option>
                  ))}
                </select>
              )}
              {isArchived ? (
                <button
                  type="button"
                  className="admin-btn primary"
                  disabled={busyKey === `restore-${p.id}`}
                  onClick={() => restorePlayer(p)}
                >
                  Restore
                </button>
              ) : (
                <button
                  type="button"
                  className="admin-btn"
                  disabled={busyKey === `archive-${p.id}`}
                  onClick={() => archivePlayer(p)}
                  title="Hide from active rosters but keep history"
                >
                  Archive
                </button>
              )}
              <button
                type="button"
                className="admin-btn danger"
                disabled={busyKey === `delete-${p.id}`}
                onClick={() => hardDeletePlayer(p)}
                title="Permanent delete — removes attendance, stats, votes"
              >
                Delete
              </button>
            </>
          )}
        </div>
      </li>
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
            <div className="admin-player-toolbar">
              <button
                type="button"
                className="admin-btn primary"
                onClick={() => setShowAddForm((v) => !v)}
              >
                {showAddForm ? "× Cancel" : "+ Add player"}
              </button>
              <label className="admin-toggle">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                />
                <span>
                  Show archived {archivedPlayers.length > 0 ? `(${archivedPlayers.length})` : ""}
                </span>
              </label>
            </div>

            {showAddForm && (
              <form className="admin-add-form" onSubmit={createPlayer}>
                <label>
                  <span>Name</span>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Full name"
                    autoFocus
                    required
                  />
                </label>
                <label>
                  <span>ID</span>
                  <input
                    type="text"
                    value={newId || suggestedId}
                    onChange={(e) => setNewId(e.target.value)}
                    placeholder={suggestedId || "auto"}
                    pattern="[a-z0-9-]+"
                    title="Lowercase letters, digits and dashes only"
                    required
                  />
                </label>
                <label className="admin-add-fixed">
                  <input
                    type="checkbox"
                    checked={newFixed}
                    onChange={(e) => setNewFixed(e.target.checked)}
                  />
                  <span>Fixed roster (uncheck for guest)</span>
                </label>
                <button
                  type="submit"
                  className="admin-btn primary"
                  disabled={busyKey === "add-player" || !newName.trim()}
                >
                  Create
                </button>
              </form>
            )}

            <h3 className="admin-section-title">
              Active ({activePlayers.length})
            </h3>
            <ul className="admin-player-list">
              {activePlayers.map((p) => renderPlayerRow(p))}
            </ul>

            {showArchived && archivedPlayers.length > 0 && (
              <>
                <h3 className="admin-section-title" style={{ marginTop: 12 }}>
                  Archived ({archivedPlayers.length})
                </h3>
                <ul className="admin-player-list muted">
                  {archivedPlayers.map((p) => renderPlayerRow(p))}
                </ul>
              </>
            )}
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
