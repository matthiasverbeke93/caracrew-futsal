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

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

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

function buildCalendar(slug, games, dtstamp) {
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
    const scored = g.home_score != null && g.away_score != null;
    const description = scored
      ? `Result: ${g.home_score}–${g.away_score} (${TEAM_NAME} first).`
      : `${TEAM_NAME} ${label} fixture.`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeText(g.id)}@caracrew.org`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;TZID=Europe/Brussels:${localDT(g.game_date, g.game_time, 0)}`,
      `DTEND;TZID=Europe/Brussels:${localDT(g.game_date, g.game_time, 1)}`,
      `SUMMARY:${escapeText(summary)}`,
      g.location ? `LOCATION:${escapeText(g.location)}` : null,
      `DESCRIPTION:${escapeText(description)}`,
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
    const games = await fetchGames(slug);
    const ics = buildCalendar(slug, games, feedStamp(games));
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
