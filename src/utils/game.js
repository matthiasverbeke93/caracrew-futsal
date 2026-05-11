export function isPlayed(game) {
  const today = new Date().toISOString().slice(0, 10);
  return game.game_date < today;
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
