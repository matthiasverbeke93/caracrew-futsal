#!/usr/bin/env node
/**
 * Turn LZV's official per-team iCalendar feed into the SQL that loads a season's fixtures.
 *
 *   npm run calendar:import                       # fetch the live feed, preview only
 *   npm run calendar:import -- --out supabase/fixtures_2627.sql
 *   npm run calendar:import -- --file feed.ics    # work from a saved copy
 *   npm run calendar:import -- --season 2728 --team-id 742
 *   npm run calendar:import -- --default-time 21:00:00   # only for all-day feeds
 *
 * Read-only: it talks to lzvcup.be and writes a .sql file. It never touches Supabase — the generated
 * SQL is for the SQL editor, because the anon key cannot write to `games` (RLS: admin/service-role).
 *
 * It REFUSES to emit SQL if any fixture is ambiguous. Home/away is stored only in `games.title` and is
 * invisible in the app, so a wrong guess would surface silently in subscribers' calendars. See
 * CALENDAR-IMPORT.md.
 */
import { writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { buildInsertSql, parseIcs, toGameRows } from "../src/utils/lzvCalendar.js";
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

async function loadFeed() {
  if (args.file) {
    console.log(`[calendar] Reading ${args.file}`);
    return readFile(args.file, "utf8");
  }
  console.log(`[calendar] Fetching ${FEED_URL}`);
  const res = await fetch(FEED_URL, {
    headers: {
      "User-Agent": "caracrew-sync/1.0 (+https://github.com/matthiasverbeke93/caracrew-futsal)",
      Accept: "text/calendar,*/*",
    },
  });
  if (!res.ok) throw new Error(`Feed fetch failed: ${res.status} ${res.statusText}`);
  return res.text();
}

function pad(s, n) {
  return String(s ?? "").padEnd(n);
}

async function main() {
  const ics = await loadFeed();
  const events = parseIcs(ics);
  console.log(`[calendar] ${events.length} VEVENT(s) in the feed.`);

  if (events.length === 0) {
    console.log(
      "[calendar] Nothing to import. LZV serves an empty calendar until the season is published —\n" +
        "           check https://www.lzvcup.be/teams/overview/" +
        TEAM_ID +
        " for “nog geen gegevens bekend”."
    );
    return;
  }

  const { rows, problems } = toGameRows(events, {
    seasonSlug: SEASON,
    teamName: TEAM_NAME,
    defaultTime: typeof args["default-time"] === "string" ? args["default-time"] : null,
  });

  console.log(`\n[calendar] Season ${SEASON} — ${rows.length} fixture(s) parsed:\n`);
  console.log(`  ${pad("date", 12)}${pad("time", 9)}${pad("H/A", 5)}${pad("opponent", 26)}location`);
  console.log(`  ${"-".repeat(78)}`);
  for (const r of rows) {
    console.log(
      `  ${pad(r.game_date, 12)}${pad(r.game_time.slice(0, 5), 9)}${pad(r.is_home ? "HOME" : "away", 5)}` +
        `${pad(r.opponent, 26)}${r.location ?? "(none)"}`
    );
  }
  const home = rows.filter((r) => r.is_home).length;
  console.log(`\n  ${home} home / ${rows.length - home} away`);
  if (rows.length && home !== rows.length - home) {
    console.warn(
      "  ! Uneven home/away split. Normal for an odd fixture count or a cup round, but if this is a\n" +
        "    straight double round-robin it suggests a SUMMARY was read the wrong way round."
    );
  }

  if (problems.length) {
    console.error(`\n[calendar] ${problems.length} fixture(s) could NOT be read safely:\n`);
    for (const p of problems) console.error(`  [${p.kind}] ${p.label}\n      ${p.detail}`);
    console.error(
      "\n[calendar] Refusing to emit SQL. Every case above would give a wrong kickoff time or a wrong\n" +
        "           home/away, and home/away is invisible in the app (it only shows in subscribers'\n" +
        "           calendars). Fix the feed handling in src/utils/lzvCalendar.js — most likely LZV uses a\n" +
        "           SUMMARY separator this was not written to expect — then re-run. CALENDAR-IMPORT.md §1."
    );
    process.exitCode = 1;
    return;
  }

  const sql = buildInsertSql(rows, { seasonSlug: SEASON });

  if (typeof args.out === "string") {
    writeFileSync(args.out, sql);
    console.log(`\n[calendar] Wrote ${args.out} — paste it into the Supabase SQL editor.`);
    console.log("[calendar] Then: npm run sync:palmares, and commit the regenerated .ics feeds.");
  } else {
    console.log("\n[calendar] Preview only. Re-run with --out <file.sql> to write it.\n");
    console.log(sql);
  }
}

main().catch((err) => {
  console.error("[calendar] Fatal:", err.message);
  process.exit(1);
});
