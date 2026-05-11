export default function StatsTab({ allGamePlayers, gameStats, saveGuestStat, saveStat, canWrite }) {
  return (
    <section className="panel">
      <div className="section-label">Selected game</div>
      <h2>Goals and assists</h2>

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
              player.type === "guest" ? player : gameStats.find((s) => s.player_id === player.id);

            return (
              <tr key={player.id}>
                <td>
                  {player.name}
                  {player.type === "guest" && <span className="guest-badge">External</span>}
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    value={row?.goals || 0}
                    disabled={!canWrite}
                    onChange={(e) =>
                      player.type === "guest"
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
                      player.type === "guest"
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
