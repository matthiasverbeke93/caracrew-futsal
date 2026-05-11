export const STATS_FREEZE_DAYS = 10;

export function isPlayed(game) {
  const today = new Date().toISOString().slice(0, 10);
  return game.game_date < today;
}

function daysSinceGame(game, nowMs = Date.now()) {
  if (!game?.game_date) return null;
  const gameMs = new Date(`${game.game_date}T00:00:00`).getTime();
  if (Number.isNaN(gameMs)) return null;
  return Math.floor((nowMs - gameMs) / (24 * 60 * 60 * 1000));
}

export function isStatsFrozen(game, nowMs = Date.now()) {
  const days = daysSinceGame(game, nowMs);
  return typeof days === "number" && days > STATS_FREEZE_DAYS;
}

export function isStatsEditable(game, nowMs = Date.now()) {
  if (!game?.game_date) return false;
  const today = new Date().toISOString().slice(0, 10);
  if (game.game_date > today) return false;
  return !isStatsFrozen(game, nowMs);
}

export function readinessClass(count) {
  if (count <= 5) return "game-card danger";
  if (count === 6) return "game-card warning";
  return "game-card success";
}

export function playerStatusLabel(count) {
  if (count <= 5) return "Not enough players";
  if (count === 6) return "Just enough players";
  return "Just the right amount";
}
