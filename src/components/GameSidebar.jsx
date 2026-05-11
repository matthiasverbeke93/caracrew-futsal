import { FILTER_CONFLICTS, GAME_FILTERS } from "../constants";
import { getDifficulty } from "../utils/difficulty";
import { playerStatusLabel, readinessClass } from "../utils/game";
import { useMemo, useState } from "react";

export default function GameSidebar({
  games,
  attendance,
  guestPlayers,
  gameStatusById,
  gameFilters,
  onFiltersChange,
  selectedGameId,
  onSelectGame,
}) {
  function toggleFilter(filterId) {
    if (filterId === "all") {
      onFiltersChange([]);
      return;
    }

    const isActive = gameFilters.includes(filterId);
    if (isActive) {
      onFiltersChange(gameFilters.filter((f) => f !== filterId));
      return;
    }

    const conflicts = FILTER_CONFLICTS[filterId] || [];
    const cleaned = gameFilters.filter((f) => !conflicts.includes(f));
    onFiltersChange([...cleaned, filterId]);
  }

  function isFilterActive(filterId) {
    if (filterId === "all") return gameFilters.length === 0;
    return gameFilters.includes(filterId);
  }

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
            className={isFilterActive(filter.id) ? "active" : ""}
            onClick={() => toggleFilter(filter.id)}
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
                {monthGames.map((game) => {
                  const gameRows = attendance.filter((a) => a.game_id === game.id);
                  const gameGuestRows = guestPlayers.filter((p) => p.game_id === game.id);
                  const playing =
                    gameRows.filter((a) => a.status === "playing").length +
                    gameGuestRows.filter((p) => p.status === "playing").length;
                  const status = gameStatusById[game.id];
                  const tone = status?.played
                    ? "neutral"
                    : readinessClass(playing).replace("game-card ", "");
                  const difficulty = getDifficulty(game.opponent);

                  return (
                    <button
                      key={game.id}
                      className={`calendar-game-item ${tone} ${game.id === selectedGameId ? "selected" : ""}`}
                      onClick={() => onSelectGame(game.id)}
                    >
                      <span>
                        {game.game_date} · {game.game_time || "--:--"}
                      </span>
                      <strong>{game.opponent}</strong>
                      {difficulty && (
                        <span className={`difficulty-chip ${difficulty.className}`}>
                          {difficulty.label} · P{difficulty.position}
                        </span>
                      )}
                    </button>
                  );
                })}
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

        const played = status?.played;
        const cardClass = played ? "game-card neutral" : readinessClass(playing);
        const difficulty = getDifficulty(game.opponent);

        return (
          <button
            key={game.id}
            className={`${cardClass} ${game.id === selectedGameId ? "selected" : ""}`}
            onClick={() => onSelectGame(game.id)}
          >
            <div className="game-top">
              <strong>{game.opponent}</strong>
              <span>{played ? "Played" : "To be played"}</span>
            </div>

            <div>
              {game.game_date} · {game.game_time}
            </div>
            <div>{game.location}</div>

            <div className="mini-counts">
              {!played && <span>{playerStatusLabel(playing)}</span>}
              {difficulty && (
                <span className={`difficulty-chip ${difficulty.className}`}>
                  {difficulty.label} · P{difficulty.position}
                </span>
              )}
              {status?.statsMissing && <span className="badge-warning">Stats missing</span>}
            </div>
          </button>
        );
      })}
    </aside>
  );
}
