import { useMemo, useState } from "react";
import { getStaticTeamStatsForSeason } from "../data/seasonTeamStatsOverrides";
import {
  computeComplianceForAllPlayers,
  formatMedianDaysBefore,
  formatMedianDaysBeforeShort,
  formatMedianHoursAfter,
  formatMedianHoursAfterShort,
} from "../utils/playerCompliance";
import {
  buildStaticTeamSeasonRows,
  buildTeamSeasonPlayerRows,
  sortTeamSeasonRows,
} from "../utils/teamSeasonStats";

function fmtPer(n) {
  if (n === 0) return "0";
  return n.toFixed(2);
}

const COLUMNS = [
  { key: "name", label: "Player" },
  { key: "gamesPlayed", label: "GP" },
  { key: "pctPlayed", label: "% played" },
  { key: "goals", label: "G" },
  { key: "assists", label: "A" },
  { key: "goalsPerGame", label: "G/game" },
  { key: "assistsPerGame", label: "A/game" },
  { key: "involvement", label: "G+A" },
  { key: "involvementPerGame", label: "(G+A)/game" },
];

const COMPLIANCE_SORT = [
  { key: "name", label: "Player" },
  { key: "rsvpLead", label: "RSVP lead" },
  { key: "late", label: "Late" },
  { key: "statsLag", label: "Stats lag" },
];

export default function TeamStatsPage({
  games,
  players,
  attendance,
  stats,
  seasonSlug,
  seasonLabel: seasonLabelText,
  onBack,
  onOpenPlayer,
}) {
  const [sortKey, setSortKey] = useState("gamesPlayed");
  const [complianceSortKey, setComplianceSortKey] = useState("name");

  const staticData = useMemo(
    () => getStaticTeamStatsForSeason(seasonSlug),
    [seasonSlug]
  );

  const rows = useMemo(() => {
    // Live data hides archived players entirely. Static snapshots can still
    // reference them because the snapshot is the source of truth.
    const livePlayers = (players || []).filter((p) => !p.archived);
    const built = staticData
      ? buildStaticTeamSeasonRows(staticData, players)
      : buildTeamSeasonPlayerRows(games, livePlayers, attendance, stats);
    return sortTeamSeasonRows(built, sortKey);
  }, [attendance, games, players, sortKey, staticData, stats]);

  /** Live timing from app saves — show even when main table uses LZV static snapshot for totals. */
  const complianceRowsRaw = useMemo(() => {
    if (!games?.length) return [];
    return computeComplianceForAllPlayers(games, attendance, stats, players);
  }, [games, attendance, stats, players]);

  const complianceRows = useMemo(() => {
    const list = [...complianceRowsRaw];
    const nullLast = (a, b, cmp) => {
      if (a == null && b == null) return 0;
      if (a == null) return 1;
      if (b == null) return -1;
      return cmp(a, b);
    };

    list.sort((a, b) => {
      if (complianceSortKey === "name") return a.name.localeCompare(b.name);
      if (complianceSortKey === "late") return (b.attendanceLateCount || 0) - (a.attendanceLateCount || 0);
      if (complianceSortKey === "rsvpLead") {
        return nullLast(a.attendanceMedianDaysBefore, b.attendanceMedianDaysBefore, (x, y) => y - x);
      }
      if (complianceSortKey === "statsLag") {
        return nullLast(a.statsMedianHoursAfter, b.statsMedianHoursAfter, (x, y) => x - y);
      }
      return 0;
    });
    return list;
  }, [complianceRowsRaw, complianceSortKey]);

  const denominator = staticData
    ? rows[0]?.totalSeasonGames ?? 0
    : games?.length ?? 0;

  return (
    <section className="panel team-stats-panel">
      <div className="team-stats-header">
        <div>
          <h2>Team stats · {seasonLabelText}</h2>
          <p className="team-stats-sub">
            {staticData ? (
              <>
                {seasonLabelText} snapshot · {denominator} games this season · % = GP ÷
                season games · sourced from the LZV team page
              </>
            ) : (
              <>
                {seasonLabelText} totals · {denominator} scheduled game
                {denominator === 1 ? "" : "s"} · GP = games marked <em>playing</em> · % = GP ÷
                season games
              </>
            )}
          </p>
        </div>
        <button type="button" className="team-stats-back" onClick={onBack}>
          ← Back to games
        </button>
      </div>

      <div className="team-stats-table-wrap">
        <table className="team-stats-table">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th key={col.key}>
                  <button
                    type="button"
                    className={`th-sort ${sortKey === col.key ? "active" : ""}`}
                    onClick={() => setSortKey(col.key)}
                  >
                    {col.label}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
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
                <td>{fmtPer(r.goalsPerGame)}</td>
                <td>{fmtPer(r.assistsPerGame)}</td>
                <td>{r.involvement}</td>
                <td>{fmtPer(r.involvementPerGame)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {complianceRows.length > 0 && (
        <section className="team-stats-compliance" aria-labelledby="compliance-heading">
          <h3 id="compliance-heading">Confirmation timing</h3>
          <p className="team-stats-compliance-intro">
            {staticData ? (
              <>
                From save timestamps in this app (totals above may use the LZV snapshot).{" "}
              </>
            ) : null}
            <strong>RSVP lead</strong>: median before kickoff (late saves excluded).{" "}
            <strong>Stats lag</strong>: median after kickoff, played matches. Hover cells for detail.
          </p>

          <div className="team-stats-table-wrap">
            <table className="team-stats-table team-stats-compliance-table">
              <thead>
                <tr>
                  {COMPLIANCE_SORT.map((col) => (
                    <th key={col.key}>
                      <button
                        type="button"
                        className={`th-sort ${complianceSortKey === col.key ? "active" : ""}`}
                        onClick={() => setComplianceSortKey(col.key)}
                      >
                        {col.label}
                      </button>
                    </th>
                  ))}
                  <th title="Attendance rows (any save timestamp)">RSVP n</th>
                  <th title="Played matches with stats row">Stats n</th>
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
                    <td>
                      <span
                        title={
                          r.attendanceMedianDaysBefore != null
                            ? formatMedianDaysBefore(r.attendanceMedianDaysBefore)
                            : r.attendanceLateCount === r.attendanceCount && r.attendanceCount > 0
                              ? "All saves were after kickoff"
                              : "No on-time saves yet"
                        }
                      >
                        {r.attendanceMedianDaysBefore != null
                          ? formatMedianDaysBeforeShort(r.attendanceMedianDaysBefore)
                          : r.attendanceLateCount === r.attendanceCount && r.attendanceCount > 0
                            ? "All late"
                            : "—"}
                      </span>
                    </td>
                    <td>{r.attendanceLateCount}</td>
                    <td>
                      <span
                        title={
                          r.statsMedianHoursAfter != null
                            ? formatMedianHoursAfter(r.statsMedianHoursAfter)
                            : "No stats saved after played matches"
                        }
                      >
                        {formatMedianHoursAfterShort(r.statsMedianHoursAfter)}
                      </span>
                    </td>
                    <td>{r.attendanceCount}</td>
                    <td>{r.statsCount}</td>
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
