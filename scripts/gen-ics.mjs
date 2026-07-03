#!/usr/bin/env node
// Generate subscribable iCalendar feeds of the fixtures, one per season, into public/.
// Reads via the public Supabase REST endpoint (anon key — reads are public/RLS-open),
// so no service role is needed. Run locally: `npm run ics:gen`; in CI via sync-ics.yml.
//
// Env (falls back to the Vite-prefixed names so a local .env works):
//   SUPABASE_URL / VITE_SUPABASE_URL
//   SUPABASE_ANON_KEY / VITE_SUPABASE_ANON_KEY
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SEASON_OPTIONS, DEFAULT_SEASON_SLUG, seasonLabel } from "../src/seasons.js";
import { TEAM_NAME } from "../src/constants.js";
import { cleanOpponentName } from "../src/utils/opponent.js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

// Base URL of the deployed app, for deep-links back to each game's page.
const SITE_BASE = (
  process.env.SITE_URL ||
  process.env.PUBLIC_APP_URL ||
  process.env.VITE_SITE_URL ||
  "https://caracrew.org"
).replace(/\/+$/, "");

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

// Standard Europe/Brussels timezone definition (CET/CEST) so clients render local kickoff time.
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Brussels",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

function escapeText(s) {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// RFC 5545 line folding: no content line longer than 75 octets; continuations start with a space.
function fold(line) {
  if (line.length <= 74) return line;
  const parts = [line.slice(0, 74)];
  let rest = line.slice(74);
  while (rest.length > 73) {
    parts.push(" " + rest.slice(0, 73));
    rest = rest.slice(73);
  }
  parts.push(" " + rest);
  return parts.join("\r\n");
}

// Stable per-feed timestamp derived from the latest fixture date, NOT the run time —
// so a scheduled regen only produces a diff when the fixtures themselves change.
function feedStamp(games) {
  let latest = "20240101";
  for (const g of games) {
    if (g.game_date) {
      const d = String(g.game_date).replace(/-/g, "");
      if (d > latest) latest = d;
    }
  }
  return `${latest}T000000Z`;
}

/** Local (Europe/Brussels floating) datetime value from game_date + game_time. */
function localDT(dateStr, timeStr, addHours = 0) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  const [hh = 20, mm = 0] = String(timeStr || "20:00:00").split(":").map(Number);
  let hour = hh + addHours;
  let day = d;
  if (hour >= 24) {
    hour -= 24;
    day += 1;
  }
  const p = (n) => String(n).padStart(2, "0");
  return `${y}${p(m)}${p(day)}T${p(hour)}${p(mm)}00`;
}

// --- opponent standing / difficulty (mirrors src/utils/difficulty.js) ---
function normalizeName(name) {
  return cleanOpponentName(name)
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^k\.?\s+/, "k ")
    .trim();
}

function findStrengthRow(opponent, strengths) {
  if (!opponent || !strengths?.length) return null;
  const n = normalizeName(opponent);
  return (
    strengths.find((s) => normalizeName(s.name) === n) ||
    strengths.find((s) => {
      const sn = normalizeName(s.name);
      return sn.includes(n) || n.includes(sn);
    }) ||
    null
  );
}

function difficultyLabel(position) {
  if (position == null) return null;
  if (position <= 3) return "Very hard";
  if (position <= 5) return "Hard";
  if (position <= 7) return "Medium";
  if (position <= 9) return "Easy";
  return "Very easy";
}

/** Home when our team is named first in the title (before "vs" or the score). */
function isHomeGame(game) {
  const t = String(game.title || "").toLowerCase();
  if (!t) return null;
  const first = t.split(/\s+vs\s+|\s+\d+\s*[-–—]\s*\d+\s+/)[0] || "";
  return /caracrew/.test(first);
}

function gamePageUrl(game, slug) {
  return `${SITE_BASE}/?game=${encodeURIComponent(game.id)}&season=${encodeURIComponent(slug)}`;
}

async function fetchGames(slug) {
  const url =
    `${SUPABASE_URL}/rest/v1/games?season_slug=eq.${encodeURIComponent(slug)}` +
    `&select=id,opponent,game_date,game_time,location,title,home_score,away_score` +
    `&order=game_date.asc`;
  const res = await fetch(url, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
  });
  if (!res.ok) throw new Error(`Fetch failed for ${slug}: ${res.status} ${res.statusText}`);
  return res.json();
}

