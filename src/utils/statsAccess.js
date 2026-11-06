/**
 * Who may edit a player's stats row for one fixture (mirrors supabase/stats_teammates.sql).
 *
 * - "full": an admin, or the player themself — every field, including "Played".
 * - "teammate": the signed-in player was In for this fixture and so was the row's player.
 *   Goals, assists and keeper only; "Played" stays the owner's call. Added 2026-11-06 so a
 *   scorer who never opens the form doesn't leave the goals short.
 * - "none": everyone else.
 */
export function statsEditScope(playerId, { isAdmin = false, currentPlayerId = null, gameAttendance = [] } = {}) {
  if (isAdmin) return "full";
  if (!currentPlayerId) return "none";
  if (playerId === currentPlayerId) return "full";
  const wasIn = (id) =>
    (gameAttendance || []).some((a) => a.player_id === id && a.status === "playing");
  return wasIn(currentPlayerId) && wasIn(playerId) ? "teammate" : "none";
}

/** Can this scope write this field? */
export function canWriteStatField(scope, field) {
  if (scope === "full") return true;
  if (scope === "teammate") return field !== "played";
  return false;
}
