import { isPlayed } from "./game.js";

/** Returns the last `n` played games' outcomes from Caracrew's perspective.
 * Each entry is { result: 'W' | 'D' | 'L' | '?', game }, most recent first.
 * '?' means the final score wasn't set yet.
 */
export function getRecentForm(games, n = 5) {
  if (!games?.length) return [];
  const played = games
    .filter((g) => isPlayed(g))
    .sort((a, b) => (b.game_date || "").localeCompare(a.game_date || ""));
  return played.slice(0, n).map((game) => {
    const us = game.home_score;
    const them = game.away_score;
    let result = "?";
    if (us != null && them != null) {
      if (us > them) result = "W";
      else if (us < them) result = "L";
      else result = "D";
    }
    return { result, game };
  });
}
