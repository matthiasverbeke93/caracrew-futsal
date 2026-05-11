import { useMemo, useState } from "react";
import { getStaticTeamStatsForSeason } from "../data/seasonTeamStatsOverrides";
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

  const staticData = useMemo(
    () => getStaticTeamStatsForSeason(seasonSlug),
    [seasonSlug]
  );

  const rows = useMemo(() => {
    const built = staticData
      ? buildStaticTeamSeasonRows(staticData, players)
      : buildTeamSeasonPlayerRows(games, players, attendance, stats);
    return sortTeamSeasonRows(built, sortKey);
  }, [attendance, games, players, sortKey, staticData, stats]);

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
    </section>
  );
}
