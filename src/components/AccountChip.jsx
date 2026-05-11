export default function AccountChip({
  user,
  currentPlayer,
  isAdmin,
  authLoading,
  onSignInClick,
  onSignOut,
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
      <button
        type="button"
        className="account-chip-signout"
        onClick={onSignOut}
        title="Sign out"
      >
        Sign out
      </button>
    </div>
  );
}
