import { TEAM_NAME } from "../constants.js";
import { cleanOpponentName } from "./opponent.js";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Normalise DB `game_date` (date-only, ISO datetime string, or Date) to `YYYY-MM-DD`.
 */
export function normalizeGameDateOnly(gameOrRawDate) {
  const raw =
    gameOrRawDate && typeof gameOrRawDate === "object" && "game_date" in gameOrRawDate
      ? gameOrRawDate.game_date
      : gameOrRawDate;
  if (raw == null || raw === "") return null;
  if (typeof raw === "object" && raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw.toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  const isoDay = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (isoDay) return isoDay[1];
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export function formatMatchDayTime(game) {
  const dateOnly = normalizeGameDateOnly(game);
  if (!dateOnly) return "";
  const d = new Date(`${dateOnly}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  const day = DAYS[d.getDay()];
  const time = game.game_time ? String(game.game_time).slice(0, 5) : "";
  return time ? `${day} ${time}` : day;
}

/** Calendar date + kick-off (for compact cards). */
export function formatMatchCalendarDateTime(game) {
  const dateOnly = normalizeGameDateOnly(game);
  if (!dateOnly) return "";
  let d = new Date(`${dateOnly}T12:00:00`);
  if (Number.isNaN(d.getTime())) {
    d = new Date(`${dateOnly}T00:00:00Z`);
  }
  if (Number.isNaN(d.getTime())) return dateOnly;
  const datePart = d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const time = game?.game_time ? String(game.game_time).slice(0, 5) : "";
  return time ? `${datePart} · ${time}` : datePart;
}

/** One line for dashboard tiles: date/time · venue. */
export function formatFixtureTileLine(game) {
  const formatted = formatMatchCalendarDateTime(game);
  const core =
    formatted ||
    normalizeGameDateOnly(game) ||
    (game?.game_date ? String(game.game_date).trim().slice(0, 16) : "");
  const loc = game?.location?.trim();
  const venue = loc || "Venue TBD";
  return core ? `${core} · ${venue}` : venue;
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

/**
 * Full current URL with `game` set — keeps `season` and other query params (unlike {@link buildShareGameUrl}).
 */
export function buildCurrentPageGameShareUrl(gameId) {
  if (typeof window === "undefined") return buildShareGameUrl(gameId);
  const url = new URL(window.location.href);
  url.searchParams.set("game", gameId);
  return url.toString();
}

/**
 * Prefilled WhatsApp (app or web) — works on macOS where the system Share sheet often omits WhatsApp.
 */
export function buildGameWhatsAppShareUrl(game) {
  const shareUrl = buildCurrentPageGameShareUrl(game.id);
  const opp = cleanOpponentName(game.opponent);
  const meta = `${game.game_date} · ${game.game_time || ""} · ${game.location || ""}`.trim();
  const message = `${TEAM_NAME} vs ${opp}\n${meta}\n${shareUrl}`;
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function buildWhatsAppNudgeUrl(game, missingNames) {
  const shareUrl = buildShareGameUrl(game.id);
  const list = missingNames.join(", ");
  const line = `Yo, still no answer for ${formatMatchDayTime(game)} vs ${cleanOpponentName(game.opponent)}: ${list} — confirm here: ${shareUrl}`;
  return `https://wa.me/?text=${encodeURIComponent(line)}`;
}
