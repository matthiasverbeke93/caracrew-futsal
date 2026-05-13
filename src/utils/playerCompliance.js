import { isPlayed } from "./game.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** RSVP counts as on time if last save is at least this many days before kickoff */
export const RSVP_ON_TIME_DAYS_BEFORE = 7;
/** Stats count as on time if last save is within this many days after kickoff (window starts at kickoff) */
export const STATS_ON_TIME_DAYS_AFTER = 3;
/** If a player has 0 goals and 0 assists, stats count as on time once this many days after kickoff (no need to chase empty rows). */
export const STATS_ZERO_GA_GRACE_DAYS_AFTER = 7;

/** @returns {number | null} epoch ms at kickoff (local interpretation of date + time) */
export function getGameKickoffMs(game) {
  if (!game?.game_date) return null;
  const t = game.game_time ? String(game.game_time).trim() : "";
  let timePart = "12:00:00";
  if (t) {
    if (t.length <= 5 && t.includes(":")) timePart = `${t}:00`;
    else timePart = t;
  }
  const iso = `${game.game_date}T${timePart}`;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Per-player compliance for the season: RSVP on-time %, stats on-time %, overall stars (0–5).
 *
 * Only fixtures where `player_stats.played` is true (Stats tab checkbox) count toward both percentages.
 * RSVP on time: share of those games where attendance was last saved ≥7 full days before kickoff.
 * Stats on time: share of those games where stats were entered on time — either the row was saved
 * between kickoff and kickoff+3d, or they have 0 goals and 0 assists and kickoff was at least
 * STATS_ZERO_GA_GRACE_DAYS_AFTER full days before the evaluation time (`asOfMs`, default now).
 * Stars: average of RSVP on-time % and stats on-time % (same game set for both).
 */
export function computePersonalComplianceScores(games, attendance, stats, playerId, asOfMs = Date.now()) {
  if (!playerId) return null;

  let rsvpInTime = 0;
  let rsvpDenom = 0;
  let statsInTime = 0;
  let statsDenom = 0;

  for (const g of games || []) {
    const kick = getGameKickoffMs(g);
    if (kick == null) continue;
    if (!isPlayed(g)) continue;

    const st = stats.find((s) => s.game_id === g.id && s.player_id === playerId);
    if (!st || st.played === false) continue;

    rsvpDenom += 1;
    const att = attendance.find((a) => a.game_id === g.id && a.player_id === playerId);
    if (att?.updated_at && rsvpSavedAtLeastDaysBeforeKickoff(kick, att.updated_at, RSVP_ON_TIME_DAYS_BEFORE)) {
      rsvpInTime += 1;
    }

    statsDenom += 1;
    if (isStatsRowCompliantOnTime(kick, st, asOfMs)) {
      statsInTime += 1;
    }
  }

  const rsvpOnTimePct = rsvpDenom > 0 ? Math.round((100 * rsvpInTime) / rsvpDenom) : null;
  const statsOnTimePct = statsDenom > 0 ? Math.round((100 * statsInTime) / statsDenom) : null;

  let complianceStars = 0;
  if (rsvpDenom > 0 && rsvpOnTimePct != null && statsOnTimePct != null) {
    const avg = (rsvpOnTimePct + statsOnTimePct) / 2;
    complianceStars = Math.max(0, Math.min(5, Math.round((5 * avg) / 100)));
  }

  return {
    rsvpOnTimePct,
    statsOnTimePct,
    rsvpInTimeGames: rsvpInTime,
    rsvpGamesDenom: rsvpDenom,
    statsInTimeGames: statsInTime,
    statsGamesDenom: statsDenom,
    complianceStars,
  };
}

function rsvpSavedAtLeastDaysBeforeKickoff(kickMs, updatedAtIso, days) {
  const at = new Date(updatedAtIso).getTime();
  if (Number.isNaN(at)) return false;
  return kickMs - at >= days * MS_PER_DAY;
}

function statsSavedWithinDaysAfterKickoff(kickMs, updatedAtIso, days) {
  const at = new Date(updatedAtIso).getTime();
  if (Number.isNaN(at)) return false;
  const delta = at - kickMs;
  return delta >= 0 && delta <= days * MS_PER_DAY;
}

/** Stats “on time” for compliance: in-window save after kickoff, or empty G/A once grace period after kickoff has passed. */
function isStatsRowCompliantOnTime(kickMs, st, asOfMs) {
  const goals = Number(st?.goals) || 0;
  const assists = Number(st?.assists) || 0;
  const noInvolvement = goals === 0 && assists === 0;

  if (noInvolvement && asOfMs >= kickMs + STATS_ZERO_GA_GRACE_DAYS_AFTER * MS_PER_DAY) {
    return true;
  }

  return !!(st?.updated_at && statsSavedWithinDaysAfterKickoff(kickMs, st.updated_at, STATS_ON_TIME_DAYS_AFTER));
}

/** Visual 0–5 star rating (filled ★ + empty ☆). */
export function formatComplianceStars(filled0to5) {
  const n = Math.max(0, Math.min(5, Math.round(Number(filled0to5) || 0)));
  return "★".repeat(n) + "☆".repeat(5 - n);
}

/**
 * Compliance scores for every active (non-archived) player — team table on season overview.
 */
export function computeComplianceForAllPlayers(games, attendance, stats, players, asOfMs = Date.now()) {
  const active = (players || []).filter((p) => !p.archived);
  return active
    .map((p) => {
      const c = computePersonalComplianceScores(games, attendance, stats, p.id, asOfMs);
      return {
        id: p.id,
        name: p.name,
        fixed: p.fixed,
        ...c,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
