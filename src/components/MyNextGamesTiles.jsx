import { useMemo } from "react";
import { ATTENDANCE_OPTIONS, attendanceLabel } from "../constants";
import { isAttendanceEditable, nextUpcomingGamesByCalendar } from "../utils/game";
import { cleanOpponentName } from "../utils/opponent";
import { formatFixtureTileLine } from "../utils/formatMatch";

const TILE_EYEBROWS = ["Soonest", "Next up", "Later"];

export default function MyNextGamesTiles({
  games,
  attendance,
  currentPlayer,
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
        {ATTENDANCE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`my-next-game-btn status-${opt.value} ${
              myStatus === opt.value ? "active" : ""
            }`}
            onClick={() => onMarkAttendance(game.id, opt.value)}
            disabled={!editable}
            title={!editable ? "RSVP not editable for this fixture" : undefined}
            aria-pressed={myStatus === opt.value}
            aria-label={opt.label}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {editable && myStatus ? (
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
    </section>
  );
}
