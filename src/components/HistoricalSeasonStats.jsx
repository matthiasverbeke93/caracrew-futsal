import { useMemo } from "react";
import { HISTORICAL_SEASON_STATS } from "../data/historicalSeasonStats";

const CHART_W = 760;
const CHART_H = 220;
const PAD_X = 36;
const PAD_Y = 24;

function fmtSigned(n) {
  return n > 0 ? `+${n}` : String(n);
}

function bestBy(rows, key, compare) {
  return rows.reduce((best, row) => (compare(row[key], best[key]) ? row : best), rows[0]);
}

function makePoints(rows, key, lowerIsBetter = false) {
  const values = rows.map((row) => row[key]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const innerW = CHART_W - PAD_X * 2;
  const innerH = CHART_H - PAD_Y * 2;

  return rows.map((row, idx) => {
    const x = PAD_X + (idx / Math.max(rows.length - 1, 1)) * innerW;
    const pct = (row[key] - min) / span;
    const y = lowerIsBetter ? PAD_Y + pct * innerH : PAD_Y + (1 - pct) * innerH;
    return { row, x, y };
  });
}

function TrendChart({ rows, title, metricKey, formatValue, lowerIsBetter = false, stroke = "#2563eb" }) {
  const points = makePoints(rows, metricKey, lowerIsBetter);
  const path = points.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <article className="history-chart-card">
      <div className="history-chart-head">
        <h4>{title}</h4>
        <span>{lowerIsBetter ? "Lower is better" : "Higher is better"}</span>
      </div>
      <svg
        className="history-line-chart"
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        role="img"
        aria-label={`${title} by season`}
      >
        <line x1={PAD_X} y1={CHART_H - PAD_Y} x2={CHART_W - PAD_X} y2={CHART_H - PAD_Y} />
        <polyline points={path} fill="none" stroke={stroke} strokeWidth="4" strokeLinecap="round" />
        {points.map((point) => (
          <g key={point.row.season}>
            <circle cx={point.x} cy={point.y} r="5" fill={stroke} />
            <text x={point.x} y={point.y - 12} textAnchor="middle" className="history-chart-value">
              {formatValue(point.row[metricKey])}
            </text>
            <text
              x={point.x}
              y={CHART_H - 6}
              textAnchor="middle"
              className="history-chart-season"
            >
              {point.row.season.slice(2)}
            </text>
          </g>
        ))}
      </svg>
    </article>
  );
}

function GoalsChart({ rows }) {
  const maxGoals = Math.max(...rows.flatMap((row) => [row.goalsFor, row.goalsAgainst]));

  return (
    <article className="history-chart-card history-goals-card">
      <div className="history-chart-head">
        <h4>Goals for vs against</h4>
        <span>Season totals</span>
      </div>
      <div className="history-goals-legend" aria-hidden="true">
        <span className="for">For</span>
        <span className="against">Against</span>
      </div>
      <ul className="history-goals-chart">
        {rows.map((row) => (
          <li key={row.season}>
            <span className="history-goals-season">{row.season}</span>
            <div className="history-goals-bars">
              <div
                className="history-goal-bar for"
                style={{ width: `${Math.round((row.goalsFor / maxGoals) * 100)}%` }}
                title={`${row.goalsFor} goals for`}
              >
                {row.goalsFor}
              </div>
              <div
                className="history-goal-bar against"
                style={{ width: `${Math.round((row.goalsAgainst / maxGoals) * 100)}%` }}
                title={`${row.goalsAgainst} goals against`}
              >
                {row.goalsAgainst}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </article>
  );
}

export default function HistoricalSeasonStats() {
  const rows = useMemo(
    () =>
      HISTORICAL_SEASON_STATS.map((row) => ({
        ...row,
        goalsPerGame: row.games > 0 ? row.goalsFor / row.games : 0,
      })),
    []
  );
  const summary = useMemo(() => {
    const bestPpg = bestBy(rows, "pointsPerGame", (value, best) => value > best);
    const bestFinish = bestBy(rows, "position", (value, best) => value < best);
    const bestAttack = bestBy(rows, "goalsFor", (value, best) => value > best);
    const totalPoints = rows.reduce((sum, row) => sum + row.points, 0);
    return { bestPpg, bestFinish, bestAttack, totalPoints };
  }, [rows]);

  return (
    <div className="history-stats">
      <div className="insights-summary-strip history-summary-strip">
        <div className="insights-kpi">
          <span className="insights-kpi-label">Best finish</span>
          <strong className="insights-kpi-value">
            {summary.bestFinish.position}e
            <small>{summary.bestFinish.season}</small>
          </strong>
        </div>
        <div className="insights-kpi">
          <span className="insights-kpi-label">Best PPG</span>
          <strong className="insights-kpi-value">
            {summary.bestPpg.pointsPerGame.toFixed(2)}
            <small>{summary.bestPpg.season}</small>
          </strong>
        </div>
        <div className="insights-kpi">
          <span className="insights-kpi-label">Best attack</span>
          <strong className="insights-kpi-value">
            {summary.bestAttack.goalsFor}
            <small>{summary.bestAttack.season}</small>
          </strong>
        </div>
        <div className="insights-kpi">
          <span className="insights-kpi-label">Total points</span>
          <strong className="insights-kpi-value">{summary.totalPoints}</strong>
        </div>
      </div>

      <section className="insights-section" aria-labelledby="history-evolution-heading">
        <div className="insights-section-head">
          <div>
            <h3 id="history-evolution-heading">Historical evolution</h3>
            <p className="insights-section-intro">
              League results from 2017-18 through 2025-26, based on the historical season snapshot.
            </p>
          </div>
        </div>
        <div className="history-chart-grid">
          <TrendChart
            rows={rows}
            title="Points per game"
            metricKey="pointsPerGame"
            formatValue={(value) => value.toFixed(2)}
          />
          <TrendChart
            rows={rows}
            title="Goals scored per game"
            metricKey="goalsPerGame"
            formatValue={(value) => value.toFixed(2)}
            stroke="#16a34a"
          />
          <TrendChart
            rows={rows}
            title="Goal difference"
            metricKey="goalDifference"
            formatValue={fmtSigned}
            stroke="#ea580c"
          />
          <TrendChart
            rows={rows}
            title="League position"
            metricKey="position"
            formatValue={(value) => `${value}e`}
            lowerIsBetter
            stroke="#7c3aed"
          />
          <GoalsChart rows={rows} />
        </div>
      </section>

      <section className="insights-section" aria-labelledby="history-table-heading">
        <h3 id="history-table-heading">Season-by-season results</h3>
        <div className="team-stats-table-wrap">
          <table className="team-stats-table history-table">
            <thead>
              <tr>
                <th>Season</th>
                <th>Pos</th>
                <th>W</th>
                <th>D</th>
                <th>L</th>
                <th>GF</th>
                <th>GA</th>
                <th>GD</th>
                <th>Games</th>
                <th>Pts</th>
                <th>PPG</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.season}>
                  <td>{row.season}</td>
                  <td>{row.position}</td>
                  <td>{row.wins}</td>
                  <td>{row.draws}</td>
                  <td>{row.losses}</td>
                  <td>{row.goalsFor}</td>
                  <td>{row.goalsAgainst}</td>
                  <td>{fmtSigned(row.goalDifference)}</td>
                  <td>{row.games}</td>
                  <td>{row.points}</td>
                  <td>{row.pointsPerGame.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
