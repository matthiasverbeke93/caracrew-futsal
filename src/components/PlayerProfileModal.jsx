import { useEffect, useMemo, useState } from "react";
import { attendanceLabel } from "../constants";
import { isPlayed } from "../utils/game";
import { countPlayerMotmWins, getMotmLeaderIds, getMotmVotingEnd } from "../utils/motm";
import { cleanOpponentName } from "../utils/opponent";

function resolveName(playerId, players, guestPlayers) {
  const p = players.find((x) => x.id === playerId);
  if (p?.name) return p.name;
  const g = guestPlayers.find((x) => x.id === playerId);
  if (g?.name) return g.name;
  return "Player";
}

function participationForGame(gameId, playerId, attendance, guestPlayers) {
  const att = attendance.find((a) => a.game_id === gameId && a.player_id === playerId);
  if (att) return { kind: "attendance", status: att.status };
  const guest = guestPlayers.find((g) => g.game_id === gameId && g.id === playerId);
  if (guest) return { kind: "guest_row", status: guest.status, goals: guest.goals, assists: guest.assists };
  return null;
}

function statForGame(gameId, playerId, stats, guestPlayers) {
  const row = stats.find((s) => s.game_id === gameId && s.player_id === playerId);
  if (row) return { goals: row.goals || 0, assists: row.assists || 0 };
  const guest = guestPlayers.find((g) => g.game_id === gameId && g.id === playerId);
  if (guest) return { goals: guest.goals || 0, assists: guest.assists || 0 };
  return { goals: 0, assists: 0 };
}

export default function PlayerProfileModal({
  playerId,
  onClose,
  games,
  attendance,
  stats,
  guestPlayers,
  players,
  motmVotes,
}) {
  const name = useMemo(
    () => resolveName(playerId, players, guestPlayers),
    [guestPlayers, playerId, players]
  );

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const summary = useMemo(() => {
    if (!playerId || !games?.length) return null;

    let goals = 0;
    let assists = 0;
    let denom = 0;
    let playing = 0;

    const rows = [];

    const sorted = [...games].sort((a, b) => (a.game_date || "").localeCompare(b.game_date || ""));
    for (const game of sorted) {
      const part = participationForGame(game.id, playerId, attendance, guestPlayers);
      if (!part) continue;
      denom += 1;
      if (part.status === "playing") playing += 1;
      const st = statForGame(game.id, playerId, stats, guestPlayers);
      goals += st.goals;
      assists += st.assists;
      rows.push({
        game,
        status: part.status,
        goals: st.goals,
        assists: st.assists,
        played: isPlayed(game),
      });
    }

    const lastFive = [...rows].reverse().slice(0, 5);
    const attendancePct = denom > 0 ? Math.round((playing / denom) * 100) : null;

    const motmWins = countPlayerMotmWins(playerId, games, motmVotes, now);

    let bestGame = null;
    for (const r of rows) {
      if (!r.played) continue;
      const involvement = (r.goals || 0) + (r.assists || 0);
      if (involvement <= 0) continue;
      if (!bestGame || involvement > bestGame.involvement) {
        bestGame = {
          involvement,
          goals: r.goals,
          assists: r.assists,
          game: r.game,
        };
      }
    }

    let longestStreak = 0;
    let runningStreak = 0;
    for (const r of rows) {
      if (r.status === "playing") {
        runningStreak += 1;
        if (runningStreak > longestStreak) longestStreak = runningStreak;
      } else {
        runningStreak = 0;
      }
    }

    let currentStreak = 0;
    for (let i = rows.length - 1; i >= 0; i--) {
      if (!rows[i].played) continue;
      if (rows[i].status === "playing") currentStreak += 1;
      else break;
    }

    return {
      goals,
      assists,
      attendancePct,
      denom,
      playing,
      lastFive,
      motmWins,
      bestGame,
      longestStreak,
      currentStreak,
    };
  }, [attendance, games, guestPlayers, motmVotes, now, playerId, stats]);

  const recentMotm = useMemo(() => {
    if (!playerId || !games?.length) return [];
    const out = [];
    const played = [...games].filter((g) => isPlayed(g)).sort((a, b) => (b.game_date || "").localeCompare(a.game_date || ""));
    for (const game of played) {
      const end = getMotmVotingEnd(game);
      if (!end || now <= end.getTime()) continue;
      const leaders = getMotmLeaderIds(game.id, motmVotes);
      if (!leaders.length) continue;
      if (leaders.includes(playerId)) {
        out.push({ game, shared: leaders.length > 1 });
        if (out.length >= 3) break;
      }
    }
    return out;
  }, [games, motmVotes, now, playerId]);

  if (!playerId) return null;

  return (
    <div className="profile-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="profile-modal"
        role="dialog"
        aria-labelledby="profile-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="profile-modal-header">
          <h2 id="profile-modal-title">
            {name}
            {summary?.motmWins > 0 && (
              <span className="profile-motm-trophy" title="Player of the match wins">
                {" "}
                🏆×{summary.motmWins}
              </span>
            )}
          </h2>
          <button type="button" className="profile-modal-close" onClick={onClose} aria-label="Close profile">
            ×
          </button>
        </div>

        {!summary || summary.denom === 0 ? (
          <p className="profile-empty">No games linked to this player yet.</p>
        ) : (
          <>
            <div className="profile-stat-grid">
              <div>
                <strong>{summary.goals}</strong>
                <span>Season goals</span>
              </div>
              <div>
                <strong>{summary.assists}</strong>
                <span>Season assists</span>
              </div>
              <div>
                <strong>{summary.attendancePct != null ? `${summary.attendancePct}%` : "—"}</strong>
                <span>In rate ({summary.playing}/{summary.denom} games)</span>
              </div>
            </div>

            <div className="profile-highlights">
              <div>
                <span className="profile-highlight-label">Best game</span>
                {summary.bestGame ? (
                  <span className="profile-highlight-value">
                    {summary.bestGame.goals}G {summary.bestGame.assists}A · {summary.bestGame.game.game_date} vs {cleanOpponentName(summary.bestGame.game.opponent)}
                  </span>
                ) : (
                  <span className="profile-highlight-value muted">No goals or assists yet.</span>
                )}
              </div>
              <div>
                <span className="profile-highlight-label">Longest In streak</span>
                <span className="profile-highlight-value">
                  {summary.longestStreak > 0 ? `${summary.longestStreak} games` : "—"}
                </span>
              </div>
              <div>
                <span className="profile-highlight-label">Current In streak</span>
                <span className="profile-highlight-value">
                  {summary.currentStreak > 0 ? `${summary.currentStreak} games` : "—"}
                </span>
              </div>
            </div>

            {recentMotm.length > 0 && (
              <div className="profile-motm-recent">
                <div className="section-label">Recent MOTM</div>
                <ul>
                  {recentMotm.map(({ game, shared }) => (
                    <li key={game.id}>
                      🏆 {game.game_date} vs {cleanOpponentName(game.opponent)}
                      {shared ? " (shared)" : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="section-label">Last {Math.min(5, summary.lastFive.length)} games</div>
            <ul className="profile-last-games">
              {summary.lastFive.map(({ game, status, goals, assists, played }) => (
                <li key={game.id}>
                  <span className="profile-last-date">{game.game_date}</span>
                  <span className="profile-last-opponent">{cleanOpponentName(game.opponent)}</span>
                  <span className={`profile-last-status status-${status}`}>{attendanceLabel(status)}</span>
                  {played && (
                    <span className="profile-last-ga">
                      {goals}G {assists}A
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
