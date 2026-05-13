import { useMemo, useState } from "react";
import { TEAM_NAME } from "../constants";
import { getStaticTeamStatsForSeason } from "../data/seasonTeamStatsOverrides";
import {
  RSVP_ON_TIME_DAYS_BEFORE,
  STATS_ON_TIME_DAYS_AFTER,
  computeComplianceForAllPlayers,
  formatComplianceStars,
} from "../utils/playerCompliance";
import { buildMonthlyTeamGaSeries, seasonPlayedSummary } from "../utils/seasonInsights";
import {
  buildStaticTeamSeasonRows,
  buildTeamSeasonPlayerRows,
  sortTeamSeasonRows,
} from "../utils/teamSeasonStats";

function fmtPer(n) {
  if (n === 0) return "0";
  return n.toFixed(2);
}

const BAR_KEYS = [
  { key: "involvement", label: "G+A" },
  { key: "pctPlayed", label: "% played" },
];

const COLUMNS = [
  { key: "name", label: "Player" },
  { key: "gamesPlayed", label: "GP" },
  { key: "pctPlayed", label: "% played" },
  { key: "goals", label: "G" },
  { key: "assists", label: "A" },
  {
    key: "motmWins",
    label: "MOTM",
    tooltip: "Man of the match wins this season (after voting closes; ties count)",
  },
  { key: "goalsPerGame", label: "G/game" },
  { key: "assistsPerGame", label: "A/game" },
  { key: "involvement", label: "G+A" },
  { key: "involvementPerGame", label: "(G+A)/game" },
];

const COMPLIANCE_SORT = [
  { key: "name", label: "Player" },
  {
    key: "rsvpOnTimePct",
    label: "RSVP on time",
    tooltip: `Share of season games where attendance was saved at least ${RSVP_ON_TIME_DAYS_BEFORE} days before kickoff`,
  },
  {
    key: "statsOnTimePct",
    label: "Stats on time",
    tooltip: `Share of played games where goals/assists were saved within ${STATS_ON_TIME_DAYS_AFTER} days after kickoff`,
  },
  {
    key: "complianceStars",
    label: "Score",
    tooltip: "Overall compliance (0–5 stars) from RSVP and stats on-time rates",
  },
];

