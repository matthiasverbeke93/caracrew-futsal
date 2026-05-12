import { useMemo } from "react";
import { ATTENDANCE_OPTIONS } from "../constants";
import { nextUpcomingGamesByCalendar } from "../utils/game";
import { cleanOpponentName } from "../utils/opponent";
import { formatMatchDayTime } from "../utils/formatMatch";

const TILE_EYEBROWS = ["Next", "Then", "After"];

const TILE_BTN_SHORT = {
  playing: "In",
  cant: "Out",
  if_needed: "Maybe",
};

export default function MyNextGamesTiles({
  games,
  attendance,
  currentPlayer,
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
          eyebrow={TILE_EYEBROWS[index] ?? `+${index + 1}`}
          myStatus={statusByGameId.get(game.id) ?? null}
          onJumpToGame={onJumpToGame}
          onMarkAttendance={onMarkAttendance}
        />
      ))}
    </div>
  );
}

function NextGameTile({ game, eyebrow, myStatus, onJumpToGame, onMarkAttendance }) {
  const rawOpponent = game.opponent ? String(game.opponent).trim() : "";
  const cleaned = cleanOpponentName(game.opponent);
  const opponent = (cleaned && cleaned.trim()) || rawOpponent || "Opponent TBD";
  const when = formatMatchDayTime(game);

  return (
    <section
      className="panel my-next-game-card my-next-game-card--tile"
      aria-label={`${eyebrow}: vs ${opponent}`}
    >
      <div className="my-next-game-top">
        <div>
          <div className="section-label">{eyebrow}</div>
          <h2 className="my-next-game-title">
            <span className="my-next-game-vs">vs</span> {opponent}
          </h2>
          <p className="my-next-game-when">
            {when} · {game.location || "Venue TBD"}
          </p>
        </div>
        <button
          type="button"
          className="my-next-game-jump"
          onClick={() => onJumpToGame?.(game.id)}
          title="Open this match"
        >
          Open →
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
            onClick={() => onMarkAttendance(game.id, opt.value)}
            aria-pressed={myStatus === opt.value}
            aria-label={opt.label}
          >
            {TILE_BTN_SHORT[opt.value] ?? opt.label}
          </button>
        ))}
      </div>

      {myStatus ? (
        <p className="my-next-game-status">
          Marked <strong>{labelFor(myStatus)}</strong>.
        </p>
      ) : null}
    </section>
  );
}

function labelFor(value) {
  const found = ATTENDANCE_OPTIONS.find((o) => o.value === value);
  return found ? found.label.toLowerCase().replace(/^i'?m\s/i, "") : value;
}
