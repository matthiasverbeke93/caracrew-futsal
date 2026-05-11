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
  canWrite,
}) {
  const attendanceOpen = isAttendanceEditable(selectedGame);
  const canEdit = canWrite && attendanceOpen;
  const lockedBecausePlayed = canWrite && !attendanceOpen;

  return (
    <section className="panel">
      <h2>Attendance</h2>

      {lockedBecausePlayed && (
        <div className="warning-box">
          Attendance is locked — this match was played on {selectedGame.game_date}.
        </div>
      )}

      <div className="player-grid">
        {allGamePlayers.map((player) => {
          const current =
            player.type === "ad_hoc_guest"
              ? player.status
              : gameAttendance.find((a) => a.player_id === player.id)?.status;

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
                {player.type === "ad_hoc_guest" && (
                  <button
                    className="remove-player-button"
                    onClick={() => removeGuestPlayer(player.id)}
                    disabled={!canEdit}
                  >
                    Remove
                  </button>
                )}
              </div>

              {ATTENDANCE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={current === option.value ? "active" : ""}
                  disabled={!canEdit}
                  onClick={() =>
                    player.type === "ad_hoc_guest"
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
          <div className="section-label">Guests</div>
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
            disabled={!canEdit}
          />
          <input
            value={newGuestLastName}
            onChange={(e) => setNewGuestLastName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addGuestPlayer();
            }}
            placeholder="Last name"
            disabled={!canEdit}
          />
          <button onClick={addGuestPlayer} disabled={!canEdit}>
            +
          </button>
        </div>
      </div>
    </section>
  );
}
