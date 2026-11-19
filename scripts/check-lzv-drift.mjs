#!/usr/bin/env node
/**
 * Fail loudly when LZV's live calendar no longer matches the fixtures we serve.
 *
 *   npm run calendar:drift                      # check the default season, exit 1 on drift
 *   npm run calendar:drift -- --season 2627
 *   npm run calendar:drift -- --file feed.ics   # check against a saved copy of the feed
 *   npm run calendar:drift -- --out drift.sql   # also write the fix-up SQL
 *   npm run calendar:drift -- --no-fail         # report only, always exit 0
 *   npm run calendar:drift -- --apply           # fix what is safe (needs SUPABASE_SERVICE_ROLE_KEY)
 *
 * Without --apply it is read-only: a diff plus the exact SQL, and a human runs it.
 *
 * With --apply (the daily CI run, owner decision 2026-11-19) it fixes by itself whatever
 * `planAutoFix` allows — same-day time/hall changes in place (RSVPs kept), new dates as a fresh row
 * (RSVPs cleared), new fixtures inserted, ONE vanished upcoming fixture deleted (postponed) — and
 * leaves the rest (played/past games, several vanishing at once, ambiguous matches) to a human.
 * It reports `applied=<n>` on GITHUB_OUTPUT so the workflow can fail AFTER regenerating the feeds,
 * which is what sends the owner the email. Exit 1 only when something is left for a human.
 *
 * The check this replaces did not exist, which is how a fixture ended up moved by an hour into a
 * different sports hall with 7 players already RSVP'd for the old one. See HANDOVER.md, 2026-09-04.
 */
import { appendFileSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { parseIcs, toGameRows } from "../src/utils/lzvCalendar.js";
import {
  describeAction,
  diffFixtures,
  driftSql,
  formatDriftReport,
  hasDrift,
  manualDiff,
  planAutoFix,
} from "../src/utils/calendarDrift.js";
import { DEFAULT_SEASON_SLUG } from "../src/seasons.js";
import { TEAM_NAME } from "../src/constants.js";
import { fetchWithRetry } from "./http.mjs";

/** Does this look like an iCalendar body at all? A maintenance page, a Cloudflare challenge or an
 *  HTML error served with 200 parses to zero events, which used to read as "empty feed, all fine". */
export function isCalendarBody(text) {
  return /^\s*BEGIN:VCALENDAR/m.test(String(text ?? ""));
}

/** Today's date in Brussels as YYYY-MM-DD (the runner is on UTC). */
export function brusselsToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(now);
}

/** Fixtures in `games` still to be played. An empty LZV feed is only "between seasons" when this is
 *  empty too; with fixtures still ahead it means we have lost sight of the league calendar. */
export function upcomingFixtures(dbRows, todayIso) {
  return (dbRows || []).filter((r) => r.game_date && r.game_date >= todayIso);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const SEASON = args.season || process.env.LZV_SEASON_SLUG || DEFAULT_SEASON_SLUG;
const TEAM_ID = args["team-id"] || process.env.LZV_OUR_TEAM_ID || "742";
const FEED_URL = args.url || `https://www.lzvcup.be/icalendar.php?id=${TEAM_ID}`;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = Boolean(args.apply);

async function loadFeed() {
  if (args.file) return readFile(args.file, "utf8");
  const res = await fetchWithRetry(
    FEED_URL,
    {
      headers: {
        "User-Agent": "caracrew-sync/1.0 (+https://github.com/matthiasverbeke93/caracrew-futsal)",
        Accept: "text/calendar,*/*",
      },
    },
    { label: "drift" }
  );
  if (!res.ok) throw new Error(`Feed fetch failed: ${res.status} ${res.statusText}`);
  return res.text();
}

async function fetchGames(slug) {
  const url =
    `${SUPABASE_URL}/rest/v1/games?season_slug=eq.${encodeURIComponent(slug)}` +
    `&select=id,season_slug,opponent,game_date,game_time,location,title,home_score,away_score&order=game_date.asc`;
  const res = await fetchWithRetry(
    url,
    { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } },
    { label: "drift" }
  );
  if (!res.ok) throw new Error(`Games fetch failed: ${res.status} ${res.statusText}`);
  return res.json();
}

