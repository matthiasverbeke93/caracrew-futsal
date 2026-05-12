import { useMemo } from "react";
import { ATTENDANCE_OPTIONS } from "../constants";
import { upcomingGamesForAttendance } from "../utils/game";
import { cleanOpponentName } from "../utils/opponent";
import { formatMatchDayTime } from "../utils/formatMatch";

export default function MyNextGameCard({
  games,
  attendance,
  currentPlayer,
  onJumpToGame,
  onMarkAttendance,
}) {
  const nextGame = useMemo(() => {
    const upcoming = upcomingGamesForAttendance(games, 1);
    return upcoming[0] ?? null;
  }, [games]);

  const myStatus = useMemo(() => {
    if (!nextGame || !currentPlayer) return null;
    return (
      attendance.find((a) => a.game_id === nextGame.id && a.player_id === currentPlayer.id)
        ?.status || null
    );
  }, [attendance, currentPlayer, nextGame]);

  if (!currentPlayer || !nextGame) return null;

  const rawOpponent = nextGame.opponent ? String(nextGame.opponent).trim() : "";
  const cleaned = cleanOpponentName(nextGame.opponent);
  const opponent =
    (cleaned && cleaned.trim()) || rawOpponent || "Opponent TBD";
  const when = formatMatchDayTime(nextGame);

  return (
    <section className="panel my-next-game-card" aria-label="Your next game">
      <div className="my-next-game-top">
        <div>
          <div className="section-label">Your next game</div>
          <h2 className="my-next-game-title">
            <span className="my-next-game-vs">vs</span> {opponent}
          </h2>
          <p className="my-next-game-when">
            {when} · {nextGame.location || "Venue TBD"}
          </p>
        </div>
        <button
          type="button"
          className="my-next-game-jump"
          onClick={() => onJumpToGame?.(nextGame.id)}
          title="Open this match"
        >
          Open match →
        </button>
      </div>

      <div className="my-next-game-actions" role="group" aria-label="Quick attendance">
        {ATTENDANCE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`my-next-game-btn status-${opt.value} ${
              myStatus === opt.value ? "active" : ""
            }`}
            onClick={() => onMarkAttendance(nextGame.id, opt.value)}
            aria-pressed={myStatus === opt.value}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {myStatus && (
        <p className="my-next-game-status">
          You're currently marked as <strong>{labelFor(myStatus)}</strong>.
        </p>
      )}
    </section>
  );
}

function labelFor(value) {
  const found = ATTENDANCE_OPTIONS.find((o) => o.value === value);
  return found ? found.label.toLowerCase().replace(/^i'?m\s/i, "") : value;
}
