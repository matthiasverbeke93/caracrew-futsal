import { FILTER_CONFLICTS, GAME_EXTRA_FILTERS, GAME_FILTERS } from "../constants";
import { getDifficulty } from "../utils/difficulty";
import { playerStatusLabel, readinessClass } from "../utils/game";
import { isMotmVotingOpen } from "../utils/motm";
import { formatFixtureRowDateTime } from "../utils/formatMatch";
import { cleanOpponentName } from "../utils/opponent";
import { useLayoutEffect, useMemo, useState } from "react";

const STATUS_SEGMENT_IDS = ["all", "upcoming", "played"];

/**
 * The two fixture views, as a segmented toggle rather than one button labelled with the view
 * you are *not* in — which read as a state ("this is the list") as often as an action.
 */
const VIEW_OPTIONS = [
  { id: "list", label: "List", calendar: false },
  { id: "calendar", label: "Calendar", calendar: true },
];

const EMPTY_COUNTS = { playing: 0, ifNeeded: 0, responses: 0 };

/** Sortable kickoff key from the local-day strings we store (never Date math — see HANDOVER). */
function kickoffKey(game) {
  return `${game.game_date || ""}T${game.game_time || ""}`;
}

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
  // Outlook.com "Subscribe from web", prefilled (personal accounts; work/school users can Copy URL instead).
  const outlookUrl = `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(
    httpsUrl
  )}&name=${encodeURIComponent("Caracrew fixtures")}`;

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
        <a
          className="calendar-subscribe-option"
          href={outlookUrl}
          target="_blank"
          rel="noreferrer"
        >
          Outlook
        </a>
        <div className="calendar-subscribe-manual">
          <span className="calendar-subscribe-hint">Other apps — paste this URL:</span>
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

  // No `played` gate: that flips at midnight, while the window (kickoff + 2h) opens on
  // match night — exactly when the reminder matters.
  const voteMissing =
    voterUserId &&
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

/**
 * Headcount for a fixture that is still to be played: how many are marked In.
 * Only rendered once somebody has actually answered — in practice that is the
 * next 3 fixtures, the only ones open for RSVP. `if needed` is shown alongside
 * because those players decide whether a thin squad turns out.
 */