/** PostgREST call with the service-role key. Throws on any non-2xx so a half-applied run fails loudly;
 *  every write is idempotent (upsert / delete-by-id / patch-by-id), so the next run finishes the job. */
async function rest(method, path, body, prefer = "return=minimal") {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: prefer,
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path.split("?")[0]} failed: ${res.status} ${await res.text()}`);
  return method === "GET" ? res.json() : null;
}

/** Games that must never be moved or deleted by a cron job: a score, stats or MOTM votes. */
async function playedGameIds(dbRows) {
  const ids = new Set(dbRows.filter((r) => r.home_score != null || r.away_score != null).map((r) => r.id));
  const list = dbRows.map((r) => `"${r.id}"`).join(",");
  if (!list) return ids;
  for (const table of ["player_stats", "motm_votes"]) {
    const rows = await rest("GET", `${table}?select=game_id&game_id=in.(${encodeURIComponent(list)})`);
    for (const r of rows) ids.add(r.game_id);
  }
  return ids;
}

const enc = encodeURIComponent;
const upsertGame = (row) => rest("POST", "games?on_conflict=id", [row], "resolution=merge-duplicates,return=minimal");

async function applyAction(a) {
  if (a.kind === "update") return rest("PATCH", `games?id=eq.${enc(a.id)}`, a.set);
  if (a.kind === "insert") return upsertGame(a.insert);
  // Insert first, then delete: if the delete fails the game is never missing, and the next run sees
  // the old row as a single vanished fixture and deletes it then.
  if (a.kind === "move") {
    await upsertGame(a.insert);
    return rest("DELETE", `games?id=eq.${enc(a.oldId)}`);
  }
  if (a.kind === "delete") return rest("DELETE", `games?id=eq.${enc(a.id)}`); // cascades RSVPs
  throw new Error(`Unknown action ${a.kind}`);
}

function writeOutput(name, value) {
  const path = process.env.GITHUB_OUTPUT;
  if (path) appendFileSync(path, `${name}=${value}\n`);
}

/** Surface the report in the workflow's summary panel, not just 300 lines down in the log. */
function writeJobSummary(markdown) {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (!path || !markdown) return;
  try {
    appendFileSync(path, markdown + "\n");
  } catch (err) {
    console.warn(`[drift] Could not write the job summary: ${err.message}`);
  }
}

async function main() {
  if (!SUPABASE_URL || !ANON_KEY) {
    throw new Error("Missing SUPABASE_URL/ANON_KEY (or VITE_ equivalents). See .env / repo secrets.");
  }

  const [ics, dbRows] = await Promise.all([loadFeed(), fetchGames(SEASON)]);
  if (!isCalendarBody(ics)) {
    const head = String(ics).slice(0, 120).replace(/\s+/g, " ");
    throw new Error(`LZV did not serve a calendar (no BEGIN:VCALENDAR). Body starts: ${head}`);
  }
  const events = parseIcs(ics);

  if (events.length === 0) {
    // An empty feed is LZV's normal state between seasons. Treating it as "every fixture was
    // deleted" would cry wolf every summer, so stop here rather than report 22 removals — but only
    // when we have nothing left to play either. Mid-season, an empty feed is a blind check.
    const ahead = upcomingFixtures(dbRows, brusselsToday());
    if (ahead.length === 0) {
      console.log("[drift] LZV's feed is empty — nothing to compare. (Normal between seasons.)");
      return;
    }
    console.error(
      `::warning::[drift] LZV's feed is empty but games still has ${ahead.length} upcoming fixture(s) ` +
        `for ${SEASON} — cannot check them. Wrong team id, or LZV withdrew the calendar?`
    );
    process.exitCode = 1;
    return;
  }

  const { rows: feedRows, problems } = toGameRows(events, {
    seasonSlug: SEASON,
    teamName: TEAM_NAME,
  });

  if (problems.length) {
    console.error(`[drift] ${problems.length} fixture(s) in the feed could not be read safely:\n`);
    for (const p of problems) console.error(`  [${p.kind}] ${p.label}\n      ${p.detail}`);
    console.error(
      "\n[drift] Cannot compare a feed we cannot parse — most likely LZV changed the SUMMARY layout.\n" +
        "        Fix src/utils/lzvCalendar.js, then re-run. CALENDAR-IMPORT.md §1."
    );
    writeJobSummary(
      `### LZV calendar drift — season ${SEASON}\n\n` +
        `Could not parse ${problems.length} fixture(s) from the feed; see the log. ` +
        "The feed layout probably changed — `src/utils/lzvCalendar.js` needs updating.\n"
    );
    process.exitCode = 1;
    return;
  }

  const diff = diffFixtures(feedRows, dbRows);
  console.log(`[drift] Season ${SEASON}: ${feedRows.length} in the feed, ${dbRows.length} in games.`);

  writeOutput("applied", 0);
  if (!hasDrift(diff)) {
    console.log("[drift] In sync — every fixture matches LZV on date, time, venue and opponent.");
    return;
  }

  if (APPLY) {
    await applySafeFixes(diff, dbRows);
    return;
  }
  reportForHuman(diff);
}

