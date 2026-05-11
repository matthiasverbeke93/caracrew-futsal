import { useEffect, useState } from "react";

export default function StatsTab({
  allGamePlayers,
  gameStats,
  selectedGameTotals,
  saveGuestStat,
  saveStat,
  saveGameTally,
  canWrite,
}) {
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
  const goalsMissing =
    selectedGameTotals.goals === null || currentGoals < selectedGameTotals.goals;
  const assistsMissing =
    selectedGameTotals.assists === null || currentAssists < selectedGameTotals.assists;

  return (
    <section className="panel">
      <h2>Goals and assists</h2>
      <div className="tally-box">
        <div className="tally-row">
          <label>Total goals</label>
          <input
            type="number"
            min="0"
            value={goalsInput}
            placeholder="Set target"
            disabled={!canWrite}
            onChange={(e) => setGoalsInput(e.target.value)}
            onBlur={() => saveGameTally("goals", goalsInput)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
          />
          <span className={goalsMissing ? "badge-warning" : "badge-ok"}>
            {currentGoals} / {selectedGameTotals.goals ?? "?"}
          </span>
        </div>
        <div className="tally-row">
          <label>Total assists</label>
          <input
            type="number"
            min="0"
            value={assistsInput}
            placeholder="Set target"
            disabled={!canWrite}
            onChange={(e) => setAssistsInput(e.target.value)}
            onBlur={() => saveGameTally("assists", assistsInput)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
          />
          <span className={assistsMissing ? "badge-warning" : "badge-ok"}>
            {currentAssists} / {selectedGameTotals.assists ?? "?"}
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
                    disabled={!canWrite}
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
                    disabled={!canWrite}
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
