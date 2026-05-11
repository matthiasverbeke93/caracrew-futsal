import { MIN_PLAYERS_WARNING } from "../constants";
import { isPlayed } from "../utils/game";

export default function SelectedGamePanel({
  selectedGame,
  counts,
}) {
  return (
    <section className="panel selected-game-panel">
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
    </section>
  );
}
