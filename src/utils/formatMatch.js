import { TEAM_NAME } from "../constants.js";
import { DEFAULT_SEASON_SLUG } from "../seasons.js";
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

/**
 * `DD-MM-YY` for the compact calendar rows — day-first is how the team reads a
 * date, and dropping the century buys the width the opponent name needs. Pure
 * string work on the normalised `YYYY-MM-DD`, so no timezone can shift the day
 * (see the local-day-string rule in HANDOVER).
 */
export function formatMatchShortDate(gameOrRawDate) {
  const dateOnly = normalizeGameDateOnly(gameOrRawDate);
  if (!dateOnly) return "";
  const [yyyy, mm, dd] = dateOnly.split("-");
  return `${dd}-${mm}-${yyyy.slice(2)}`;
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

function resolveSeasonForShare(seasonSlug, searchParams) {
  if (seasonSlug != null && String(seasonSlug).trim() !== "") {
    return String(seasonSlug).trim();
  }
  return searchParams?.get("season") || DEFAULT_SEASON_SLUG;
}

/**
 * Deep-link to a fixture. Always sets `season` so `?game=` resolves after load (same slug as DB row).
 * Strips URL hash so shared links stay clean.
 */
export function buildCurrentPageGameShareUrl(gameId, seasonSlug) {
  if (typeof window === "undefined") {
    const season = resolveSeasonForShare(seasonSlug, null);
    return `?game=${encodeURIComponent(gameId)}&season=${encodeURIComponent(season)}`;
  }
  const url = new URL(window.location.href);
  url.hash = "";
  url.searchParams.set("game", gameId);
  url.searchParams.set("season", resolveSeasonForShare(seasonSlug, url.searchParams));
  return url.toString();
}

/**
 * Prefilled WhatsApp (app or web) — works on macOS where the system Share sheet often omits WhatsApp.
 */
export function buildGameWhatsAppShareUrl(game) {
  const shareUrl = buildCurrentPageGameShareUrl(game.id, game.season_slug);
  const opp = cleanOpponentName(game.opponent);
  const meta = `${game.game_date} · ${game.game_time || ""} · ${game.location || ""}`.trim();
  const message = `${TEAM_NAME} vs ${opp}\n${meta}\n${shareUrl}`;
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/** "Jan", "Jan and Piet", "Jan, Piet and Bram" — the nudge should read like a sentence, not a CSV. */
function formatNameList(names) {
  const clean = (names || []).map((n) => String(n ?? "").trim()).filter(Boolean);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean[0];
  return `${clean.slice(0, -1).join(", ")} and ${clean[clean.length - 1]}`;
}

/**
 * Prefilled WhatsApp nudge for the fixed players who still owe an RSVP.
 *
 * Shape matters here: this lands in a group chat where messages get skimmed on a
 * phone, so it opens with who/when/where (the full date, not just the weekday —
 * a nudge sent days ahead has to say *which* match), then the tally, then the
 * names, then a single link. WhatsApp renders `*…*` as bold, so the fixture line
 * carries the emphasis and nothing else competes with it.
 */
export function buildWhatsAppNudgeUrl(game, missingNames, rosterSnapshot = {}) {
  const shareUrl = buildCurrentPageGameShareUrl(game.id, game.season_slug);
  const opp = cleanOpponentName(game.opponent);
  const when = formatMatchCalendarDateTime(game);
  const venue = game?.location?.trim();
  const {
    fixedRoster = 0,
    playing = 0,
    if_needed = 0,
    cant = 0,
    missing = 0,
    guests = 0,
  } = rosterSnapshot;

  const lines = [`*${TEAM_NAME} vs ${opp}*`];

  const whenWhere = [when, venue].filter(Boolean).join(" · ");
  if (whenWhere) lines.push(whenWhere);

  const squad = [`${fixedRoster} in the roster`];
  if (guests > 0) squad.push(`${guests} guest${guests === 1 ? "" : "s"}`);
  lines.push(
    "",
    `In ${playing} · If needed ${if_needed} · Out ${cant} · No reply ${missing}`,
    squad.join(" · ")
  );

  const waiting = formatNameList(missingNames);
  if (waiting) lines.push("", `Still waiting on ${waiting}.`);

  // The bot signature stays a footer, not a headline: it tells the group this is an
  // automated reminder rather than someone singling players out, without stealing the
  // first line from the fixture. `_…_` is WhatsApp italics.
  lines.push("", "Confirm here:", shareUrl, "", "_— Attendance Bot 3000_");

  return `https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`;
}
