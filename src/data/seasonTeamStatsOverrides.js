/** Manual per-player season totals, used when Supabase doesn't have full attendance/stats yet.
 *
 * - Keyed by `seasonSlug`.
 * - Names are matched (case-insensitive) against `players.name` to resolve `id` for the link.
 * - `totalGamesPlayed` is the denominator for the "% played" column (full season schedule,
 *   e.g. 22 in LZV 5e Klasse Mechelen). Defaults to the max `gamesPlayed` in the list when
 *   not provided.
 *
 * Remove the season entry once Supabase has authoritative attendance + player_stats for it.
 */
export const SEASON_TEAM_STATS_OVERRIDES = {
  "2526": {
    totalGamesPlayed: 22,
    rows: [
      { name: "Evert Van Trappen", fairplayRank: 1, gamesPlayed: 13, goals: 0, assists: 0 },
      { name: "Cédric Vaessen", fairplayRank: 2, gamesPlayed: 14, goals: 9, assists: 7 },
      { name: "Koen Heeren", fairplayRank: 3, gamesPlayed: 9, goals: 0, assists: 1 },
      { name: "Matthias Verbeke", fairplayRank: 4, gamesPlayed: 21, goals: 14, assists: 6 },
      { name: "Sander Bortier", fairplayRank: 5, gamesPlayed: 15, goals: 5, assists: 6 },
      { name: "Laurens Van Steenbergen", fairplayRank: 6, gamesPlayed: 14, goals: 6, assists: 7 },
      { name: "Steven Vits", fairplayRank: 7, gamesPlayed: 17, goals: 7, assists: 15 },
      { name: "Stef Claes", fairplayRank: 8, gamesPlayed: 12, goals: 4, assists: 3 },
      { name: "Lennart Drossaert", gamesPlayed: 2, goals: 0, assists: 1 },
      { name: "David Goossens", gamesPlayed: 3, goals: 0, assists: 0 },
      { name: "Jelle Vandenbrande", gamesPlayed: 1, goals: 1, assists: 0 },
      { name: "Moises Godeau", gamesPlayed: 5, goals: 8, assists: 1 },
      { name: "Bart Moyens", gamesPlayed: 3, goals: 5, assists: 0 },
      { name: "Toon Verhelst", gamesPlayed: 1, goals: 1, assists: 2 },
      { name: "Toon Michiels", gamesPlayed: 1, goals: 0, assists: 0 },
      { name: "Donald Voortmans", gamesPlayed: 1, goals: 0, assists: 0 },
      { name: "Caen Vemba Bunga", gamesPlayed: 1, goals: 3, assists: 0 },
      { name: "Julien Tanghe", gamesPlayed: 1, goals: 1, assists: 0 },
      { name: "Jonas Ameloot", gamesPlayed: 1, goals: 1, assists: 2 },
      { name: "Yannick Drossaert", gamesPlayed: 2, goals: 0, assists: 0 },
    ],
  },
};

export function getStaticTeamStatsForSeason(seasonSlug) {
  return SEASON_TEAM_STATS_OVERRIDES[seasonSlug] ?? null;
}
