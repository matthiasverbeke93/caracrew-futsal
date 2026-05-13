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
  if (authLoading) {
    return <div className="account-chip skeleton" aria-hidden="true">…</div>;
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

  return (
    <div className="account-chip account-chip-user">
      <div className="account-chip-meta">
        <span className="account-chip-name" title={user.email || ""}>
          {label}
        </span>
        <span className={`account-chip-role role-${role.toLowerCase()}`}>{role}</span>
      </div>
      <div className="account-chip-actions">
        {onAdminClick && (
          <span className="account-chip-admin-wrap">
            <button
              type="button"
              className="account-chip-admin"
              onClick={onAdminClick}
              title={
                pendingClaimsCount > 0
                  ? `Open admin panel · ${pendingClaimsCount} pending player claim${
                      pendingClaimsCount === 1 ? "" : "s"
                    }`
                  : "Open admin panel"
              }
              aria-label={
                pendingClaimsCount > 0
                  ? `Admin · ${pendingClaimsCount} pending player claim${
                      pendingClaimsCount === 1 ? "" : "s"
                    }`
                  : "Open admin panel"
              }
            >
              Admin
            </button>
            {pendingClaimsCount > 0 ? (
              <span className="account-chip-admin-dot" aria-hidden="true" />
            ) : null}
          </span>
        )}
        <button
          type="button"
          className="account-chip-signout"
          onClick={onSignOut}
          title="Sign out"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
