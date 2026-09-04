#!/usr/bin/env node
/**
 * Fail loudly when LZV's live calendar no longer matches the fixtures we serve.
 *
 *   npm run calendar:drift                      # check the default season, exit 1 on drift
 *   npm run calendar:drift -- --season 2627
 *   npm run calendar:drift -- --file feed.ics   # check against a saved copy of the feed
 *   npm run calendar:drift -- --out drift.sql   # also write the fix-up SQL
 *   npm run calendar:drift -- --no-fail         # report only, always exit 0
 *
 * Read-only on purpose. It talks to lzvcup.be and reads `games` with the ANON key — it never writes,
 * even though a service-role key exists in CI for the score sync. A feed change can mean "moved to
 * Thursday" or "that club withdrew"; the second is not a decision for a cron job. So the job's
 * output is a diff plus the exact SQL, and a human runs it.
 *
 * The check this replaces did not exist, which is how a fixture ended up moved by an hour into a
 * different sports hall with 7 players already RSVP'd for the old one. See HANDOVER.md, 2026-09-04.
 */
import { appendFileSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { parseIcs, toGameRows } from "../src/utils/lzvCalendar.js";
import { diffFixtures, driftSql, formatDriftReport, hasDrift } from "../src/utils/calendarDrift.js";
import { DEFAULT_SEASON_SLUG } from "../src/seasons.js";
import { TEAM_NAME } from "../src/constants.js";

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

async function loadFeed() {
  if (args.file) return readFile(args.file, "utf8");
  const res = await fetch(FEED_URL, {
    headers: {
      "User-Agent": "caracrew-sync/1.0 (+https://github.com/matthiasverbeke93/caracrew-futsal)",
      Accept: "text/calendar,*/*",
    },
  });
  if (!res.ok) throw new Error(`Feed fetch failed: ${res.status} ${res.statusText}`);
  return res.text();
}

async function fetchGames(slug) {
  const url =
    `${SUPABASE_URL}/rest/v1/games?season_slug=eq.${encodeURIComponent(slug)}` +
    `&select=id,season_slug,opponent,game_date,game_time,location,title&order=game_date.asc`;
  const res = await fetch(url, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
  });
  if (!res.ok) throw new Error(`Games fetch failed: ${res.status} ${res.statusText}`);
  return res.json();
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
  const events = parseIcs(ics);

  if (events.length === 0) {
    // An empty feed is LZV's normal state between seasons. Treating it as "every fixture was
    // deleted" would cry wolf every summer, so stop here rather than report 22 removals.
    console.log("[drift] LZV's feed is empty — nothing to compare. (Normal between seasons.)");
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

  if (!hasDrift(diff)) {
    console.log("[drift] In sync — every fixture matches LZV on date, time, venue and opponent.");
    return;
  }

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

main().catch((err) => {
  console.error("[drift] Fatal:", err.message);
  process.exit(1);
});