function AttendanceCountChip({ playing, ifNeeded, responses, played, compact = false }) {
  if (played || !responses) return null;
  const title = `${playing} marked In${ifNeeded ? `, ${ifNeeded} if needed` : ""} · ${responses} response${
    responses === 1 ? "" : "s"
  }`;
  return (
    <span
      className={`attendance-count-chip${compact ? " attendance-count-chip--compact" : ""}`}
      title={title}
    >
      <strong>{playing}</strong> in
      {ifNeeded > 0 ? (compact ? ` +${ifNeeded}` : ` +${ifNeeded} if needed`) : ""}
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

  // Phones and tablets open on Calendar (a month-grouped list reads better there); desktop
  // keeps List. Same breakpoint as the app-style shell in index.css.
  const [showCalendar, setShowCalendar] = useState(
    () => window.matchMedia?.("(max-width: 1000px)").matches ?? false
  );
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

  /** playing / if-needed / total-responses per game, roster + guests, in one pass. */
  const countsByGameId = useMemo(() => {
    const m = new Map();
    const bump = (gameId, status) => {
      if (!gameId) return;
      let c = m.get(gameId);
      if (!c) {
        c = { playing: 0, ifNeeded: 0, responses: 0 };
        m.set(gameId, c);
      }
      c.responses += 1;
      if (status === "playing") c.playing += 1;
      else if (status === "if_needed") c.ifNeeded += 1;
    };
    for (const row of attendance) bump(row.game_id, row.status);
    for (const row of guestPlayers) bump(row.game_id, row.status);
    return m;
  }, [attendance, guestPlayers]);

  /**
   * The match whose stats still need completing is the one that just happened — but "All"
   * lists every upcoming fixture first and only then the played ones, so it sits at the very
   * bottom. Pin the most recent played match to the top of the list instead.
   *
   * Only when the list actually mixes the two blocks, which is exactly the "All" view:
   * "Upcoming" has nothing played to pin, and "Played" already leads with it.
   */
  const pinnedLastPlayedId = useMemo(() => {
    let last = null;
    let hasUpcoming = false;
    for (const game of games) {
      const status = gameStatusById[game.id];
      if (!status) continue;
      if (!status.played) {
        hasUpcoming = true;
        continue;
      }
      if (!last || kickoffKey(game) > kickoffKey(last)) last = game;
    }
    return hasUpcoming && last ? last.id : null;
  }, [games, gameStatusById]);

  const listGames = useMemo(() => {
    if (!pinnedLastPlayedId) return games;
    const pinned = games.find((g) => g.id === pinnedLastPlayedId);
    if (!pinned) return games;
    return [pinned, ...games.filter((g) => g.id !== pinnedLastPlayedId)];
  }, [games, pinnedLastPlayedId]);

  const statusSegment = getStatusSegment(gameFilters);
  const hasExtraFiltersActive = GAME_EXTRA_FILTERS.some((f) => gameFilters.includes(f.id));

  return (
    <aside className="sidebar" aria-label="Season fixtures and filters">
      <div className="sidebar-schedule-card">
        <div className="sidebar-toolbar">
          <h2 id="fixtures-heading" className="sidebar-title">
            Schedule
          </h2>
          <div className="sidebar-toolbar-actions">
            <CalendarSubscribe seasonSlug={seasonSlug} />
            <div className="view-toggle" role="group" aria-label="Fixtures view">
              {VIEW_OPTIONS.map((opt) => {
                const active = showCalendar === opt.calendar;
                return (
                  <button
                    key={opt.id}
                    className={`view-toggle-btn ${active ? "active" : ""}`}
                    type="button"
                    aria-pressed={active}
                    aria-controls="fixtures-scroll-region"
                    onClick={() => setShowCalendar(opt.calendar)}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
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
                      const { playing, ifNeeded, responses } =
                        countsByGameId.get(game.id) ?? EMPTY_COUNTS;
                      const status = gameStatusById[game.id];
                      const playedCal = status?.played;
                      const tone = status?.played
                        ? "neutral"
                        : readinessClass(playing, responses).replace("game-card ", "");

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
                            {formatFixtureRowDateTime(game)}
                          </span>
                          <span className="calendar-game-opponent-wrap">
                            {attendanceNext && !playedCal && nextRankCal >= 0 && (
                              <span className="next-fixture-rank-badge next-fixture-rank-badge--compact">
                                Next {nextRankCal + 1}
                              </span>
                            )}
                            <strong>{cleanOpponentName(game.opponent)}</strong>
                            <AttendanceCountChip
                              playing={playing}
                              ifNeeded={ifNeeded}
                              responses={responses}
                              played={playedCal}
                              compact
                            />
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
            listGames.map((game) => {
              const { playing, ifNeeded, responses } =
                countsByGameId.get(game.id) ?? EMPTY_COUNTS;
              const status = gameStatusById[game.id];

              const played = status?.played;
              const cardClass = played
                ? "game-card neutral"
                : readinessClass(playing, responses);
              const difficulty = getDifficulty(game.opponent, opponentStrengths, seasonSlug);
              const hasScore =
                played && game.home_score != null && game.away_score != null;
              const attendanceNext = attendanceHighlightIds?.has(game.id);
              const myRow = currentPlayerId && myAttendanceByGameId?.get(game.id);
              const nextRank = nextAttendanceGames?.findIndex((g) => g.id === game.id) ?? -1;
              const isPinnedLastPlayed = game.id === pinnedLastPlayedId;

              return (
                <button
                  key={game.id}
                  id={`sidebar-game-${game.id}`}
                  type="button"
                  className={`${cardClass} ${game.id === selectedGameId ? "selected" : ""} ${
                    attendanceNext ? "attendance-next" : ""
                  } ${isPinnedLastPlayed ? "last-played" : ""}`}
                  onClick={() => onSelectGame(game.id)}
                >
                  <div className="game-top">
                    <strong>{cleanOpponentName(game.opponent)}</strong>
                    {isPinnedLastPlayed ? (
                      <span className="game-top-pills">
                        <span
                          className="game-status-pill is-last-played"
                          title="Most recent match — pinned so its stats can be completed"
                        >
                          Last played
                        </span>
                        {status?.statsMissing ? (
                          <span className="game-status-pill is-stats-missing">Stats missing</span>
                        ) : null}
                      </span>
                    ) : attendanceNext && !played && nextRank >= 0 ? (
                      <span
                        className="next-fixture-rank-badge"
                        title="Mark attendance — upcoming priority fixture"
                      >
                        Next {nextRank + 1}
                      </span>
                    ) : attendanceNext && !played ? (
                      <span className="attendance-next-badge">Attendance</span>
                    ) : played && status?.statsMissing ? (
                      <span className="game-status-pill is-stats-missing">Stats missing</span>
                    ) : (
                      <span className="game-status-pill">
                        {played ? "Played" : "To be played"}
                      </span>
                    )}
                  </div>

                  <div>{formatFixtureRowDateTime(game)}</div>
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
                    {!played && (
                      <AttendanceCountChip
                        playing={playing}
                        ifNeeded={ifNeeded}
                        responses={responses}
                        played={played}
                      />
                    )}
                    {!played && <span>{playerStatusLabel(playing, responses)}</span>}
                    {/* Enough bodies is not the same as having a goalie. */}
                    {!played && responses > 0 && status?.keeperMissing && (
                      <span className="no-keeper-chip" title="No goalkeeper has said In">
                        No GK
                      </span>
                    )}
                    {hasScore && (
                      <span className="result-chip-mini" title="Caracrew – opponent">
                        {game.home_score}–{game.away_score}
                      </span>
                    )}
                    {difficulty && (
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
