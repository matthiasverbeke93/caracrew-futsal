import { cleanOpponentName } from "./opponent";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function formatMatchDayTime(game) {
  if (!game?.game_date) return "";
  const d = new Date(`${game.game_date}T12:00:00`);
  const day = DAYS[d.getDay()];
  const time = game.game_time ? String(game.game_time).slice(0, 5) : "";
  return time ? `${day} ${time}` : day;
}

/** Short locale string for timestamps (admin lists, claim history). */
export function formatShortDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function buildShareGameUrl(gameId) {
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set("game", gameId);
  return url.toString();
}

export function buildWhatsAppNudgeUrl(game, missingNames) {
  const shareUrl = buildShareGameUrl(game.id);
  const list = missingNames.join(", ");
  const line = `Yo, still no answer for ${formatMatchDayTime(game)} vs ${cleanOpponentName(game.opponent)}: ${list} — confirm here: ${shareUrl}`;
  return `https://wa.me/?text=${encodeURIComponent(line)}`;
}
