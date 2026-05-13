import { isPlayed } from "./game.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** RSVP counts as on time if last save is at least this many days before kickoff */
export const RSVP_ON_TIME_DAYS_BEFORE = 7;
/** Stats count as on time if last save is within this many days after kickoff (window starts at kickoff) */
export const STATS_ON_TIME_DAYS_AFTER = 3;

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
 * RSVP on time: share of scheduled games where attendance was last saved ≥7 full days before kickoff.
 * Stats on time: share of **played** games where player_stats was last saved between kickoff and kickoff+3d.
 * Stars: average of the two percentages (when both apply); if no played games yet, only RSVP % drives stars.
 */
export function computePersonalComplianceScores(games, attendance, stats, playerId) {
  if (!playerId) return null;

  let rsvpInTime = 0;
  let rsvpDenom = 0;
  let statsInTime = 0;
  let statsDenom = 0;

  for (const g of games || []) {
    const kick = getGameKickoffMs(g);
    if (kick == null) continue;

    rsvpDenom += 1;
    const att = attendance.find((a) => a.game_id === g.id && a.player_id === playerId);
    if (att?.updated_at && rsvpSavedAtLeastDaysBeforeKickoff(kick, att.updated_at, RSVP_ON_TIME_DAYS_BEFORE)) {
      rsvpInTime += 1;
    }

    if (isPlayed(g)) {
      statsDenom += 1;
      const st = stats.find((s) => s.game_id === g.id && s.player_id === playerId);
      if (st?.updated_at && statsSavedWithinDaysAfterKickoff(kick, st.updated_at, STATS_ON_TIME_DAYS_AFTER)) {
        statsInTime += 1;
      }
    }
  }

  const rsvpOnTimePct = rsvpDenom > 0 ? Math.round((100 * rsvpInTime) / rsvpDenom) : null;
  const statsOnTimePct = statsDenom > 0 ? Math.round((100 * statsInTime) / statsDenom) : null;

  let complianceStars = 0;
  if (rsvpDenom > 0) {
    if (statsDenom > 0) {
      const avg = (rsvpOnTimePct + statsOnTimePct) / 2;
      complianceStars = Math.max(0, Math.min(5, Math.round((5 * avg) / 100)));
    } else {
      complianceStars = Math.max(0, Math.min(5, Math.round((5 * rsvpOnTimePct) / 100)));
    }
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

/** Visual 0–5 star rating (filled ★ + empty ☆). */
export function formatComplianceStars(filled0to5) {
  const n = Math.max(0, Math.min(5, Math.round(Number(filled0to5) || 0)));
  return "★".repeat(n) + "☆".repeat(5 - n);
}

/**
 * Compliance scores for every active (non-archived) player — team table on season overview.
 */
export function computeComplianceForAllPlayers(games, attendance, stats, players) {
  const active = (players || []).filter((p) => !p.archived);
  return active
    .map((p) => {
      const c = computePersonalComplianceScores(games, attendance, stats, p.id);
      return {
        id: p.id,
        name: p.name,
        fixed: p.fixed,
        ...c,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
