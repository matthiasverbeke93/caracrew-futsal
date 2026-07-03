import { isPlayed } from "./game.js";

/**
 * Cumulative scoring race across played fixtures (date order) for the top `topN`
 * players. `metric` is "goals" (true Golden Boot) or "ga" (goals + assists).
 *
 * Returns:
 *   points  – [{ id, date, opponent }] one per played fixture, chronological
 *   players – [{ id, name, total, cumulative:number[] }] cumulative aligned to `points`
 *   metric  – echoed back
 * Each player's `cumulative` is monotonic non-decreasing and length === points.length.
 */
export function buildGoldenBootRace(games, stats, players, { topN = 5, metric = "goals" } = {}) {
  const nameById = new Map((players || []).map((p) => [p.id, p.name]));
  const valueOf = (s) =>
    metric === "ga" ? (s.goals || 0) + (s.assists || 0) : s.goals || 0;

  const playedGames = (games || [])
    .filter((g) => isPlayed(g))
    .slice()
    .sort((a, b) => String(a.game_date).localeCompare(String(b.game_date)));

  const statsByGame = new Map();
  for (const s of stats || []) {
    if (!statsByGame.has(s.game_id)) statsByGame.set(s.game_id, []);
    statsByGame.get(s.game_id).push(s);
  }

  const points = [];
  const running = new Map(); // player_id -> cumulative so far
  const cumById = new Map(); // player_id -> number[] aligned to points

  for (let i = 0; i < playedGames.length; i++) {
    const g = playedGames[i];
    points.push({ id: g.id, date: g.game_date, opponent: g.opponent });
    for (const s of statsByGame.get(g.id) || []) {
      running.set(s.player_id, (running.get(s.player_id) || 0) + valueOf(s));
    }
    for (const [pid, total] of running) {
      if (!cumById.has(pid)) cumById.set(pid, new Array(playedGames.length).fill(0));
      cumById.get(pid)[i] = total;
    }
  }

  const rankedPlayers = [...running.entries()]
    .map(([id, total]) => ({ id, name: nameById.get(id) || id, total, cumulative: cumById.get(id) }))
    .filter((p) => p.total > 0)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    .slice(0, topN);

  return { points, players: rankedPlayers, metric };
}
