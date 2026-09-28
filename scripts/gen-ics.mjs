#!/usr/bin/env node
// Generate subscribable iCalendar feeds of the fixtures, one per season, into public/.
// Reads via the public Supabase REST endpoint (anon key — reads are public/RLS-open),
// so no service role is needed. Run locally: `npm run ics:gen`; in CI via sync-ics.yml.
//
// Env (falls back to the Vite-prefixed names so a local .env works):
//   SUPABASE_URL / VITE_SUPABASE_URL
//   SUPABASE_ANON_KEY / VITE_SUPABASE_ANON_KEY
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SEASON_OPTIONS, DEFAULT_SEASON_SLUG, seasonLabel } from "../src/seasons.js";
import { TEAM_NAME } from "../src/constants.js";
import { cleanOpponentName } from "../src/utils/opponent.js";
import { isHomeFromTitle } from "../src/utils/lzvCalendar.js";
import { reviseEvents } from "../src/utils/icsRevision.js";
import { fetchWithRetry } from "./http.mjs";

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

// RFC 5545 line folding: no content line longer than 75 *octets*; continuations start with a
// space (which counts toward the 75). Counted on UTF-8 bytes, not UTF-16 units — the
// DESCRIPTION carries "·", "—" and "–", which are 2–3 bytes each — and never splits a code
// point, so an emoji in a venue or opponent name cannot turn into invalid UTF-8.
export function fold(line, limit = 75) {
  if (Buffer.byteLength(line, "utf8") <= limit) return line;
  const parts = [];
  let chunk = "";
  let bytes = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch, "utf8");
    if (bytes + size > limit) {
      parts.push(chunk);
      chunk = " ";
      bytes = 1;
    }
    chunk += ch;
    bytes += size;
  }
  parts.push(chunk);
  return parts.join("\r\n");
}

/** Local (Europe/Brussels floating) datetime value from game_date + game_time. The hour offset
 *  goes through Date.UTC so a late kickoff rolls over the month and year too (23:00 on the 31st
 *  used to emit day 32). UTC is only used as a calendar here — the value stays floating local. */
