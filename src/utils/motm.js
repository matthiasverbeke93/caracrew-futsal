import { isSeasonVotingLocked } from "../seasons.js";

function parseGameStart(game) {
  const date = game.game_date;
  if (!date) return null;
  let t = game.game_time ? String(game.game_time) : "21:00:00";
  if (t.length === 5) t += ":00";
  const d = new Date(`${date}T${t}`);
  return Number.isNaN(d.getTime()) ? new Date(`${date}T21:00:00`) : d;
}

/** Estimated full-time (kickoff + 2h). */
export function getMotmVotingStart(game) {
  const start = parseGameStart(game);
  if (!start) return null;
  return new Date(start.getTime() + 2 * 60 * 60 * 1000);
}

/** Voting stays open this many days after estimated full-time. */
export const MOTM_VOTING_DAYS = 5;

/** Voting closes MOTM_VOTING_DAYS days after estimated full-time. */
export function getMotmVotingEnd(game) {
  const openAt = getMotmVotingStart(game);
  if (!openAt) return null;
  return new Date(openAt.getTime() + MOTM_VOTING_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Voting runs from estimated full-time (kickoff + 2h) to MOTM_VOTING_DAYS days later.
 *
 * Deliberately NOT gated on `isPlayed()`. That helper is day-granular
 * (`game_date < today`), so it stayed false until midnight and swallowed the
 * start of every window: a 21:00 kickoff should open at 23:00 but stayed shut
 * for the last hour of match day, and the 26-27 calendar has 18:00-20:00 away
 * kickoffs that would have lost 2-4 hours each — the hours right after the
 * final whistle, when people actually vote. The `nowMs >= openAt` test already
 * implies the game has kicked off, so the extra gate only ever subtracted time.
 * Dropping it also makes `nowMs` honoured throughout, so the window is testable.
 */
export function isMotmVotingOpen(game, nowMs = Date.now()) {
  if (!game || isSeasonVotingLocked(game.season_slug)) return false;
  const openAt = getMotmVotingStart(game);
  const end = getMotmVotingEnd(game);
  if (!openAt || !end) return false;
  return nowMs >= openAt.getTime() && nowMs <= end.getTime();
}

/** Top vote-getters for a game (ties share first place). */
export function getMotmLeaderIds(gameId, votes) {
  const forGame = (votes || []).filter((v) => v.game_id === gameId);
  if (!forGame.length) return [];
  const counts = {};
  for (const v of forGame) {
    counts[v.nominee_id] = (counts[v.nominee_id] || 0) + 1;
  }
  let max = 0;
  for (const n of Object.values(counts)) {
    if (n > max) max = n;
  }
  return Object.entries(counts)
    .filter(([, n]) => n === max)
    .map(([id]) => id);
}

export function countPlayerMotmWins(playerId, games, votes, nowMs = Date.now()) {
  if (!playerId || !games?.length) return 0;
  let wins = 0;
  for (const game of games) {
    // No isPlayed() gate: `nowMs > end` (full-time + MOTM_VOTING_DAYS) already implies it
    // was played, and unlike isPlayed() it respects the injected clock. Note this also
    // means a MotM win only shows up once voting has closed — now 5 days after the
    // match rather than the next day.
    const end = getMotmVotingEnd(game);
    if (!end || nowMs <= end.getTime()) continue;
    const leaders = getMotmLeaderIds(game.id, votes);
    if (leaders.includes(playerId)) wins++;
  }
  return wins;
}

