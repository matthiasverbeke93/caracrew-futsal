import { MIN_PLAYERS_WARNING } from "../constants";
import { isPlayed } from "../utils/game";

export default function SelectedGamePanel({
  selectedGame,
  counts,
  newGuestFirstName,
  setNewGuestFirstName,
  newGuestLastName,
  setNewGuestLastName,
  externalPlayerPool,
  addExistingExternalPlayerToGame,
  addGuestPlayer,
  canWrite,
}) {
  return (
    <section className="panel selected-game-panel">
      <div className="section-label">Selected game</div>
      <h2>{selectedGame.title || selectedGame.opponent}</h2>
      <p>
        {selectedGame.game_date} · {selectedGame.game_time} · {selectedGame.location}
      </p>

      {!isPlayed(selectedGame) && counts.playing < MIN_PLAYERS_WARNING && (
        <div className="warning-box">Low player count: only {counts.playing} marked as playing.</div>
      )}

      <div className="count-grid">
        <div>
          <strong>{counts.playing}</strong>
          <span>Playing</span>
        </div>
        <div>
          <strong>{counts.if_needed}</strong>
          <span>If needed</span>
        </div>
        <div>
          <strong>{counts.cant}</strong>
          <span>Can't</span>
        </div>
        <div>
          <strong>{counts.missing}</strong>
          <span>Missing</span>
        </div>
      </div>

      <div className="guest-card">
        <div>
          <div className="section-label">Game-only guests</div>
          <h3>Add external player (first + last name)</h3>
          <p>Added externals are saved in players and can be quickly reused for future games.</p>
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

        {!!externalPlayerPool.length && (
          <div className="existing-external-list">
            <span className="section-label">Saved externals</span>
            <div className="existing-external-grid">
              {externalPlayerPool.slice(0, 8).map((player) => (
                <button
                  key={player.id}
                  type="button"
                  onClick={() => addExistingExternalPlayerToGame(player.id)}
                  disabled={!canWrite}
                >
                  {player.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
