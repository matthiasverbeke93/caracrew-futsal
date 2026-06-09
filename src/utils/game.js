import { isSeasonAttendanceLocked } from "../seasons.js";

export const STATS_FREEZE_DAYS = 10;

function localToday() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function isPlayed(game) {
  return game.game_date < localToday();
}

/** Compare kick-off: calendar date then time (strings sort OK for ISO dates / HH:MM:SS). */
function compareByKickoff(a, b) {
  const da = a.game_date || "";
  const db = b.game_date || "";
  if (da !== db) return da.localeCompare(db);
  return String(a.game_time || "").localeCompare(String(b.game_time || ""));
}

/**
 * Next upcoming fixtures in strict calendar order (date, then time).
 * Does not depend on attendance / RSVP — only not-yet-played by date.
 */
export function nextUpcomingGamesByCalendar(allGames, limit = 3) {
  if (!allGames?.length) return [];
  return [...allGames]
    .filter((g) => !isPlayed(g))
    .sort(compareByKickoff)
    .slice(0, limit);
}

/** @deprecated Use {@link nextUpcomingGamesByCalendar} — same behaviour, clearer name. */
export function upcomingGamesForAttendance(allGames, limit = 3) {
  return nextUpcomingGamesByCalendar(allGames, limit);
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
  if (game.game_date > localToday()) return false;
  return !isStatsFrozen(game, nowMs);
}

/** Upcoming or today by calendar — ignores preview-season locks (see {@link isAttendanceEditable}). */
export function isAttendanceEditableByCalendar(game) {
  if (!game?.game_date) return false;
  return game.game_date >= localToday();
}

/** Only the next fixtures are open for RSVP; later future games stay visible but locked. */
export function isAttendanceInUpcomingWindow(game, allGames, limit = 3) {
  if (!game?.id || !allGames?.length) return false;
  return nextUpcomingGamesByCalendar(allGames, limit).some((g) => g.id === game.id);
}

/** Attendance locks to the next 3 upcoming games. Preview seasons are read-only. */
export function isAttendanceEditable(game, allGames = null) {
  if (!game?.game_date) return false;
  if (isSeasonAttendanceLocked(game.season_slug)) return false;
  if (!isAttendanceEditableByCalendar(game)) return false;
  return allGames ? isAttendanceInUpcomingWindow(game, allGames, 3) : true;
}

/** Days remaining before stats freeze; null if not played yet or already frozen. */
export function getStatsLockDaysLeft(game, nowMs = Date.now()) {
  if (!game?.game_date) return null;
  if (game.game_date > localToday()) return null;
  const gameMs = new Date(`${game.game_date}T00:00:00`).getTime();
  if (Number.isNaN(gameMs)) return null;
  const days = Math.floor((nowMs - gameMs) / (24 * 60 * 60 * 1000));
  const left = STATS_FREEZE_DAYS - days;
  return left > 0 ? left : null;
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
