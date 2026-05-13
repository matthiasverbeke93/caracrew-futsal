import { isPlayed } from "./game.js";

/**
 * Per calendar month (YYYY-MM): played games count + sum of goals/assists in those games.
 */
export function buildMonthlyTeamGaSeries(games, stats) {
  const map = new Map();
  for (const game of games || []) {
    if (!isPlayed(game)) continue;
    const ym = game.game_date.slice(0, 7);
    if (!map.has(ym)) {
      map.set(ym, { ym, label: formatMonthLabel(ym), goals: 0, assists: 0, gamesPlayed: 0 });
    }
    const row = map.get(ym);
    row.gamesPlayed += 1;
    for (const s of stats || []) {
      if (s.game_id !== game.id) continue;
      row.goals += s.goals || 0;
      row.assists += s.assists || 0;
    }
  }
  return [...map.values()].sort((a, b) => a.ym.localeCompare(b.ym));
}

function formatMonthLabel(ym) {
  if (!ym || ym.length < 7) return ym;
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleString("en-GB", { month: "short", year: "numeric" });
}

/** Season totals from played games only. */
export function seasonPlayedSummary(games, stats) {
  let playedGames = 0;
  let goals = 0;
  let assists = 0;
  for (const g of games || []) {
    if (!isPlayed(g)) continue;
    playedGames += 1;
    for (const s of stats || []) {
      if (s.game_id !== g.id) continue;
      goals += s.goals || 0;
      assists += s.assists || 0;
    }
  }
  const ga = goals + assists;
  return {
    playedGames,
    goals,
    assists,
    ga,
    gaPerPlayedGame: playedGames > 0 ? ga / playedGames : 0,
  };
}
