import { isPlayed } from "./game";

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

function median(nums) {
  if (!nums?.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Personal RSVP / stats timing for one player in the current season dataset.
 * Attendance: days before kickoff when status was last saved (negative = after kickoff).
 * Stats: hours after kickoff when goals/assists row was last saved (played matches only).
 */
export function computePersonalCompliance(games, attendance, stats, playerId) {
  if (!playerId) return null;

  const gameById = new Map((games || []).map((g) => [g.id, g]));

  const attendanceSamples = [];
  for (const row of attendance) {
    if (row.player_id !== playerId) continue;
    const g = gameById.get(row.game_id);
    if (!g || !row.updated_at) continue;
    const kick = getGameKickoffMs(g);
    if (kick == null) continue;
    const at = new Date(row.updated_at).getTime();
    const daysBefore = (kick - at) / (24 * 60 * 60 * 1000);
    attendanceSamples.push({ daysBefore, late: daysBefore < 0 });
  }

  const advanceSamples = attendanceSamples.filter((s) => !s.late).map((s) => s.daysBefore);
  const lateAttendanceCount = attendanceSamples.filter((s) => s.late).length;

  const statsSamples = [];
  for (const row of stats) {
    if (row.player_id !== playerId) continue;
    const g = gameById.get(row.game_id);
    if (!g || !row.updated_at) continue;
    if (!isPlayed(g)) continue;
    const kick = getGameKickoffMs(g);
    if (kick == null) continue;
    const at = new Date(row.updated_at).getTime();
    const hoursAfter = (at - kick) / (60 * 60 * 1000);
    statsSamples.push(hoursAfter);
  }

  return {
    attendanceCount: attendanceSamples.length,
    attendanceMedianDaysBefore: median(advanceSamples),
    attendanceLateCount: lateAttendanceCount,
    statsCount: statsSamples.length,
    statsMedianHoursAfter: median(statsSamples),
  };
}

export function formatMedianDaysBefore(days) {
  if (days == null || Number.isNaN(days)) return "—";
  if (days < 1 / 24) return "< 1 h before kickoff";
  if (days < 1) return `${Math.round(days * 24)} h before kickoff`;
  return `${days >= 10 ? Math.round(days) : days.toFixed(1)} days before kickoff`;
}

export function formatMedianHoursAfter(hours) {
  if (hours == null || Number.isNaN(hours)) return "—";
  if (hours < 1) return `${Math.round(hours * 60)} min after kickoff`;
  if (hours < 48) return `${hours >= 10 ? Math.round(hours) : hours.toFixed(1)} h after kickoff`;
  const d = hours / 24;
  return `${d >= 10 ? Math.round(d) : d.toFixed(1)} days after kickoff`;
}
