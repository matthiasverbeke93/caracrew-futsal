import { isSeasonVotingLocked } from "../seasons.js";
import { isPlayed } from "./game.js";

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

/** Voting closes 24h after estimated full-time. */
export function getMotmVotingEnd(game) {
  const openAt = getMotmVotingStart(game);
  if (!openAt) return null;
  return new Date(openAt.getTime() + 24 * 60 * 60 * 1000);
}

export function isMotmVotingOpen(game, nowMs = Date.now()) {
  if (!game || isSeasonVotingLocked(game.season_slug) || !isPlayed(game)) return false;
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
    if (!isPlayed(game)) continue;
    const end = getMotmVotingEnd(game);
    if (!end || nowMs <= end.getTime()) continue;
    const leaders = getMotmLeaderIds(game.id, votes);
    if (leaders.includes(playerId)) wins++;
  }
  return wins;
}

