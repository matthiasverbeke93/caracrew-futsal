import { ATTENDANCE_OPTIONS } from "../constants";
import { isAttendanceEditable } from "../utils/game";

export default function AttendanceTab({
  allGamePlayers,
  externalPlayerPool,
  newGuestFirstName,
  setNewGuestFirstName,
  newGuestLastName,
  setNewGuestLastName,
  addGuestPlayer,
  gameAttendance,
  saveGuestAttendance,
  saveAttendance,
  removeGuestPlayer,
  onOpenPlayer,
  selectedGame,
  canEditAttendanceFor,
  canManageGame,
  isSignedIn,
  onRequestSignIn,
}) {
  const attendanceOpen = isAttendanceEditable(selectedGame);
  const lockedBecausePlayed = !attendanceOpen;

  function disabledTitle(player) {
    if (!isSignedIn) return "Sign in to mark attendance";
    if (lockedBecausePlayed) return "Attendance is locked — match already played";
    return `Only ${player.name} or an admin can edit this`;
  }

  return (
    <div className="match-tab-content">
      <h2>Attendance</h2>

      {lockedBecausePlayed && (
        <div className="warning-box">
          Attendance is locked — this match was played on {selectedGame.game_date}.
        </div>
      )}

      {!isSignedIn && !lockedBecausePlayed && (
        <div className="info-banner">
          <button type="button" className="player-link" onClick={onRequestSignIn}>
            Sign in
          </button>{" "}
          to mark your own attendance.
        </div>
      )}

      <div className="player-grid">
        {allGamePlayers.map((player) => {
          const current =
            player.type === "ad_hoc_guest"
              ? player.status
              : gameAttendance.find((a) => a.player_id === player.id)?.status;

          const isAdHoc = player.type === "ad_hoc_guest";
          const rowEditable =
            !lockedBecausePlayed &&
            (isAdHoc ? canManageGame : canEditAttendanceFor(player.id));

          return (
            <div className={`player-card ${player.type !== "fixed" ? "guest-player-card" : ""}`} key={player.id}>
              <div className="player-card-header">
                <strong>
                  <button type="button" className="player-link" onClick={() => onOpenPlayer(player.id)}>
                    {player.name}
                  </button>
                  <span className={player.type === "fixed" ? "fixed-badge" : "guest-badge"}>
                    {player.type === "fixed" ? "Fixed" : "Guest"}
                  </span>
                </strong>
                {isAdHoc && (
                  <button
                    className="remove-player-button"
                    onClick={() => removeGuestPlayer(player.id)}
                    disabled={!canManageGame || lockedBecausePlayed}
                    title={!canManageGame ? "Admin only" : ""}
                  >
                    Remove
                  </button>
                )}
              </div>

              {ATTENDANCE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={current === option.value ? "active" : ""}
                  disabled={!rowEditable}
                  title={!rowEditable ? disabledTitle(player) : undefined}
                  onClick={() =>
                    isAdHoc
                      ? saveGuestAttendance(player.id, option.value)
                      : saveAttendance(player.id, option.value)
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          );
        })}
      </div>

      <div className="guest-card">
        <div>
          <div className="section-label">Guests · admin only</div>
          <h3>Add guest player</h3>
          <p>Guests are saved for future games and shown in all historical player cards.</p>
          <p>Current known guests: {externalPlayerPool.map((p) => p.name).join(", ") || "None"}</p>
        </div>

        <div className="guest-add-row">
          <input
            value={newGuestFirstName}
            onChange={(e) => setNewGuestFirstName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addGuestPlayer();
            }}
            placeholder="First name"
            disabled={!canManageGame || lockedBecausePlayed}
          />
          <input
            value={newGuestLastName}
            onChange={(e) => setNewGuestLastName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addGuestPlayer();
            }}
            placeholder="Last name"
            disabled={!canManageGame || lockedBecausePlayed}
          />
          <button
            onClick={addGuestPlayer}
            disabled={!canManageGame || lockedBecausePlayed}
            title={!canManageGame ? "Admin only" : ""}
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
