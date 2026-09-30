import { useMemo } from "react";
import { useNow } from "../hooks/useMatchClock";
import { getMotmVotingStart } from "../utils/motm";
import { isStatsEditable } from "../utils/game";
import { cleanOpponentName } from "../utils/opponent";
import { formatMatchHeaderDateTime } from "../utils/formatMatch";

/**
 * The most recent game the signed-in player was In for, is past full time, is still inside
 * the player stats window, and has no stats row from them yet. A row appears as soon as
 * they tick Played or enter a number, so a goalless night still clears the card.
 */
function findStatsDueGame(games, attendance, stats, playerId, nowMs) {
  let due = null;
  let dueStart = -Infinity;
  for (const game of games) {
    const fullTime = getMotmVotingStart(game)?.getTime();
    if (fullTime == null || nowMs < fullTime || fullTime < dueStart) continue;
    if (!isStatsEditable(game, { nowMs })) continue;
    const wasIn = attendance.some(
      (a) => a.game_id === game.id && a.player_id === playerId && a.status === "playing"
    );
    if (!wasIn) continue;
    if (stats.some((s) => s.game_id === game.id && s.player_id === playerId)) continue;
    due = game;
    dueStart = fullTime;
  }
  return due;
}

export default function StatsDueCard({ games, attendance, stats, currentPlayer, hideForGameId, onOpen }) {
  const now = useNow();
  const game = useMemo(
    () => findStatsDueGame(games, attendance, stats, currentPlayer.id, now),
    [games, attendance, stats, currentPlayer.id, now]
  );
  if (!game || game.id === hideForGameId) return null;

  const opponent = cleanOpponentName(game.opponent) || game.opponent || "last game";

  return (
    <section className="panel stats-due" aria-label="Your stats are still missing">
      <div className="stats-due-text">
        <h2>Add your stats vs {opponent}</h2>
        <p>
          {formatMatchHeaderDateTime(game)} · goals and assists, or just tick Played if you
          didn't score.
        </p>
      </div>
      <button type="button" className="stats-due-button" onClick={() => onOpen(game.id)}>
        Add stats
      </button>
    </section>
  );
}
