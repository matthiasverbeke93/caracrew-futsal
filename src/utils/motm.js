import { isSeasonVotingLocked } from "../seasons.js";

/** Kickoff times in `games` are Brussels wall-clock; resolve them there, not in the runtime's zone. */
const GAME_TIME_ZONE = "Europe/Brussels";

let zoneFormatter = null;

/** Offset (ms) of GAME_TIME_ZONE from UTC at instant `ms`. */
function zoneOffsetMs(ms) {
  zoneFormatter ??= new Intl.DateTimeFormat("en-GB", {
    timeZone: GAME_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = Object.fromEntries(zoneFormatter.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/**
 * The instant a Brussels wall-clock time happens. Same answer as `new Date("…T21:00")` in a Brussels
 * browser, but also right on a UTC CI runner (the weekly digest), which used to shift every window.
 */
function brusselsWallClockToDate(y, mo, d, h, mi, s) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let ms = guess - zoneOffsetMs(guess);
  const corrected = guess - zoneOffsetMs(ms); // second pass settles a guess that crossed a DST change
  if (corrected !== ms) ms = corrected;
  return new Date(ms);
}

function parseGameStart(game) {
  const date = game.game_date;
  if (!date) return null;
  const dm = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date));
  if (!dm) return null;
  const tm = /^(\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(game.game_time || ""));
  const [h, mi, s] = tm ? [+tm[1], +tm[2], +(tm[3] || 0)] : [21, 0, 0];
  const start = brusselsWallClockToDate(+dm[1], +dm[2], +dm[3], h, mi, s);
  return Number.isNaN(start.getTime()) ? null : start;
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


/**
 * Who can be nominated for player of the match.
 *
 * Two filters, both deliberate:
 * - **Roster only.** Guests (`guest` / `ad_hoc_guest`) never appear on the ballot,
 *   whether or not they turned up — MotM is a club award.
 * - **RSVP'd "In".** Only players who actually answered `playing` for this fixture.
 *   `if_needed` and `cant` are not "playing", and a blank RSVP means we have no
 *   evidence they were there, so the ballot stays the size of the squad that showed up
 *   instead of the whole roster.
 *
 * Name lookups for existing votes must NOT go through here — an old vote may point at
 * someone who no longer qualifies, and it still needs a name.
 */
export function getMotmCandidates(allGamePlayers, gameAttendance) {
  const playingIds = new Set(
    (gameAttendance || []).filter((a) => a.status === "playing").map((a) => a.player_id)
  );
  return (allGamePlayers || []).filter((p) => p.type === "fixed" && playingIds.has(p.id));
}