async function fetchStrengths(slug) {
  const url =
    `${SUPABASE_URL}/rest/v1/opponent_strength?season_slug=eq.${encodeURIComponent(slug)}` +
    `&select=name,current_position,current_ptn_per_match`;
  const res = await fetch(url, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
  });
  if (!res.ok) return []; // standings are optional enrichment — don't fail the feed
  return res.json();
}

/** Human-readable, multi-line DESCRIPTION for one fixture. */
function describeGame(g, slug, label, strengths) {
  const opp = cleanOpponentName(g.opponent) || g.opponent || "Opponent TBD";
  const home = isHomeGame(g);
  const lines = [];

  lines.push(`Competition: LZV Cup · ${label}`);
  lines.push(home == null ? `Opponent: ${opp}` : `${home ? "Home vs" : "Away at"} ${opp}`);
  if (g.location) lines.push(`Venue: ${g.location}`);

  const row = findStrengthRow(g.opponent, strengths);
  if (row && row.current_position != null) {
    const diff = difficultyLabel(row.current_position);
    const ppm = row.current_ptn_per_match != null ? `, ${Number(row.current_ptn_per_match).toFixed(2)} pts/match` : "";
    lines.push(`Opponent form: ${diff} — position ${row.current_position}${ppm}`);
  }

  const scored = g.home_score != null && g.away_score != null;
  if (scored) {
    const outcome =
      g.home_score > g.away_score ? "W" : g.home_score < g.away_score ? "L" : "D";
    lines.push(`Result: ${g.home_score}–${g.away_score} (${outcome}, ${TEAM_NAME} first)`);
  }

  lines.push("");
  lines.push(`Match page: ${gamePageUrl(g, slug)}`);
  return lines.join("\n");
}

function buildCalendar(slug, games, strengths, dtstamp) {
  const label = seasonLabel(slug);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//caracrew-futsal//fixtures//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(`${TEAM_NAME} fixtures ${label}`)}`,
    "X-WR-TIMEZONE:Europe/Brussels",
    ...VTIMEZONE,
  ];

  for (const g of games) {
    if (!g.game_date) continue;
    const opp = g.opponent || "Opponent TBD";
    const summary = g.title || `${TEAM_NAME} vs ${opp}`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeText(g.id)}@caracrew.org`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;TZID=Europe/Brussels:${localDT(g.game_date, g.game_time, 0)}`,
      `DTEND;TZID=Europe/Brussels:${localDT(g.game_date, g.game_time, 1)}`,
      `SUMMARY:${escapeText(summary)}`,
      g.location ? `LOCATION:${escapeText(g.location)}` : null,
      `DESCRIPTION:${escapeText(describeGame(g, slug, label, strengths))}`,
      `URL:${gamePageUrl(g, slug)}`,
      `CATEGORIES:${escapeText(TEAM_NAME)},Futsal`,
      "STATUS:CONFIRMED",
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");
  return lines.filter(Boolean).map(fold).join("\r\n") + "\r\n";
}

async function main() {
  if (!SUPABASE_URL || !ANON_KEY) {
    throw new Error(
      "Missing SUPABASE_URL/ANON_KEY (or VITE_ equivalents). See .env / repo secrets."
    );
  }
  for (const { slug } of SEASON_OPTIONS) {
    const [games, strengths] = await Promise.all([fetchGames(slug), fetchStrengths(slug)]);
    const ics = buildCalendar(slug, games, strengths, feedStamp(games));
    writeFileSync(join(PUBLIC_DIR, `fixtures-${slug}.ics`), ics);
    console.log(`[ics] fixtures-${slug}.ics — ${games.length} fixtures`);
    if (slug === DEFAULT_SEASON_SLUG) {
      writeFileSync(join(PUBLIC_DIR, "fixtures.ics"), ics);
      console.log(`[ics] fixtures.ics — mirror of default season ${slug}`);
    }
  }
}

main().catch((err) => {
  console.error("[ics] Fatal:", err.message);
  process.exit(1);
});
