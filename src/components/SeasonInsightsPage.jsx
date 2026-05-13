import { useMemo, useState } from "react";
import { TEAM_NAME } from "../constants";
import { buildTeamSeasonPlayerRows, sortTeamSeasonRows } from "../utils/teamSeasonStats";
import { buildMonthlyTeamGaSeries, seasonPlayedSummary } from "../utils/seasonInsights";

const BAR_KEYS = [
  { key: "involvement", label: "G+A" },
  { key: "pctPlayed", label: "% played" },
];

export default function SeasonInsightsPage({
  games,
  players,
  attendance,
  stats,
  seasonLabel: seasonLabelText,
  onBack,
  onOpenPlayer,
}) {
  const [barMetric, setBarMetric] = useState("involvement");
  const [sortKey, setSortKey] = useState("involvement");

  const livePlayers = useMemo(() => (players || []).filter((p) => !p.archived), [players]);

  const rows = useMemo(() => {
    const built = buildTeamSeasonPlayerRows(games, livePlayers, attendance, stats);
    return sortTeamSeasonRows(built, sortKey);
  }, [attendance, games, livePlayers, sortKey, stats]);

  const monthly = useMemo(() => buildMonthlyTeamGaSeries(games, stats), [games, stats]);

  const summary = useMemo(() => seasonPlayedSummary(games, stats), [games, stats]);

  const maxMonthlyGa = useMemo(() => {
    let m = 1;
    for (const mo of monthly) {
      m = Math.max(m, mo.goals + mo.assists);
    }
    return m;
  }, [monthly]);

  const barRows = useMemo(() => {
    const sorted = sortTeamSeasonRows([...rows], barMetric);
    return sorted.slice(0, 10);
  }, [barMetric, rows]);

  const maxBarValue = useMemo(() => {
    let m = 1;
    for (const r of barRows) {
      const v = Number(r[barMetric]) || 0;
      m = Math.max(m, v);
    }
    return m;
  }, [barMetric, barRows]);

  return (
    <section className="panel insights-panel">
      <div className="team-stats-header">
        <div>
          <h2>Season insights · {seasonLabelText}</h2>
          <p className="team-stats-sub">
            Live season trends for <em>{TEAM_NAME}</em> — monthly scoring pace and player involvement (
            {summary.playedGames} played fixtures).
          </p>
        </div>
        <button type="button" className="team-stats-back" onClick={onBack}>
          Back
        </button>
      </div>

      <div className="insights-summary-strip">
        <div className="insights-kpi">
          <span className="insights-kpi-label">Team goals</span>
          <strong className="insights-kpi-value">{summary.goals}</strong>
        </div>
        <div className="insights-kpi">
          <span className="insights-kpi-label">Team assists</span>
          <strong className="insights-kpi-value">{summary.assists}</strong>
        </div>
        <div className="insights-kpi">
          <span className="insights-kpi-label">G+A per played game</span>
          <strong className="insights-kpi-value">{summary.gaPerPlayedGame.toFixed(2)}</strong>
        </div>
      </div>

      <section className="insights-section" aria-labelledby="insights-monthly-heading">
        <h3 id="insights-monthly-heading">Scoring pace by month</h3>
        <p className="insights-section-intro">
          Goals and assists counted in matches already played (calendar month of fixture).
        </p>
        {monthly.length === 0 ? (
          <p className="insights-empty">No played matches in this season yet.</p>
        ) : (
          <ul className="insights-month-chart">
            {monthly.map((mo) => {
              const ga = mo.goals + mo.assists;
              const w = Math.round((ga / maxMonthlyGa) * 100);
              return (
                <li key={mo.ym} className="insights-month-row">
                  <span className="insights-month-label">{mo.label}</span>
                  <div className="insights-month-bar-wrap" role="presentation">
                    <div
                      className="insights-month-bar"
                      style={{ width: `${w}%` }}
                      title={`${mo.goals}G ${mo.assists}A · ${mo.gamesPlayed} games`}
                    />
                  </div>
                  <span className="insights-month-meta">
                    {mo.goals}G {mo.assists}A · {mo.gamesPlayed} gp
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="insights-section" aria-labelledby="insights-leaders-heading">
        <div className="insights-section-head">
          <h3 id="insights-leaders-heading">Squad leaders</h3>
          <div className="insights-toggle" role="group" aria-label="Bar chart metric">
            {BAR_KEYS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                className={barMetric === opt.key ? "active" : ""}
                onClick={() => setBarMetric(opt.key)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        {barRows.length === 0 ? (
          <p className="insights-empty">No player rows yet.</p>
        ) : (
          <ul className="insights-leader-bars">
            {barRows.map((r) => {
              const raw = Number(r[barMetric]) || 0;
              const display =
                barMetric === "pctPlayed" ? `${Math.round(raw)}%` : String(Math.round(raw * 10) / 10);
              const w = Math.round((raw / maxBarValue) * 100);
              return (
                <li key={r.id} className="insights-leader-row">
                  <button
                    type="button"
                    className="player-link insights-leader-link"
                    onClick={() => onOpenPlayer(r.id)}
                  >
                    {r.name}
                  </button>
                  <div className="insights-leader-bar-wrap">
                    <div className="insights-leader-bar" style={{ width: `${w}%` }} />
                  </div>
                  <span className="insights-leader-val">{display}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="insights-section" aria-labelledby="insights-table-heading">
        <h3 id="insights-table-heading">Full season table</h3>
        <div className="team-stats-table-wrap">
          <table className="team-stats-table insights-table">
            <thead>
              <tr>
                <th>
                  <button
                    type="button"
                    className={`th-sort ${sortKey === "name" ? "active" : ""}`}
                    onClick={() => setSortKey("name")}
                  >
                    Player
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className={`th-sort ${sortKey === "pctPlayed" ? "active" : ""}`}
                    onClick={() => setSortKey("pctPlayed")}
                  >
                    % played
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className={`th-sort ${sortKey === "goals" ? "active" : ""}`}
                    onClick={() => setSortKey("goals")}
                  >
                    G
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className={`th-sort ${sortKey === "assists" ? "active" : ""}`}
                    onClick={() => setSortKey("assists")}
                  >
                    A
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className={`th-sort ${sortKey === "involvement" ? "active" : ""}`}
                    onClick={() => setSortKey("involvement")}
                  >
                    G+A
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <button type="button" className="player-link" onClick={() => onOpenPlayer(r.id)}>
                      {r.name}
                    </button>
                    {!r.fixed && <span className="guest-badge">Guest</span>}
                  </td>
                  <td>{r.pctPlayed}%</td>
                  <td>{r.goals}</td>
                  <td>{r.assists}</td>
                  <td>{r.involvement}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
