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

/**
 * One entry per played fixture (chronological), splitting who turned out:
 * `roster` = roster players marked Played on the Stats tab (`player_stats.played`),
 * `guests` = ad-hoc guests marked playing for that game (`guest_players.status`).
 * Games with no data yet count as 0. `players` is the combined total.
 */
export function buildPlayersPerGameSeries(games, stats, guestPlayers) {
  const rosterByGame = new Map();
  for (const s of stats || []) {
    if (s.played === false) continue;
    rosterByGame.set(s.game_id, (rosterByGame.get(s.game_id) || 0) + 1);
  }
  const guestByGame = new Map();
  for (const g of guestPlayers || []) {
    if (g.status !== "playing") continue;
    guestByGame.set(g.game_id, (guestByGame.get(g.game_id) || 0) + 1);
  }
  return (games || [])
    .filter((g) => isPlayed(g))
    .slice()
    .sort((a, b) => String(a.game_date).localeCompare(String(b.game_date)))
    .map((g) => {
      const roster = rosterByGame.get(g.id) || 0;
      const guests = guestByGame.get(g.id) || 0;
      return {
        id: g.id,
        date: g.game_date,
        opponent: g.opponent,
        roster,
        guests,
        players: roster + guests,
      };
    });
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
