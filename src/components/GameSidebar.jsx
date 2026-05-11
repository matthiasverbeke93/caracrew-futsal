import { GAME_FILTERS } from "../constants";
import { playerStatusLabel, readinessClass } from "../utils/game";
import { useMemo, useState } from "react";

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
  const [showCalendar, setShowCalendar] = useState(false);
  const gamesByMonth = useMemo(() => {
    const groups = {};

    games.forEach((game) => {
      const monthKey = (game.game_date || "").slice(0, 7);
      if (!groups[monthKey]) groups[monthKey] = [];
      groups[monthKey].push(game);
    });

    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [games]);

  return (
    <aside className="sidebar">
      <div className="sidebar-header-row">
        <h2>All games</h2>
        <button
          className="calendar-toggle-button"
          type="button"
          onClick={() => setShowCalendar((prev) => !prev)}
        >
          {showCalendar ? "List" : "Calendar"}
        </button>
      </div>
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

      {showCalendar && (
        <div className="calendar-panel">
          {gamesByMonth.map(([month, monthGames]) => (
            <section key={month} className="calendar-month">
              <h3>{month}</h3>
              <div className="calendar-game-list">
                {monthGames.map((game) => (
                  <button
                    key={game.id}
                    className={`calendar-game-item ${game.id === selectedGameId ? "selected" : ""}`}
                    onClick={() => onSelectGame(game.id)}
                  >
                    <span>
                      {game.game_date} · {game.game_time || "--:--"}
                    </span>
                    <strong>{game.opponent}</strong>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {!showCalendar &&
        games.map((game) => {
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
              <span>{playerStatusLabel(playing)}</span>
              {status?.statsMissing && <span className="badge-warning">Stats missing</span>}
            </div>
          </button>
        );
      })}
    </aside>
  );
}
