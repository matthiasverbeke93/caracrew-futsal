import { ATTENDANCE_OPTIONS } from "../constants";

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
  canWrite,
}) {
  return (
    <section className="panel">
      <h2>Attendance</h2>

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
                  {player.name}
                  <span className={player.type === "fixed" ? "fixed-badge" : "guest-badge"}>
                    {player.type === "fixed" ? "Fixed" : "Guest"}
                  </span>
                </strong>
                {player.type === "ad_hoc_guest" && (
                  <button
                    className="remove-player-button"
                    onClick={() => removeGuestPlayer(player.id)}
                    disabled={!canWrite}
                  >
                    Remove
                  </button>
                )}
              </div>

              {ATTENDANCE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={current === option.value ? "active" : ""}
                  disabled={!canWrite}
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
            disabled={!canWrite}
          />
          <input
            value={newGuestLastName}
            onChange={(e) => setNewGuestLastName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addGuestPlayer();
            }}
            placeholder="Last name"
            disabled={!canWrite}
          />
          <button onClick={addGuestPlayer} disabled={!canWrite}>
            +
          </button>
        </div>
      </div>
    </section>
  );
}
