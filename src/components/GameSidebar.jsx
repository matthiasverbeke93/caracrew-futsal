import { FILTER_CONFLICTS, GAME_EXTRA_FILTERS, GAME_FILTERS } from "../constants";
import { getDifficulty } from "../utils/difficulty";
import { playerStatusLabel, readinessClass } from "../utils/game";
import { isMotmVotingOpen } from "../utils/motm";
import { formatMatchDayTime } from "../utils/formatMatch";
import { cleanOpponentName } from "../utils/opponent";
import { useLayoutEffect, useMemo, useState } from "react";

const STATUS_SEGMENT_IDS = ["all", "upcoming", "played"];

const RSVP_CHIP = {
  playing: { label: "You are marked In", short: "In", className: "my-rsvp-in" },
  cant: { label: "You are marked Out", short: "Out", className: "my-rsvp-out" },
  if_needed: { label: "You are marked If needed", short: "If needed", className: "my-rsvp-maybe" },
};

/** Calendar subscribe popover: Google/Apple one-click + a copyable https URL for Outlook & others. */
function CalendarSubscribe({ seasonSlug }) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const host = typeof window !== "undefined" ? window.location.host : "";
  const httpsUrl = `${origin}/fixtures-${seasonSlug}.ics`;
  const webcalUrl = `webcal://${host}/fixtures-${seasonSlug}.ics`;
  // Google's "add by URL" accepts a webcal/https cid.
  const googleUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(httpsUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (e.g. non-secure context) — the readonly field stays selectable.
    }
  };

  return (
    <details className="calendar-subscribe">
      <summary
        className="calendar-subscribe-summary"
        title="Add these fixtures to your calendar app"
      >
        Subscribe
      </summary>
      <div className="calendar-subscribe-menu">
        <a
          className="calendar-subscribe-option"
          href={googleUrl}
          target="_blank"
          rel="noreferrer"
        >
          Google Calendar
        </a>
        <a className="calendar-subscribe-option" href={webcalUrl}>
          Apple Calendar / phone
        </a>
        <div className="calendar-subscribe-manual">
          <span className="calendar-subscribe-hint">Outlook &amp; others — paste this URL:</span>
          <input
            type="text"
            className="calendar-subscribe-url"
            readOnly
            value={httpsUrl}
            onFocus={(e) => e.target.select()}
            aria-label="Calendar subscription URL"
          />
          <button type="button" className="calendar-subscribe-copy" onClick={copy}>
            {copied ? "Copied!" : "Copy URL"}
          </button>
        </div>
      </div>
    </details>
  );
}

function userHasMotmVoteForGame(gameId, motmVotes, voterUserId) {
  if (!voterUserId || !motmVotes?.length) return false;
  return motmVotes.some((v) => v.game_id === gameId && v.voter_key === voterUserId);
}

