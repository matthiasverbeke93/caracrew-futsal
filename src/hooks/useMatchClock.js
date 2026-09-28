import { useEffect, useState } from "react";
import { getMotmVotingStart } from "../utils/motm";

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

/**
 * Has the match kicked off? Clock-based, unlike `isPlayed()` which is day-granular
 * (`game_date < today`) and so stays false until midnight after an evening kickoff.
 * Derived from the MOTM window (which opens at kickoff + 2h) so both read the same
 * kickoff time, including its 21:00 default when `game_time` is missing.
 */
export function hasKickedOff(game, nowMs) {
  const votingStart = game ? getMotmVotingStart(game) : null;
  if (!votingStart) return false;
  return nowMs >= votingStart.getTime() - TWO_HOURS_MS;
}

/** Current time in ms, refreshed every `intervalMs` so clock-gated UI opens on its own. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
