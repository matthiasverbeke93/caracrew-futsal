import { useEffect, useMemo, useState } from "react";
import {
  STATS_FREEZE_DAYS,
  getStatsLockDaysLeft,
  isPlayed,
  isStatsEditable,
  isStatsFrozen,
} from "../utils/game";
import {
  getMotmLeaderIds,
  getMotmVotingEnd,
  getMotmVotingStart,
  getVoterKey,
  isMotmVotingOpen,
} from "../utils/motm";

export default function StatsTab({
  allGamePlayers,
  selectedGame,
  gameStats,
  selectedGameTotals,
  saveGuestStat,
  saveStat,
  saveGameTally,
  motmVotes,
  submitMotmVote,
  onOpenPlayer,
  canWrite,
}) {
  const editable = canWrite && isStatsEditable(selectedGame);
  const frozen = isStatsFrozen(selectedGame);
  const lockedForFutureGame = !isStatsEditable(selectedGame) && !frozen;
  const daysUntilLock = getStatsLockDaysLeft(selectedGame);
  const [goalsInput, setGoalsInput] = useState(() =>
    selectedGameTotals.goals === null || selectedGameTotals.goals === undefined
      ? ""
      : String(selectedGameTotals.goals)
  );
  const [assistsInput, setAssistsInput] = useState(() =>
    selectedGameTotals.assists === null || selectedGameTotals.assists === undefined
      ? ""
      : String(selectedGameTotals.assists)
  );
  const [motmMessage, setMotmMessage] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const currentGoals = gameStats.reduce((sum, row) => sum + (row.goals || 0), 0);
  const currentAssists = gameStats.reduce((sum, row) => sum + (row.assists || 0), 0);
  const goalsTarget = selectedGameTotals.goals;
  const assistsTarget = selectedGameTotals.assists;
  const goalsOverTarget = goalsTarget !== null && goalsTarget !== undefined && currentGoals > goalsTarget;
  const assistsOverTarget =
    assistsTarget !== null && assistsTarget !== undefined && currentAssists > assistsTarget;
  const goalsMissing = !goalsOverTarget && (goalsTarget === null || currentGoals < goalsTarget);
  const assistsMissing =
    !assistsOverTarget && (assistsTarget === null || currentAssists < assistsTarget);
  const goalsBadgeClass = goalsOverTarget
    ? "badge-error"
    : goalsMissing
      ? "badge-warning"
      : "badge-ok";
  const assistsBadgeClass = assistsOverTarget
    ? "badge-error"
    : assistsMissing
      ? "badge-warning"
      : "badge-ok";

  const motmEnd = getMotmVotingEnd(selectedGame);
  const motmStart = getMotmVotingStart(selectedGame);
  const votingOpen = isMotmVotingOpen(selectedGame, now);
  const votingFinished = isPlayed(selectedGame) && motmEnd && now > motmEnd.getTime();
  const votingPending =
    isPlayed(selectedGame) && motmStart && motmEnd && now < motmStart.getTime();

  const motmVotesForGame = useMemo(
    () => motmVotes.filter((v) => v.game_id === selectedGame.id),
    [motmVotes, selectedGame.id]
  );

  const voterKey = useMemo(() => getVoterKey(), []);
  const myNomineeId = motmVotesForGame.find((v) => v.voter_key === voterKey)?.nominee_id;

  const motmCounts = useMemo(() => {
    const m = {};
    for (const v of motmVotesForGame) {
      m[v.nominee_id] = (m[v.nominee_id] || 0) + 1;
    }
    return m;
  }, [motmVotesForGame]);

  const motmLeaders = useMemo(
    () => getMotmLeaderIds(selectedGame.id, motmVotes),
    [motmVotes, selectedGame.id]
  );

  const showMotmBlock = isPlayed(selectedGame) && !!motmEnd;

  async function handleMotmVote(nomineeId) {
    setMotmMessage(null);
    const res = await submitMotmVote(nomineeId);
    if (res.error) setMotmMessage(res.error);
  }

  return (
    <section className="panel">
      <h2>Goals and assists</h2>
      {lockedForFutureGame && (
        <div className="warning-box">Stats can only be entered for games played today or earlier.</div>
      )}
      {frozen && (
        <div className="warning-box">
          Stats are locked. This game was played more than {STATS_FREEZE_DAYS} days ago.
        </div>
      )}
      {!frozen && daysUntilLock !== null && (
        <div className="info-banner">
          Stats lock in {daysUntilLock} day{daysUntilLock === 1 ? "" : "s"}.
        </div>
      )}
      {(goalsOverTarget || assistsOverTarget) && (
        <div className="error-box">
          {goalsOverTarget && (
            <div>
              Per-player goals ({currentGoals}) exceed the total goals target ({goalsTarget}).
            </div>
          )}
          {assistsOverTarget && (
            <div>
              Per-player assists ({currentAssists}) exceed the total assists target ({assistsTarget}).
            </div>
          )}
        </div>
      )}
      <div className="tally-box">
        <div className="tally-row">
          <label>Total goals</label>
          <input
            type="number"
            min="0"
            value={goalsInput}
            placeholder="Set target"
            disabled={!editable}
            onChange={(e) => setGoalsInput(e.target.value)}
            onBlur={() => saveGameTally("goals", goalsInput)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
          />
          <span className={goalsBadgeClass}>
            {currentGoals} / {goalsTarget ?? "?"}
          </span>
        </div>
        <div className="tally-row">
          <label>Total assists</label>
          <input
            type="number"
            min="0"
            value={assistsInput}
            placeholder="Set target"
            disabled={!editable}
            onChange={(e) => setAssistsInput(e.target.value)}
            onBlur={() => saveGameTally("assists", assistsInput)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
          />
          <span className={assistsBadgeClass}>
            {currentAssists} / {assistsTarget ?? "?"}
          </span>
        </div>
      </div>

      {showMotmBlock && (
        <div className="motm-panel">
          <h3>Player of the match</h3>
          {votingPending && (
            <p className="motm-hint">
              MOTM voting opens about 2 hours after kickoff, then stays open for 24 hours.
            </p>
          )}
          {votingOpen && (
            <p className="motm-hint">One vote per device — tap again to change your pick.</p>
          )}
          {votingFinished && motmLeaders.length > 0 && (
            <p className="motm-result">
              Winner{motmLeaders.length > 1 ? "s (tie)" : ""}:{" "}
              {motmLeaders
                .map((id) => {
                  const p = allGamePlayers.find((x) => x.id === id);
                  return p?.name || "Unknown";
                })
                .join(" · ")}
            </p>
          )}
          {votingFinished && motmLeaders.length === 0 && (
            <p className="motm-hint">No votes recorded for this game.</p>
          )}
          {motmMessage && <p className="error-inline">{motmMessage}</p>}
          {votingOpen && canWrite && (
            <div className="motm-vote-grid">
              {allGamePlayers.map((player) => (
                <button
                  key={player.id}
                  type="button"
                  className={myNomineeId === player.id ? "motm-vote active" : "motm-vote"}
                  onClick={() => handleMotmVote(player.id)}
                >
                  <span>{player.name}</span>
                  <span className="motm-count">{motmCounts[player.id] || 0}</span>
                </button>
              ))}
            </div>
          )}
          {votingOpen && !canWrite && (
            <p className="motm-hint">Log in to vote (if your deployment requires auth for writes).</p>
          )}
          {!votingOpen && votingFinished && motmVotesForGame.length > 0 && (
            <ul className="motm-tally">
              {Object.entries(motmCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([id, n]) => {
                  const p = allGamePlayers.find((x) => x.id === id);
                  return (
                    <li key={id}>
                      {p?.name || id}: {n}
                    </li>
                  );
                })}
            </ul>
          )}
        </div>
      )}

      <table>
        <thead>
          <tr>
            <th>Player</th>
            <th>Goals</th>
            <th>Assists</th>
          </tr>
        </thead>
        <tbody>
          {allGamePlayers.map((player) => {
            const row =
              player.type === "ad_hoc_guest"
                ? player
                : gameStats.find((s) => s.player_id === player.id);

            return (
              <tr key={player.id}>
                <td>
                  <button type="button" className="player-link" onClick={() => onOpenPlayer(player.id)}>
                    {player.name}
                  </button>
                  {player.type !== "fixed" && <span className="guest-badge">Guest</span>}
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    value={row?.goals || 0}
                    disabled={!editable}
                    onChange={(e) =>
                      player.type === "ad_hoc_guest"
                        ? saveGuestStat(player.id, "goals", e.target.value)
                        : saveStat(player.id, "goals", e.target.value)
                    }
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    value={row?.assists || 0}
                    disabled={!editable}
                    onChange={(e) =>
                      player.type === "ad_hoc_guest"
                        ? saveGuestStat(player.id, "assists", e.target.value)
                        : saveStat(player.id, "assists", e.target.value)
                    }
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
