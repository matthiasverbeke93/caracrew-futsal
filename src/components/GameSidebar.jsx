import { FILTER_CONFLICTS, GAME_FILTERS } from "../constants";
import PersonalComplianceCard from "./PersonalComplianceCard";
import { getDifficulty } from "../utils/difficulty";
import { playerStatusLabel, readinessClass } from "../utils/game";
import { cleanOpponentName } from "../utils/opponent";
import { useLayoutEffect, useMemo, useState } from "react";

const RSVP_CHIP = {
  playing: { label: "You are marked as playing", short: "In", className: "my-rsvp-in" },
  cant: { label: "You cannot attend", short: "Out", className: "my-rsvp-out" },
  if_needed: { label: "You marked if needed", short: "Maybe", className: "my-rsvp-maybe" },
};

function MyRsvpChip({ currentPlayerId, played, myRow }) {
  if (!currentPlayerId) return null;

  if (myRow) {
    const cfg = RSVP_CHIP[myRow.status];
    if (cfg) {
      return (
        <span className={`my-rsvp-chip ${cfg.className}`} title={cfg.label}>
          {cfg.short}
        </span>
      );
    }
    return (
      <span className="my-rsvp-chip my-rsvp-unknown" title="Your RSVP status">
        {myRow.status}
      </span>
    );
  }

  if (played) {
    return (
      <span className="my-rsvp-chip my-rsvp-none" title="No RSVP saved for you">
        —
      </span>
    );
  }

  return (
    <span className="my-rsvp-chip my-rsvp-pending" title={"You have not RSVP'd yet"}>
      RSVP?
    </span>
  );
}

function formatCalendarMonthLabel(yyyyMm) {
  if (!yyyyMm || yyyyMm.length < 7) return yyyyMm || "";
  const d = new Date(`${yyyyMm}-01T12:00:00`);
  if (Number.isNaN(d.getTime())) return yyyyMm;
  return d.toLocaleString("en-GB", { month: "long", year: "numeric" });
}

export default function GameSidebar({
  games,
  attendanceHighlightIds,
  attendance,
  guestPlayers,
  gameStatusById,
  gameFilters,
  onFiltersChange,
  selectedGameId,
  onSelectGame,
  loading,
  opponentStrengths,
  seasonSlug,
  currentPlayerId,
  personalCompliance,
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

  useLayoutEffect(() => {
    if (loading || !selectedGameId) return;
    const el = document.getElementById(`sidebar-game-${selectedGameId}`);
    el?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [loading, selectedGameId, showCalendar, games]);

  const myAttendanceByGameId = useMemo(() => {
    if (!currentPlayerId) return null;
    const m = new Map();
    for (const row of attendance) {
      if (row.player_id === currentPlayerId) m.set(row.game_id, row);
    }
    return m;
  }, [attendance, currentPlayerId]);

  return (
    <aside className="sidebar" aria-label="Season fixtures and filters">
      <div className="sidebar-header-row">
        <h2 id="fixtures-heading">All games</h2>
        <button
          className="calendar-toggle-button"
          type="button"
          aria-expanded={showCalendar}
          aria-controls="fixtures-scroll-region"
          onClick={() => setShowCalendar((prev) => !prev)}
        >
          {showCalendar ? "List" : "Calendar"}
        </button>
      </div>
      {attendanceHighlightIds?.size > 0 && (
        <p className="sidebar-attendance-hint">
          Mark attendance for upcoming matches — the next three fixtures are highlighted.
        </p>
      )}
      <div className="game-filters" role="group" aria-label="Filter fixtures">
        {GAME_FILTERS.map((filter) => (
          <button
            key={filter.id}
            type="button"
            aria-pressed={isFilterActive(filter.id)}
            className={isFilterActive(filter.id) ? "active" : ""}
            onClick={() => toggleFilter(filter.id)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div id="fixtures-scroll-region" aria-labelledby="fixtures-heading">
      {loading && (
        <div className="sidebar-skeleton" aria-hidden>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton-game-card" />
          ))}
        </div>
      )}

      {!loading && games.length === 0 && (
        <p className="sidebar-empty">No games match these filters. Try clearing filters or pick &quot;All&quot;.</p>
      )}

      {showCalendar && !loading && games.length > 0 && (
        <div className="calendar-panel">
          {gamesByMonth.map(([month, monthGames]) => (
            <section key={month} className="calendar-month">
              <h3>{formatCalendarMonthLabel(month)}</h3>
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

                  const attendanceNext = attendanceHighlightIds?.has(game.id);
                  const playedCal = gameStatusById[game.id]?.played;
                  const myRowCal =
                    currentPlayerId && myAttendanceByGameId?.get(game.id);

                  return (
                    <button
                      key={game.id}
                      id={`sidebar-game-${game.id}`}
                      type="button"
                      className={`calendar-game-item ${tone} ${game.id === selectedGameId ? "selected" : ""} ${
                        attendanceNext ? "attendance-next" : ""
                      }`}
                      onClick={() => onSelectGame(game.id)}
                    >
                      <span className="calendar-game-datetime">
                        {game.game_date} · {game.game_time || "--:--"}
                      </span>
                      <span className="calendar-game-opponent-wrap">
                        <strong>{cleanOpponentName(game.opponent)}</strong>
                        {currentPlayerId && (
                          <MyRsvpChip
                            currentPlayerId={currentPlayerId}
                            played={playedCal}
                            myRow={myRowCal}
                          />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {!showCalendar &&
        !loading &&
        games.map((game) => {
        const gameRows = attendance.filter((a) => a.game_id === game.id);
        const gameGuestPlayers = guestPlayers.filter((p) => p.game_id === game.id);
        const playing =
          gameRows.filter((a) => a.status === "playing").length +
          gameGuestPlayers.filter((p) => p.status === "playing").length;
        const status = gameStatusById[game.id];

        const played = status?.played;
        const cardClass = played ? "game-card neutral" : readinessClass(playing);
        const difficulty = getDifficulty(game.opponent, opponentStrengths, seasonSlug);
        const hasScore =
          played && game.home_score != null && game.away_score != null;
        const attendanceNext = attendanceHighlightIds?.has(game.id);
        const myRow =
          currentPlayerId && myAttendanceByGameId?.get(game.id);

        return (
          <button
            key={game.id}
            id={`sidebar-game-${game.id}`}
            type="button"
            className={`${cardClass} ${game.id === selectedGameId ? "selected" : ""} ${
              attendanceNext ? "attendance-next" : ""
            }`}
            onClick={() => onSelectGame(game.id)}
          >
            <div className="game-top">
              <strong>{cleanOpponentName(game.opponent)}</strong>
              {attendanceNext && !played ? (
                <span className="attendance-next-badge">Attendance</span>
              ) : (
                <span className="game-status-pill">
                  {played ? "Played" : "To be played"}
                </span>
              )}
            </div>

            <div>
              {game.game_date} · {game.game_time}
            </div>
            <div>{game.location}</div>

            <div className="mini-counts">
              {currentPlayerId && (
                <MyRsvpChip currentPlayerId={currentPlayerId} played={played} myRow={myRow} />
              )}
              {!played && <span>{playerStatusLabel(playing)}</span>}
              {hasScore && (
                <span className="result-chip-mini" title="Caracrew – opponent">
                  {game.home_score}–{game.away_score}
                </span>
              )}
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
      </div>

      {currentPlayerId && <PersonalComplianceCard summary={personalCompliance} />}
    </aside>
  );
}
