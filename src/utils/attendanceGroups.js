import { attendanceLabel } from "../constants";

/**
 * Order the attendance tab renders its groups in. `null` = no RSVP on record,
 * which always sits last because it is the absence of a vote, not a vote.
 */
export const ATTENDANCE_GROUP_ORDER = ["playing", "if_needed", "cant", null];

/** Heading for one group; reuses the RSVP labels so the tab and the buttons agree. */
export function attendanceGroupLabel(status) {
  return status == null ? "No response" : attendanceLabel(status);
}

/**
 * Bucket players by their RSVP for the selected game.
 *
 * @param players    the game's player rows, already in display order
 * @param statusOf   (player) => stored status string, or null/undefined when unanswered
 * @returns non-empty groups in `ATTENDANCE_GROUP_ORDER`; player order inside a
 *          group is preserved from `players`.
 */
export function groupPlayersByAttendance(players, statusOf) {
  const buckets = new Map(ATTENDANCE_GROUP_ORDER.map((status) => [status, []]));

  for (const player of players) {
    const status = statusOf(player) ?? null;
    // A status the app doesn't know about still gets a bucket — better a stray
    // heading than a player quietly missing from the tab.
    if (!buckets.has(status)) buckets.set(status, []);
    buckets.get(status).push(player);
  }

  return [...buckets]
    .filter(([, group]) => group.length > 0)
    .map(([status, group]) => ({
      status,
      label: attendanceGroupLabel(status),
      players: group,
    }));
}

/**
 * True once at least one player has actually answered. Below that every player
 * lands in "No response" and the grouping is pure noise, so the tab stays flat.
 */
export function hasAnyAttendanceVote(groups) {
  return groups.some((group) => group.status != null);
}
