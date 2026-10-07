import { useEffect, useState } from "react";
import { hasKickedOff } from "../utils/game";

// Lives in utils/game.js now (the stats and RSVP windows use it); re-exported so
// existing component imports keep working.
export { hasKickedOff };

/** Current time in ms, refreshed every `intervalMs` so clock-gated UI opens on its own. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
