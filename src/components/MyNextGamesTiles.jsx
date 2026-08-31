import { useMemo } from "react";
import { ATTENDANCE_OPTIONS, GAME_FULL_PLAYERS, attendanceLabel } from "../constants";
import {
  isAttendanceEditable,
  isGameFull,
  isRsvpAllowedWhenFull,
  nextUpcomingGamesByCalendar,
} from "../utils/game";
import { cleanOpponentName } from "../utils/opponent";
import { formatFixtureTileLine } from "../utils/formatMatch";

const TILE_EYEBROWS = ["Soonest", "Next up", "Later"];

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

  return (
    <div
      className="my-next-games-row"
      role="region"
      aria-label="Your next fixtures — quick RSVP"
    >
      {upcoming.map((game, index) => (
        <NextGameTile
          key={game.id}
          game={game}
          eyebrow={TILE_EYEBROWS[index] ?? `Match ${index + 1}`}
          myStatus={statusByGameId.get(game.id) ?? null}
          editable={isAttendanceEditable(game, games)}
          gameFull={isGameFull(gameStatusById?.[game.id]?.playingCount)}
          showOpenButton={selectedGameId !== game.id}
          onJumpToGame={onJumpToGame}
          onMarkAttendance={onMarkAttendance}
        />
      ))}
    </div>
  );
}

function NextGameTile({
  game,
  eyebrow,
  myStatus,
  editable,
  gameFull,
  showOpenButton,
  onJumpToGame,
  onMarkAttendance,
}) {
  const rawOpponent = game.opponent ? String(game.opponent).trim() : "";
  const cleaned = cleanOpponentName(game.opponent);
  const opponent = (cleaned && cleaned.trim()) || rawOpponent || "Opponent TBD";
  const whenLine = formatFixtureTileLine(game);

  const rsvpMod = myStatus ? `my-next-game-card--rsvp-${myStatus}` : "";

  return (
    <section
      className={`panel my-next-game-card my-next-game-card--tile ${rsvpMod}`.trim()}
      aria-label={`${eyebrow}: vs ${opponent}`}
    >
      <div className="my-next-game-top">
        <div>
          <div className="my-next-game-eyebrow">{eyebrow}</div>
          <h2 className="my-next-game-title">
            <span className="my-next-game-vs">vs</span> {opponent}
          </h2>
          <p className="my-next-game-when">{whenLine}</p>
        </div>
        {showOpenButton ? (
          <button
            type="button"
            className="my-next-game-jump"
            onClick={() => onJumpToGame?.(game.id)}
            title="Open this match"
          >
            Open →
          </button>
        ) : null}
      </div>

      <div className="my-next-game-actions" role="group" aria-label="Quick attendance">
        {ATTENDANCE_OPTIONS.map((opt) => {
          // A full fixture only accepts an In player dropping out.
          const allowed = !gameFull || isRsvpAllowedWhenFull(myStatus, opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              className={`my-next-game-btn status-${opt.value} ${
                myStatus === opt.value ? "active" : ""
              }`}
              onClick={() => onMarkAttendance(game.id, opt.value)}
              disabled={!editable || !allowed}
              title={
                !editable
                  ? "RSVP not editable for this fixture"
                  : !allowed
                    ? `Match full — ${GAME_FULL_PLAYERS} players are already In`
                    : undefined
              }
              aria-pressed={myStatus === opt.value}
              aria-label={opt.label}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Reserved footer keeps the RSVP buttons above it aligned tile-to-tile,
          whether or not a tile has a Clear/Marked line (see .my-next-game-footer). */}
      <div className="my-next-game-footer">
        {editable && myStatus && (!gameFull || myStatus === "playing") ? (
          <button
            type="button"
            className="my-next-game-clear"
            onClick={() => onMarkAttendance(game.id, null)}
          >
            Clear RSVP
          </button>
        ) : null}

        {myStatus ? (
          <p className="my-next-game-status">
            Marked <strong>{attendanceLabel(myStatus)}</strong>.
          </p>
        ) : null}

        {/* Only the people it actually blocks need telling — and keeping it off the
            "I'm In" tiles keeps the footer at two lines, so tiles stay aligned. */}
        {gameFull && myStatus !== "playing" ? (
          <p className="my-next-game-full">
            Full — {GAME_FULL_PLAYERS} In, RSVP closed.
          </p>
        ) : null}
      </div>
    </section>
  );
}
