import { GAME_FILTERS } from "../constants";
import { playerStatusLabel, readinessClass } from "../utils/game";

export default function GameSidebar({
  games,
  attendance,
  guestPlayers,
  gameStatusById,
  gameFilter,
  onFilterChange,
  selectedGameId,
  onSelectGame,
}) {
  return (
    <aside className="sidebar">
      <h2>All games</h2>
      <div className="game-filters">
        {GAME_FILTERS.map((filter) => (
          <button
            key={filter.id}
            className={gameFilter === filter.id ? "active" : ""}
            onClick={() => onFilterChange(filter.id)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {games.map((game) => {
        const gameRows = attendance.filter((a) => a.game_id === game.id);
        const gameGuestPlayers = guestPlayers.filter((p) => p.game_id === game.id);
        const playing =
          gameRows.filter((a) => a.status === "playing").length +
          gameGuestPlayers.filter((p) => p.status === "playing").length;
        const status = gameStatusById[game.id];

        return (
          <button
            key={game.id}
            className={`${readinessClass(playing)} ${game.id === selectedGameId ? "selected" : ""}`}
            onClick={() => onSelectGame(game.id)}
          >
            <div className="game-top">
              <strong>{game.opponent}</strong>
              <span>{status?.played ? "Played" : "To be played"}</span>
            </div>

            <div>
              {game.game_date} · {game.game_time}
            </div>
            <div>{game.location}</div>

            <div className="mini-counts">
              <span>{playing} playing</span>
              <span>{playerStatusLabel(playing)}</span>
              <span>
                {gameRows.filter((a) => a.status === "if_needed").length +
                  gameGuestPlayers.filter((p) => p.status === "if_needed").length}{" "}
                if needed
              </span>
              {status?.statsMissing && <span className="badge-warning">Stats missing</span>}
              {!!gameGuestPlayers.length && <span>{gameGuestPlayers.length} guests</span>}
            </div>
          </button>
        );
      })}
    </aside>
  );
}
