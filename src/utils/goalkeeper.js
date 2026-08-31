/**
 * "Do we have a goalie for this match?"
 *
 * Being a goalkeeper is a property of the *player* (`players.is_goalkeeper`, set in
 * the admin panel), so the per-game answer is the intersection of that flag with
 * the fixture's attendance: a keeper only counts once they are actually **In**.
 *
 * `players` are the game's players as the UI already has them (roster + guests,
 * each with `isGoalkeeper`); `statusOf(player)` returns that player's stored
 * attendance status for the fixture, or null.
 *
 * `keptGoalOf(player)` is the *post-game* answer and a different question: who
 * actually went in goal on the night, which is regularly somebody who is not a
 * keeper on the roster at all. It therefore ignores the flag and the RSVP, and
 * once it is set it is the authoritative answer for that fixture.
 */
export function getGoalkeeperSummary(players, statusOf, keptGoalOf = null) {
  const keepers = (players || []).filter((p) => p?.isGoalkeeper);
  const playing = [];
  const ifNeeded = [];
  const out = [];
  const noReply = [];

  for (const keeper of keepers) {
    const status = statusOf?.(keeper) ?? null;
    if (status === "playing") playing.push(keeper);
    else if (status === "if_needed") ifNeeded.push(keeper);
    else if (status === "cant") out.push(keeper);
    else noReply.push(keeper);
  }

  const recorded = keptGoalOf
    ? (players || []).filter((p) => keptGoalOf(p))
    : [];

  return {
    /** No keeper on the roster at all — nothing to report, not a warning. */
    anyKeeperKnown: keepers.length > 0,
    /** Who is on record as having kept goal in this fixture (flag-independent). */
    recorded,
    hasRecordedKeeper: recorded.length > 0,
    hasKeeper: playing.length > 0,
    /** A keeper on standby is not a keeper yet, but it is worth saying. */
    hasStandbyKeeper: ifNeeded.length > 0,
    playing,
    ifNeeded,
    out,
    noReply,
  };
}

/** Comma-joined first-plus-last names, for a one-line summary. */
export function goalkeeperNames(keepers) {
  return (keepers || []).map((k) => k.name).join(", ");
}
