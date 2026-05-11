/** Manual per-player season totals, used when Supabase doesn't have full attendance/stats yet.
 *
 * - Keyed by `seasonSlug`.
 * - Names are matched (case-insensitive) against `players.name` to resolve `id` for the link.
 * - `totalGamesPlayed` is the denominator for the "% played" column. Default = max `gamesPlayed`
 *   in the list (i.e. games the team has actually played so far).
 *
 * Remove the season entry once Supabase has authoritative attendance + player_stats for it.
 */
export const SEASON_TEAM_STATS_OVERRIDES = {
  "2526": {
    totalGamesPlayed: 20,
    rows: [
      { name: "Matthias Verbeke", gamesPlayed: 20, goals: 14, assists: 5 },
      { name: "Steven Vits", gamesPlayed: 16, goals: 7, assists: 15 },
      { name: "Sander Bortier", gamesPlayed: 15, goals: 5, assists: 6 },
      { name: "Cédric Vaessen", gamesPlayed: 13, goals: 9, assists: 7 },
      { name: "Laurens Van Steenbergen", gamesPlayed: 13, goals: 6, assists: 7 },
      { name: "Evert Van Trappen", gamesPlayed: 12, goals: 0, assists: 0 },
      { name: "Stef Claes", gamesPlayed: 12, goals: 4, assists: 3 },
      { name: "Koen Heeren", gamesPlayed: 9, goals: 0, assists: 1 },
      { name: "Moises Godeau", gamesPlayed: 4, goals: 7, assists: 1 },
      { name: "Bart Moyens", gamesPlayed: 3, goals: 5, assists: 0 },
      { name: "Lennart Drossaert", gamesPlayed: 2, goals: 0, assists: 1 },
      { name: "David Goossens", gamesPlayed: 2, goals: 0, assists: 0 },
      { name: "Yannick Drossaert", gamesPlayed: 2, goals: 0, assists: 0 },
    ],
  },
};

export function getStaticTeamStatsForSeason(seasonSlug) {
  return SEASON_TEAM_STATS_OVERRIDES[seasonSlug] ?? null;
}
