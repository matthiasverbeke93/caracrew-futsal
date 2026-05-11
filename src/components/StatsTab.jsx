export default function StatsTab({
  allGamePlayers,
  gameStats,
  selectedGameTotals,
  saveGuestStat,
  saveStat,
  saveGameTally,
  canWrite,
}) {
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
            value={selectedGameTotals.goals ?? ""}
            placeholder="Set target"
            disabled={!canWrite}
            onChange={(e) => saveGameTally("goals", e.target.value)}
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
            value={selectedGameTotals.assists ?? ""}
            placeholder="Set target"
            disabled={!canWrite}
            onChange={(e) => saveGameTally("assists", e.target.value)}
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
