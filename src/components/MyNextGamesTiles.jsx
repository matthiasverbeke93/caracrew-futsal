import { useMemo } from "react";
import { ATTENDANCE_OPTIONS, GAME_FULL_PLAYERS, attendanceLabel } from "../constants";
import {
  isAttendanceEditable,
  isGameFull,
  isRsvpAllowedWhenFull,
  nextUpcomingGamesByCalendar,
} from "../utils/game";
import { cleanOpponentName } from "../utils/opponent";
import { fixtureDateBlock } from "../utils/formatMatch";

export default function MyNextGamesTiles({
  games,
  attendance,
  currentPlayer,
  gameStatusById,
  selectedGameId,
  onJumpToGame,
  onMarkAttendance,
}) {
  const upcoming = useMemo(
    () => nextUpcomingGamesByCalendar(games, 3),
    [games]
  );

  const statusByGameId = useMemo(() => {
    const m = new Map();
    if (!currentPlayer) return m;
    for (const row of attendance) {
      if (row.player_id === currentPlayer.id) m.set(row.game_id, row.status);
    }
    return m;
  }, [attendance, currentPlayer]);

  if (!currentPlayer || upcoming.length === 0) return null;

  const unanswered = upcoming.filter(
    (g) => !statusByGameId.get(g.id) && isAttendanceEditable(g, games)
  ).length;

  return (
    <section className="panel my-rsvp" aria-label="Your next fixtures — quick RSVP">
      <header className="my-rsvp-head">
        <h2>Your next games</h2>
        <span className={`my-rsvp-summary${unanswered ? " is-pending" : ""}`}>
          {unanswered ? `${unanswered} to answer` : "All answered"}
        </span>
      </header>
      <ul className="my-rsvp-list">
        {upcoming.map((game) => (
          <NextGameRow
            key={game.id}
            game={game}
            myStatus={statusByGameId.get(game.id) ?? null}
            editable={isAttendanceEditable(game, games)}
            gameFull={isGameFull(gameStatusById?.[game.id]?.playingCount)}
            isOpen={selectedGameId === game.id}
            onJumpToGame={onJumpToGame}
            onMarkAttendance={onMarkAttendance}
          />
        ))}
      </ul>
    </section>
  );
}

/**
 * One fixture: a date block + opponent that opens the match, the player's answer as a
 * coloured badge, and In / Out / If needed as one segmented row underneath.
 */
function NextGameRow({ game, myStatus, editable, gameFull, isOpen, onJumpToGame, onMarkAttendance }) {
  const rawOpponent = game.opponent ? String(game.opponent).trim() : "";
  const cleaned = cleanOpponentName(game.opponent);
  const opponent = (cleaned && cleaned.trim()) || rawOpponent || "Opponent TBD";
  const { day, date, month, time } = fixtureDateBlock(game);
  const closedByFull = gameFull && myStatus !== "playing";

  return (
    <li className={`my-rsvp-row${myStatus ? ` is-${myStatus}` : ""}${isOpen ? " is-open" : ""}`}>
      <button
        type="button"
        className="my-rsvp-match"
        onClick={() => onJumpToGame?.(game.id)}
        aria-current={isOpen ? "true" : undefined}
        title={isOpen ? "Showing below" : "Open this match"}
      >
        <span className="my-rsvp-date" aria-hidden>
          <span>{day}</span>
          <strong>{date}</strong>
          <span>{month}</span>
        </span>
        <span className="my-rsvp-info">
          <span className="my-rsvp-opponent">{opponent}</span>
          <span className="my-rsvp-when">
            {time}
            {game.location ? ` · ${game.location}` : ""}
          </span>
        </span>
        <span className={`my-rsvp-badge${myStatus ? ` is-${myStatus}` : " is-none"}`}>
          {myStatus ? attendanceLabel(myStatus) : editable ? "No answer" : "Locked"}
        </span>
      </button>

      <div className="my-rsvp-seg" role="group" aria-label={`Your answer for ${opponent}`}>
        {ATTENDANCE_OPTIONS.map((opt) => {
          // A full fixture only accepts an In player dropping out.
          const allowed = !gameFull || isRsvpAllowedWhenFull(myStatus, opt.value);
          const active = myStatus === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              className={`my-rsvp-opt status-${opt.value}${active ? " active" : ""}`}
              // Tapping the chosen answer again clears it.
              onClick={() => onMarkAttendance(game.id, active ? null : opt.value)}
              disabled={!editable || (!allowed && !active)}
              title={
                !editable
                  ? "RSVP not editable for this fixture"
                  : active
                    ? "Tap again to clear"
                    : !allowed
                      ? `Match full — ${GAME_FULL_PLAYERS} players are already In`
                      : undefined
              }
              aria-pressed={active}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {closedByFull ? (
        <p className="my-rsvp-note">Full — {GAME_FULL_PLAYERS} In, RSVP closed.</p>
      ) : null}
    </li>
  );
}