function MyRsvpChip({ game, currentPlayerId, played, myRow, motmVotes, voterUserId }) {
  if (!currentPlayerId && !voterUserId) return null;

  if (currentPlayerId && myRow) {
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

  const voteMissing =
    voterUserId &&
    played &&
    isMotmVotingOpen(game) &&
    !userHasMotmVoteForGame(game.id, motmVotes, voterUserId);

  if (voteMissing) {
    return (
      <span
        className="my-rsvp-chip my-rsvp-vote-missing"
        title="Man of the Match vote not cast yet (voting window is open)"
      >
        Vote missing
      </span>
    );
  }

  if (!currentPlayerId) return null;

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

function getStatusSegment(gameFilters) {
  if (gameFilters.includes("played")) return "played";
  if (gameFilters.includes("upcoming")) return "upcoming";
  return "all";
}

function applyStatusSegment(mode, gameFilters, onFiltersChange) {
  if (mode === "all") {
    onFiltersChange(
      gameFilters.filter((f) => !["upcoming", "played", "stats_missing"].includes(f))
    );
    return;
  }
  const conflicts = FILTER_CONFLICTS[mode] || [];
  const withoutTriplet = gameFilters.filter(
    (f) => !["upcoming", "played", "stats_missing"].includes(f)
  );
  const cleaned = withoutTriplet.filter((f) => !conflicts.includes(f));
  onFiltersChange([...cleaned, mode]);
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
  nextAttendanceGames,
  activeMainTab = "attendance",
  motmVotes = [],
  voterUserId = null,
}) {
  function toggleExtraFilter(filterId) {
    const isActive = gameFilters.includes(filterId);
    if (isActive) {
      onFiltersChange(gameFilters.filter((f) => f !== filterId));
      return;
    }
    const conflicts = FILTER_CONFLICTS[filterId] || [];
    const cleaned = gameFilters.filter((f) => !conflicts.includes(f));
    onFiltersChange([...cleaned, filterId]);
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

  const showSidebarMatchStats = activeMainTab !== "stats";
  const statusSegment = getStatusSegment(gameFilters);
  const hasExtraFiltersActive = GAME_EXTRA_FILTERS.some((f) => gameFilters.includes(f.id));

  return (
    <aside className="sidebar" aria-label="Season fixtures and filters">
      {nextAttendanceGames?.length > 0 && (
        <div className="sidebar-rsvp-block">
          <p className="sidebar-section-eyebrow">RSVP soon</p>
          <section className="sidebar-next-fixtures" aria-label="Next fixtures to RSVP">
            <div className="sidebar-next-fixtures-title">
              Next {nextAttendanceGames.length} match{nextAttendanceGames.length === 1 ? "" : "es"}
            </div>
            <ol className="sidebar-next-fixtures-list">
              {nextAttendanceGames.map((g, i) => (
                <li key={g.id}>
                  <button
                    type="button"
                    className="sidebar-next-fixtures-link"
                    onClick={() => onSelectGame(g.id)}
                  >
                    <span className="sidebar-next-fixtures-step" aria-hidden>
                      {i + 1}
                    </span>
                    <span className="sidebar-next-fixtures-meta">
                      <span className="sidebar-next-fixtures-opponent">{cleanOpponentName(g.opponent)}</span>
                      <span className="sidebar-next-fixtures-when">
                        {formatMatchDayTime(g)} · {g.location || "Venue TBD"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}

      <div className="sidebar-schedule-card">
        <div className="sidebar-toolbar">
          <h2 id="fixtures-heading" className="sidebar-title">
            Schedule
          </h2>
          <div className="sidebar-toolbar-actions">
            <CalendarSubscribe seasonSlug={seasonSlug} />
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
        </div>

        <div className="filter-status-row" role="group" aria-label="Filter by match status">
          {STATUS_SEGMENT_IDS.map((id) => {
            const def = GAME_FILTERS.find((f) => f.id === id);
            const label = def?.label ?? id;
            const active = statusSegment === id;
            return (
              <button
                key={id}
                type="button"
                className={`filter-status-btn ${active ? "active" : ""}`}
                aria-pressed={active}
                onClick={() => applyStatusSegment(id, gameFilters, onFiltersChange)}
              >
                {label}
              </button>
            );
          })}
        </div>

        <details className="sidebar-filters-more">
          <summary className="sidebar-filters-more-summary">
            More filters
            {hasExtraFiltersActive ? (
              <span className="sidebar-filters-more-badge" aria-hidden>
                On
              </span>
            ) : null}
          </summary>
          <div className="sidebar-filters-more-chips" role="group" aria-label="Squad and stats filters">
            {GAME_EXTRA_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                className={`filter-extra-chip ${gameFilters.includes(filter.id) ? "active" : ""}`}
                aria-pressed={gameFilters.includes(filter.id)}
                onClick={() => toggleExtraFilter(filter.id)}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </details>

        <div id="fixtures-scroll-region" className="sidebar-scroll" aria-labelledby="fixtures-heading">
          {loading && (
            <div className="sidebar-skeleton" aria-hidden>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton-game-card" />
              ))}
            </div>
          )}

          {!loading && games.length === 0 && (
            <p className="sidebar-empty">
              No games match these filters. Try &quot;All&quot; or adjust filters above.
            </p>
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
                      const playedCal = status?.played;
                      const tone =
                        !showSidebarMatchStats && !playedCal
                          ? "neutral"
                          : status?.played
                            ? "neutral"
                            : readinessClass(playing).replace("game-card ", "");

                      const attendanceNext = attendanceHighlightIds?.has(game.id);
                      const myRowCal =
                        currentPlayerId && myAttendanceByGameId?.get(game.id);
                      const nextRankCal =
                        nextAttendanceGames?.findIndex((g) => g.id === game.id) ?? -1;

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
                            {attendanceNext && !playedCal && nextRankCal >= 0 && (
                              <span className="next-fixture-rank-badge next-fixture-rank-badge--compact">
                                Next {nextRankCal + 1}
                              </span>
                            )}
                            <strong>{cleanOpponentName(game.opponent)}</strong>
                            {currentPlayerId || voterUserId ? (
                              <MyRsvpChip
                                game={game}
                                currentPlayerId={currentPlayerId}
                                played={playedCal}
                                myRow={myRowCal}
                                motmVotes={motmVotes}
                                voterUserId={voterUserId}
                              />
                            ) : null}
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
              const cardClass =
                !showSidebarMatchStats && !played
                  ? "game-card neutral"
                  : played
                    ? "game-card neutral"
                    : readinessClass(playing);
              const difficulty =
                showSidebarMatchStats &&
                getDifficulty(game.opponent, opponentStrengths, seasonSlug);
              const hasScore =
                played && game.home_score != null && game.away_score != null;
              const attendanceNext = attendanceHighlightIds?.has(game.id);
              const myRow = currentPlayerId && myAttendanceByGameId?.get(game.id);
              const nextRank = nextAttendanceGames?.findIndex((g) => g.id === game.id) ?? -1;

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
                    {attendanceNext && !played && nextRank >= 0 ? (
                      <span
                        className="next-fixture-rank-badge"
                        title="Mark attendance — upcoming priority fixture"
                      >
                        Next {nextRank + 1}
                      </span>
                    ) : attendanceNext && !played ? (
                      <span className="attendance-next-badge">Attendance</span>
                    ) : played && showSidebarMatchStats && status?.statsMissing ? (
                      <span className="game-status-pill is-stats-missing">Stats missing</span>
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
                    {currentPlayerId || voterUserId ? (
                      <MyRsvpChip
                        game={game}
                        currentPlayerId={currentPlayerId}
                        played={played}
                        myRow={myRow}
                        motmVotes={motmVotes}
                        voterUserId={voterUserId}
                      />
                    ) : null}
                    {showSidebarMatchStats && !played && <span>{playerStatusLabel(playing)}</span>}
                    {showSidebarMatchStats && hasScore && (
                      <span className="result-chip-mini" title="Caracrew – opponent">
                        {game.home_score}–{game.away_score}
                      </span>
                    )}
                    {showSidebarMatchStats && difficulty && (
                      <span className="mini-diff">
                        {difficulty.label} · P{difficulty.position}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
        </div>
      </div>
    </aside>
  );
}
