/**
 * Who played a fixture and still owes their goals/assists.
 *
 * A roster player owes stats when they were In and have **no usable `player_stats` row**.
 * A row with `played === false` does not count as done: the player was In, so "did not
 * play" contradicts the attendance — usually the Played box unticked by mistake (Cédric,
 * ZVC Tigers 2026-11-05). Chasing them is the cheap way to get it corrected; if they really
 * sat out, the fix is to set their RSVP to Out.
 */
export function hasRecordedStats(row) {
  return !!row && row.played !== false;
}

export function playersOwingStats(roster, gameAttendance, gameStats) {
  const playedRoster = (roster || []).filter((p) =>
    (gameAttendance || []).some((a) => a.player_id === p.id && a.status === "playing")
  );
  const owing = playedRoster.filter(
    (p) => !hasRecordedStats((gameStats || []).find((row) => row.player_id === p.id))
  );
  return { playedRoster, owing };
}
