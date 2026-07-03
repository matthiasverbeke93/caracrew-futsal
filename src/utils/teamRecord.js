import { isPlayed } from "./game.js";

// LZV Cup uses 3 points for a win, 1 for a draw. Kept as named constants so the
// record + projected league table stay in sync if the scoring ever changes.
export const POINTS_WIN = 3;
export const POINTS_DRAW = 1;

/**
 * Caracrew's season record, from played fixtures with a final score set.
 * `home_score` is always our goals, `away_score` the opponent's (see games_final_score.sql).
 * `results` is chronological (oldest → newest) for a form/timeline strip.
 */
export function computeTeamRecord(games) {
  let played = 0;
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let gf = 0;
  let ga = 0;
  let unscored = 0;
  const results = [];

  for (const g of games || []) {
    if (!isPlayed(g)) continue;
    const us = g.home_score;
    const them = g.away_score;
    if (us == null || them == null) {
      unscored += 1;
      continue;
    }
    played += 1;
    gf += us;
    ga += them;
    let result = "D";
    if (us > them) {
      wins += 1;
      result = "W";
    } else if (us < them) {
      losses += 1;
      result = "L";
    } else {
      draws += 1;
    }
    results.push({ id: g.id, date: g.game_date, opponent: g.opponent, us, them, result });
  }

  results.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const points = wins * POINTS_WIN + draws * POINTS_DRAW;

  return {
    played,
    wins,
    draws,
    losses,
    gf,
    ga,
    gd: gf - ga,
    points,
    pointsPerGame: played > 0 ? points / played : 0,
    winPct: played > 0 ? (wins / played) * 100 : 0,
    unscored,
    results,
  };
}

/**
 * Projected league table: the LZV opponent snapshot (points/match per team) with
 * Caracrew inserted at our own computed points/match, ranked together. Opponent
 * figures are the latest palmares snapshot; our row is computed from our results —
 * label it as such in the UI. Teams without a points/match value sort to the bottom.
 */
export function buildLeagueTable(opponentStrengths, record, teamName) {
  const rows = (opponentStrengths || [])
    .filter((o) => o && o.name)
    .map((o) => ({
      team: o.name,
      teamId: o.team_id ?? null,
      ptnPerMatch:
        o.current_ptn_per_match != null ? Number(o.current_ptn_per_match) : null,
      snapshotPosition: o.current_position ?? null,
      isUs: false,
    }));

  const us = {
    team: teamName,
    teamId: null,
    ptnPerMatch: record.played > 0 ? Math.round(record.pointsPerGame * 100) / 100 : null,
    snapshotPosition: null,
    isUs: true,
  };

  const all = [...rows, us];
  all.sort((a, b) => {
    const pa = a.ptnPerMatch == null ? -1 : a.ptnPerMatch;
    const pb = b.ptnPerMatch == null ? -1 : b.ptnPerMatch;
    if (pb !== pa) return pb - pa;
    return a.team.localeCompare(b.team);
  });

  return all.map((r, i) => ({ ...r, rank: i + 1 }));
}
