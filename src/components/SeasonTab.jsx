export default function SeasonTab({ seasonLeaders }) {
  return (
    <section className="panel season-panel">
      <div className="section-label">Full season</div>
      <h2>Season leaders</h2>

      <table>
        <thead>
          <tr>
            <th>Player</th>
            <th>Goals</th>
            <th>Assists</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {seasonLeaders.map((player) => (
            <tr key={player.id}>
              <td>{player.name}</td>
              <td>{player.goals}</td>
              <td>{player.assists}</td>
              <td>
                <strong>{player.goals + player.assists}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