export default function SeasonOverviewPage({
  games,
  players,
  attendance,
  stats,
  motmVotes = [],
  seasonSlug,
  seasonLabel: seasonLabelText,
  onBack,
  onOpenPlayer,
}) {
  const [barMetric, setBarMetric] = useState("involvement");
  const [tableSortKey, setTableSortKey] = useState("gamesPlayed");
  const [complianceSortKey, setComplianceSortKey] = useState("complianceStars");

  const staticData = useMemo(
    () => getStaticTeamStatsForSeason(seasonSlug),
    [seasonSlug]
  );

  const livePlayers = useMemo(() => (players || []).filter((p) => !p.archived), [players]);

  const tableRows = useMemo(() => {
    const built = staticData
      ? buildStaticTeamSeasonRows(staticData, players)
      : buildTeamSeasonPlayerRows(games, livePlayers, attendance, stats, motmVotes);
    return sortTeamSeasonRows(built, tableSortKey);
  }, [attendance, games, livePlayers, motmVotes, players, staticData, stats, tableSortKey]);

  const barRows = useMemo(() => {
    const sorted = sortTeamSeasonRows([...tableRows], barMetric);
    return sorted.slice(0, 10);
  }, [barMetric, tableRows]);

  const maxBarValue = useMemo(() => {
    let m = 1;
    for (const r of barRows) {
      const v = Number(r[barMetric]) || 0;
      m = Math.max(m, v);
    }
    return m;
  }, [barMetric, barRows]);

  const monthly = useMemo(() => buildMonthlyTeamGaSeries(games, stats), [games, stats]);

  const summary = useMemo(() => seasonPlayedSummary(games, stats), [games, stats]);

  const maxMonthlyGa = useMemo(() => {
    let m = 1;
    for (const mo of monthly) {
      m = Math.max(m, mo.goals + mo.assists);
    }
    return m;
  }, [monthly]);

  const complianceRowsRaw = useMemo(() => {
    if (!games?.length) return [];
    return computeComplianceForAllPlayers(games, attendance, stats, players);
  }, [games, attendance, stats, players]);

  const complianceRows = useMemo(() => {
    const list = [...complianceRowsRaw];
    const nullLastDesc = (va, vb) => {
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (vb !== va) return vb - va;
      return 0;
    };

    list.sort((a, b) => {
      if (complianceSortKey === "name") return a.name.localeCompare(b.name);
      if (complianceSortKey === "complianceStars") {
        if (b.complianceStars !== a.complianceStars) return b.complianceStars - a.complianceStars;
        return a.name.localeCompare(b.name);
      }
      if (complianceSortKey === "rsvpOnTimePct") {
        const cmp = nullLastDesc(a.rsvpOnTimePct, b.rsvpOnTimePct);
        if (cmp !== 0) return cmp;
        return a.name.localeCompare(b.name);
      }
      if (complianceSortKey === "statsOnTimePct") {
        const cmp = nullLastDesc(a.statsOnTimePct, b.statsOnTimePct);
        if (cmp !== 0) return cmp;
        return a.name.localeCompare(b.name);
      }
      return 0;
    });
    return list;
  }, [complianceRowsRaw, complianceSortKey]);

  const denominator = staticData
    ? tableRows[0]?.totalSeasonGames ?? 0
    : games?.length ?? 0;

  return (
    <section className="panel insights-panel team-stats-panel season-overview-panel">
      <div className="team-stats-header">
        <div>
          <h2>Season overview · {seasonLabelText}</h2>
          <p className="team-stats-sub">
            <span className="season-overview-intro-line">
              Trends and totals for <em>{TEAM_NAME}</em>
              {summary.playedGames > 0 ? (
                <>
                  {" "}
                  · {summary.playedGames} played fixture{summary.playedGames === 1 ? "" : "s"}
                </>
              ) : null}
              .
            </span>{" "}
            {staticData ? (
              <>
                Main table can include an <strong>LZV snapshot</strong> for games played and goals (
                {denominator} games this season). % = GP ÷ season games.
              </>
            ) : (
              <>
                {denominator} scheduled game{denominator === 1 ? "" : "s"} · GP = games marked{" "}
                <em>In</em> · % = GP ÷ season games.
              </>
            )}
          </p>
        </div>
        <button type="button" className="team-stats-back" onClick={onBack}>
          ← Back to games
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

      <section className="insights-section" aria-labelledby="overview-monthly-heading">
        <h3 id="overview-monthly-heading">Scoring pace by month</h3>
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

      <section className="insights-section" aria-labelledby="overview-leaders-heading">
        <div className="insights-section-head">
          <h3 id="overview-leaders-heading">Squad leaders</h3>
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

      <section className="insights-section" aria-labelledby="overview-totals-heading">
        <h3 id="overview-totals-heading">Player totals</h3>
        <div className="team-stats-table-wrap">
          <table className="team-stats-table">
            <thead>
              <tr>
                {COLUMNS.map((col) => (
                  <th key={col.key}>
                    <button
                      type="button"
                      className={`th-sort ${tableSortKey === col.key ? "active" : ""}`}
                      title={col.tooltip}
                      onClick={() => setTableSortKey(col.key)}
                    >
                      {col.label}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.hasProfile === false ? (
                      <span className="player-name-plain">{r.name}</span>
                    ) : (
                      <button
                        type="button"
                        className="player-link"
                        onClick={() => onOpenPlayer(r.id)}
                      >
                        {r.name}
                      </button>
                    )}
                    {!r.fixed && <span className="guest-badge">Guest</span>}
                  </td>
                  <td>{r.gamesPlayed}</td>
                  <td>{r.pctPlayed}%</td>
                  <td>{r.goals}</td>
                  <td>{r.assists}</td>
                  <td>{r.motmWins ?? 0}</td>
                  <td>{fmtPer(r.goalsPerGame)}</td>
                  <td>{fmtPer(r.assistsPerGame)}</td>
                  <td>{r.involvement}</td>
                  <td>{fmtPer(r.involvementPerGame)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {complianceRows.length > 0 && (
        <section className="team-stats-compliance" aria-labelledby="compliance-heading">
          <h3 id="compliance-heading">How quickly people respond</h3>
          <div className="team-stats-compliance-intro">
            <p>
              Percentages use <strong>when someone last saved</strong> their row in this app (same
              timestamps as Supabase <code>updated_at</code>).
              {staticData ? (
                <>
                  {" "}
                  The player totals above can still show <strong>goals and games played</strong> from
                  an <strong>LZV import</strong>; that import is unrelated to these timings.
                </>
              ) : null}
            </p>
            <ul>
              <li>
                <strong>RSVP on time</strong> — of all scheduled games this season, the share where
                attendance was saved at least <strong>{RSVP_ON_TIME_DAYS_BEFORE} days before</strong>{" "}
                kickoff. No row, or saved too late, counts as not on time.
              </li>
              <li>
                <strong>Stats on time</strong> — of <em>played</em> games, the share where goals and
                assists were saved between kickoff and <strong>{STATS_ON_TIME_DAYS_AFTER} full days
                (72 hours)</strong> after kickoff. Missing stats after a played match counts as not
                on time.
              </li>
              <li>
                <strong>Score</strong> — <strong>0–5 stars</strong>: average of the two percentages
                when both apply; if there are no played games yet, only RSVP on time is used. Hover a
                percentage to see how many games it is based on.
              </li>
            </ul>
          </div>

          <div className="team-stats-table-wrap">
            <table className="team-stats-table team-stats-compliance-table">
              <thead>
                <tr>
                  {COMPLIANCE_SORT.map((col) => (
                    <th key={col.key}>
                      <button
                        type="button"
                        className={`th-sort ${complianceSortKey === col.key ? "active" : ""}`}
                        title={col.tooltip}
                        onClick={() => setComplianceSortKey(col.key)}
                      >
                        {col.label}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {complianceRows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <button
                        type="button"
                        className="player-link"
                        onClick={() => onOpenPlayer(r.id)}
                      >
                        {r.name}
                      </button>
                      {!r.fixed && <span className="guest-badge">Guest</span>}
                    </td>
                    <td
                      title={
                        r.rsvpGamesDenom > 0
                          ? `${r.rsvpInTimeGames} of ${r.rsvpGamesDenom} games saved ≥${RSVP_ON_TIME_DAYS_BEFORE}d before kickoff`
                          : undefined
                      }
                    >
                      {r.rsvpOnTimePct != null ? `${r.rsvpOnTimePct}%` : "—"}
                    </td>
                    <td
                      title={
                        r.statsGamesDenom > 0
                          ? `${r.statsInTimeGames} of ${r.statsGamesDenom} played games with stats saved within ${STATS_ON_TIME_DAYS_AFTER}d after kickoff`
                          : "No played games in this season yet"
                      }
                    >
                      {r.statsOnTimePct != null ? `${r.statsOnTimePct}%` : "—"}
                    </td>
                    <td>
                      <span
                        className="compliance-stars"
                        title={`${r.complianceStars} of 5 — RSVP ${r.rsvpOnTimePct ?? "—"}%${
                          r.statsOnTimePct != null ? `, stats ${r.statsOnTimePct}%` : ""
                        }`}
                      >
                        {formatComplianceStars(r.complianceStars)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {complianceRows.length === 0 && games?.length > 0 && (
        <p className="team-stats-compliance-empty">
          No active players loaded for confirmation timing.
        </p>
      )}
    </section>
  );
}
