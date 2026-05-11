import { useEffect, useState } from "react";
import { isStatsEditable } from "../utils/game";

export default function StatsTab({
  allGamePlayers,
  selectedGame,
  gameStats,
  selectedGameTotals,
  saveGuestStat,
  saveStat,
  saveGameTally,
  canWrite,
}) {
  const editable = canWrite && isStatsEditable(selectedGame);
  const lockedForFutureGame = !isStatsEditable(selectedGame);
  const [goalsInput, setGoalsInput] = useState("");
  const [assistsInput, setAssistsInput] = useState("");

  useEffect(() => {
    setGoalsInput(
      selectedGameTotals.goals === null || selectedGameTotals.goals === undefined
        ? ""
        : String(selectedGameTotals.goals)
    );
    setAssistsInput(
      selectedGameTotals.assists === null || selectedGameTotals.assists === undefined
        ? ""
        : String(selectedGameTotals.assists)
    );
  }, [selectedGameTotals.assists, selectedGameTotals.goals]);

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

  return (
    <section className="panel">
      <h2>Goals and assists</h2>
      {lockedForFutureGame && (
        <div className="warning-box">Stats can only be entered for games played today or earlier.</div>
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
                  {player.name}
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
