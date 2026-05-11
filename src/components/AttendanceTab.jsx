import { ATTENDANCE_OPTIONS } from "../constants";

export default function AttendanceTab({
  allGamePlayers,
  gameAttendance,
  saveGuestAttendance,
  saveAttendance,
  removeGuestPlayer,
  canWrite,
}) {
  return (
    <section className="panel">
      <div className="section-label">Selected game</div>
      <h2>Attendance</h2>

      <div className="player-grid">
        {allGamePlayers.map((player) => {
          const current =
            player.type === "guest"
              ? player.status
              : gameAttendance.find((a) => a.player_id === player.id)?.status;

          return (
            <div className={`player-card ${player.type === "guest" ? "guest-player-card" : ""}`} key={player.id}>
              <div className="player-card-header">
                <strong>
                  {player.name}
                  <span className={player.type === "guest" ? "guest-badge" : "fixed-badge"}>
                    {player.type === "guest" ? "External" : "Fixed"}
                  </span>
                </strong>
                {player.type === "guest" && (
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
                    player.type === "guest"
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
    </section>
  );
}
