import { useEffect, useId, useRef, useState } from "react";
import { focusInitialMenuItem, handleMenuArrowKeys } from "../utils/menuNav";

export default function AccountChip({
  user,
  currentPlayer,
  isAdmin,
  authLoading,
  onSignInClick,
  onSignOut,
  onAdminClick,
  pendingClaimsCount = 0,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();

  useEffect(() => {
    if (!menuOpen) return undefined;
    function onPointerDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setMenuOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (menuOpen) focusInitialMenuItem(menuRef.current);
  }, [menuOpen]);

  if (authLoading) {
    return (
      <div className="account-chip skeleton" aria-hidden="true">
        …
      </div>
    );
  }

  if (!user) {
    return (
      <button type="button" className="account-chip account-chip-signin" onClick={onSignInClick}>
        Sign in
      </button>
    );
  }

  const label = currentPlayer?.name || user.email || "Signed in";
  const role = isAdmin ? "Admin" : currentPlayer ? "Player" : "Unlinked";
  const showClaimsDot = isAdmin && pendingClaimsCount > 0;

  return (
    <div className="account-chip-wrap" ref={wrapRef}>
      <button
        type="button"
        className="account-chip account-chip-trigger"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuId}
        onClick={() => setMenuOpen((v) => !v)}
        title={user.email || ""}
      >
        <span className="account-chip-meta">
          <span className="account-chip-name">{label}</span>
          <span className={`account-chip-role role-${role.toLowerCase()}`}>{role}</span>
        </span>
        {showClaimsDot ? <span className="account-chip-admin-dot" aria-hidden="true" /> : null}
        <span className="account-chip-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {menuOpen && (
        <div
          className="account-menu"
          id={menuId}
          role="menu"
          ref={menuRef}
          onKeyDown={handleMenuArrowKeys}
        >
          {onAdminClick && (
            <button
              type="button"
              role="menuitem"
              className="account-menu-item"
              onClick={() => {
                setMenuOpen(false);
                onAdminClick();
              }}
            >
              Admin panel
              {pendingClaimsCount > 0 ? (
                <span className="account-menu-badge">{pendingClaimsCount}</span>
              ) : null}
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="account-menu-item"
            onClick={() => {
              setMenuOpen(false);
              onSignOut();
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