async function applySafeFixes(fullDiff, dbRows) {
  if (!SERVICE_KEY) throw new Error("--apply needs SUPABASE_SERVICE_ROLE_KEY.");
  const { actions, manual } = planAutoFix(fullDiff, {
    today: brusselsToday(),
    playedIds: await playedGameIds(dbRows),
  });

  const done = [];
  for (const a of actions) {
    await applyAction(a);
    done.push(describeAction(a));
    console.log(`[drift] ${done.at(-1)}`);
  }
  writeOutput("applied", done.length);
  if (done.length) {
    writeJobSummary(
      `### LZV calendar — changed automatically (season ${SEASON})\n\n` +
        done.map((d) => `- ${d}`).join("\n") +
        "\n\nThe calendar feeds are regenerated in the next step. A kickoff moving within 48 h still needs a message in the group chat.\n"
    );
  }

  if (manual.length) {
    console.error(`[drift] ${manual.length} change(s) left for a human:`);
    for (const m of manual) console.error(`  - ${(m.db || m.item.db).id}: ${m.reason}`);
    writeJobSummary(
      "### Left for you\n\n" + manual.map((m) => `- \`${(m.db || m.item.db).id}\`: ${m.reason}`).join("\n") + "\n"
    );
    reportForHuman(manualDiff(manual));
  }
}

function reportForHuman(diff) {
  const report = formatDriftReport(diff, { seasonSlug: SEASON, feedUrl: FEED_URL });
  const sql = driftSql(diff, { seasonSlug: SEASON });

  console.error(`\n${report}`);
  console.error(
    "[drift] The .ics feeds are generated FROM `games`, so they are already stale and regenerating\n" +
      "        them changes nothing. Apply this in the Supabase SQL editor, then re-run Sync calendar\n" +
      "        feeds (or wait for tomorrow's 05:30 UTC run):\n"
  );
  console.error(sql);

  writeJobSummary(
    `${report}\n<details><summary>SQL to fix it (Supabase SQL editor)</summary>\n\n` +
      "```sql\n" +
      sql +
      "```\n</details>\n"
  );

  if (typeof args.out === "string") {
    writeFileSync(args.out, sql);
    console.error(`[drift] Wrote ${args.out}`);
  }

  if (!args["no-fail"]) process.exitCode = 1;
}

const isMain =
  import.meta.url ===
  (process.argv[1] ? new URL(`file://${process.argv[1].replace(/\\/g, "/")}`).href : null);

if (isMain) {
  main().catch((err) => {
    console.error("[drift] Fatal:", err.message);
    process.exit(1);
  });
}