export function localDT(dateStr, timeStr, addHours = 0) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  const [hh = 20, mm = 0] = String(timeStr || "20:00:00").split(":").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d, hh + addHours, mm));
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${t.getUTCFullYear()}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}` +
    `T${p(t.getUTCHours())}${p(t.getUTCMinutes())}00`
  );
}

/** Number of VEVENTs in an .ics text. */
export function countEvents(icsText) {
  return (String(icsText).match(/^BEGIN:VEVENT\r?$/gm) || []).length;
}

/**
 * Why a new feed must not replace the old one, or null when it may. An RLS-denied anon select
 * answers `200 []`, not an error, so "no fixtures" is indistinguishable from "cannot see the
 * fixtures" — and CI commits whatever is written. Emptying a feed that had events therefore needs
 * an explicit ICS_ALLOW_EMPTY=1 (e.g. a season really was wiped).
 */
export function emptyFeedRefusal(previousText, nextEventCount, allowEmpty = false) {
  const before = countEvents(previousText);
  if (allowEmpty || nextEventCount > 0 || before === 0) return null;
  return `would replace ${before} event(s) with an empty feed — refusing (set ICS_ALLOW_EMPTY=1 if intended)`;
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
  if (!n) return null; // "".includes-anything would match the first row
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

/** Home when our team is named first in the title. Shared with the calendar importer so both
 *  agree on how a title is split — see src/utils/lzvCalendar.js for why this is not inlined. */
function isHomeGame(game) {
  return isHomeFromTitle(game.title);
}

function gamePageUrl(game, slug) {
  return `${SITE_BASE}/?game=${encodeURIComponent(game.id)}&season=${encodeURIComponent(slug)}`;
}

async function fetchGames(slug) {
  const url =
    `${SUPABASE_URL}/rest/v1/games?season_slug=eq.${encodeURIComponent(slug)}` +
    `&select=id,opponent,game_date,game_time,location,title,home_score,away_score` +
    `&order=game_date.asc`;
  const res = await fetchWithRetry(
    url,
    { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } },
    { label: "ics" }
  );
  if (!res.ok) throw new Error(`Fetch failed for ${slug}: ${res.status} ${res.statusText}`);
  return res.json();
}

async function fetchStrengths(slug) {
  const url =
    `${SUPABASE_URL}/rest/v1/opponent_strength?season_slug=eq.${encodeURIComponent(slug)}` +
    `&select=name,current_position,current_ptn_per_match`;
  const res = await fetchWithRetry(
    url,
    { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } },
    { label: "ics" }
  );
  // Fail rather than degrade. Standings are only enrichment, but dropping them rewrites the
  // "Opponent form" line of every event, which bumps SEQUENCE across the whole feed — and again
  // the next day when the fetch works. Skipping one day's refresh is the cheaper failure.
  if (!res.ok) throw new Error(`Standings fetch failed for ${slug}: ${res.status} ${res.statusText}`);
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

/** One VEVENT as `{ uid, lines }` — content properties only; `SEQUENCE`/`DTSTAMP`/`LAST-MODIFIED`
 *  are added by `reviseEvents` so they can be compared against the feed we published last time. */
function buildEvent(g, slug, label, strengths) {
  const opp = g.opponent || "Opponent TBD";
  const summary = g.title || `${TEAM_NAME} vs ${opp}`;
  return {
    uid: `${escapeText(g.id)}@caracrew.org`,
    lines: [
      `DTSTART;TZID=Europe/Brussels:${localDT(g.game_date, g.game_time, 0)}`,
      `DTEND;TZID=Europe/Brussels:${localDT(g.game_date, g.game_time, 1)}`,
      `SUMMARY:${escapeText(summary)}`,
      g.location ? `LOCATION:${escapeText(g.location)}` : null,
      `DESCRIPTION:${escapeText(describeGame(g, slug, label, strengths))}`,
      `URL:${gamePageUrl(g, slug)}`,
      `CATEGORIES:${escapeText(TEAM_NAME)},Futsal`,
      "STATUS:CONFIRMED",
    ].filter(Boolean),
  };
}

/** The previously published feed, or "" the first time round — the source of each event's last
 *  known revision. A missing file is normal (fresh clone, new season) and must not be fatal. */
function readPreviousFeed(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

export function buildCalendar(slug, games, strengths, previousText, now) {
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

  const events = reviseEvents(
    games.filter((g) => g.game_date).map((g) => buildEvent(g, slug, label, strengths)),
    previousText,
    now
  );

  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${e.dtstamp}`,
      `SEQUENCE:${e.sequence}`,
      `LAST-MODIFIED:${e.dtstamp}`,
      ...e.lines,
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");
  const ics = lines.filter(Boolean).map((l) => fold(l)).join("\r\n") + "\r\n";
  return {
    ics,
    revised: events.filter((e) => e.reason === "content"),
    fresh: events.filter((e) => e.reason === "new"),
    migrated: events.filter((e) => e.reason === "migrated").length,
  };
}

async function main() {
  if (!SUPABASE_URL || !ANON_KEY) {
    throw new Error(
      "Missing SUPABASE_URL/ANON_KEY (or VITE_ equivalents). See .env / repo secrets."
    );
  }
  const now = new Date();
  for (const { slug } of SEASON_OPTIONS) {
    const [games, strengths] = await Promise.all([fetchGames(slug), fetchStrengths(slug)]);
    const target = join(PUBLIC_DIR, `fixtures-${slug}.ics`);
    const previous = readPreviousFeed(target);
    const { ics, revised, fresh, migrated } = buildCalendar(slug, games, strengths, previous, now);
    const refusal = emptyFeedRefusal(previous, countEvents(ics), process.env.ICS_ALLOW_EMPTY === "1");
    if (refusal) throw new Error(`fixtures-${slug}.ics ${refusal}`);
    writeFileSync(target, ics);
    console.log(`[ics] fixtures-${slug}.ics — ${games.length} fixtures`);
    // Say which events got a SEQUENCE bump: this is the line that tells you a subscriber's
    // calendar is about to move, and the one to look for when a change "did not arrive".
    for (const e of revised) console.log(`[ics]   revised → SEQUENCE ${e.sequence}  ${e.uid}`);
    for (const e of fresh) console.log(`[ics]   new event         ${e.uid}`);
    if (migrated) {
      console.log(`[ics]   ${migrated} event(s) re-stamped onto SEQUENCE 1 (one-off: previous feed carried none)`);
    }
    if (slug === DEFAULT_SEASON_SLUG) {
      writeFileSync(join(PUBLIC_DIR, "fixtures.ics"), ics);
      console.log(`[ics] fixtures.ics — mirror of default season ${slug}`);
    }
  }
}

const isMain =
  import.meta.url ===
  (process.argv[1] ? new URL(`file://${process.argv[1].replace(/\\/g, "/")}`).href : null);

if (isMain) {
  main().catch((err) => {
    console.error("[ics] Fatal:", err.message);
    process.exit(1);
  });
}
