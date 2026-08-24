#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_SEASON_SLUG } from "../src/seasons.js";

const LZV_URL =
  process.env.LZV_TEAM_URL || "https://www.lzvcup.be/teams/overview/742";

const SEASON_SLUG = process.env.LZV_SEASON_SLUG || DEFAULT_SEASON_SLUG;

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(li|p|div|tr|td|th|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function isoDate(belgian) {
  const [dd, mm, yyyy] = belgian.split("/");
  return `${yyyy}-${mm}-${dd}`;
}

function normalize(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^k\.?\s+/, "k ")
    .trim();
}

function stripOurTeamSuffix(name) {
  return normalize(name).replace(/\s*(k\s+)?caracrew(\s+sk)?\s*$/i, "").trim();
}

function cleanOpponent(rawOpponent) {
  const s = normalize(rawOpponent)
    .replace(/\s+\d+\s*[-–—]\s*\d+\b.*$/, "")
    .trim();
  return stripOurTeamSuffix(s) || s;
}

function isOurTeam(name) {
  return /caracrew/i.test(name);
}

export function parseMatches(html) {
  const text = stripTags(html);
  const lines = text
    .split("\n")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const matches = [];

  for (let i = 0; i < lines.length; i++) {
    const dateMatch = lines[i].match(/(\d{2}\/\d{2}\/\d{4})/);
    if (!dateMatch) continue;

    let scoreIdx = -1;
    for (let j = i + 1; j <= i + 8 && j < lines.length; j++) {
      if (/^\d+\s*[-–—]\s*\d+$/.test(lines[j])) {
        scoreIdx = j;
        break;
      }
    }
    if (scoreIdx === -1) continue;

    const home = lines[scoreIdx - 1];
    const scoreLine = lines[scoreIdx];
    const away = lines[scoreIdx + 1];
    const venue = lines[scoreIdx + 2];

    const [hsStr, asStr] = scoreLine.split(/[-–—]/).map((s) => s.trim());
    const homeScore = Number(hsStr);
    const awayScore = Number(asStr);
    if (Number.isNaN(homeScore) || Number.isNaN(awayScore)) continue;

    const ourIsHome = isOurTeam(home);
    const ourIsAway = isOurTeam(away);
    if (!ourIsHome && !ourIsAway) continue;

    matches.push({
      date: isoDate(dateMatch[1]),
      opponentRaw: ourIsHome ? away : home,
      home_score: ourIsHome ? homeScore : awayScore,
      away_score: ourIsHome ? awayScore : homeScore,
      venue,
    });
  }

  const seen = new Set();
  return matches.filter((m) => {
    const key = `${m.date}|${normalize(m.opponentRaw)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findGameForMatch(games, m) {
  const lzvOpp = cleanOpponent(m.opponentRaw);
  const sameDate = games.filter((g) => g.game_date === m.date);
  if (sameDate.length === 0) return null;
  const exact = sameDate.find((g) => cleanOpponent(g.opponent) === lzvOpp);
  if (exact) return exact;
  const fuzzy = sameDate.find((g) => {
    const dbOpp = cleanOpponent(g.opponent);
    return dbOpp.includes(lzvOpp) || lzvOpp.includes(dbOpp);
  });
  return fuzzy || null;
}

function sameOpponent(a, b) {
  const x = cleanOpponent(a);
  const y = cleanOpponent(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

function isUnscored(game) {
  return game.home_score == null || game.away_score == null;
}

/** Whole days between two `YYYY-MM-DD` strings. Both are plain dates, so UTC parsing cannot drift. */
function daysBetween(isoA, isoB) {
  const a = Date.parse(`${isoA}T00:00:00Z`);
  const b = Date.parse(`${isoB}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY;
  return Math.round((a - b) / 86400000);
}

function localTodayIso() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** How many days a stored fixture may sit in the past, unscored and unreported by LZV, before we say so. */
export const STALE_RESULT_DAYS = 7;

/**
 * Work out what LZV's results say about the stored fixture list.
 *
 * The sync only ever matched on an exact date, so a rescheduled match looked like two
 * non-events at once: LZV's result found no row to write to, and the stored row simply stayed
 * empty forever. Neither said the word "reschedule", and the stored row is the one every RSVP,
 * stat and MOTM vote is attached to — re-importing the fixture would create a second row and
 * orphan all of it (see CALENDAR-IMPORT.md). So this detects and reports; it never moves a date.
 *
 * @returns {{
 *   matched: Array<{match: object, game: object}>,
 *   reschedules: Array<{match: object, candidates: object[]}>,
 *   orphans: object[],
 *   staleFixtures: object[],
 * }}
 */
export function reconcileFixtures(parsed, games, { todayIso = localTodayIso(), staleDays = STALE_RESULT_DAYS } = {}) {
  const all = games || [];
  const consumed = new Set();
  const matched = [];
  const unmatchedMatches = [];

  // Pass 1 — the fixtures LZV and the DB agree on. Claim them first so a reschedule
  // cannot be blamed on a row that already has a match of its own.
  for (const m of parsed || []) {
    const game = findGameForMatch(all, m);
    if (game && !consumed.has(game.id)) {
      consumed.add(game.id);
      matched.push({ match: m, game });
    } else {
      unmatchedMatches.push(m);
    }
  }

  // Pass 2 — a result with no row on its date, but an unclaimed row against the same
  // opponent somewhere else in the season. That is a moved fixture, not a missing one.
  const reschedules = [];
  const orphans = [];
  const proposed = new Set();
  for (const m of unmatchedMatches) {
    const candidates = all
      .filter((g) => !consumed.has(g.id) && !proposed.has(g.id) && sameOpponent(g.opponent, m.opponentRaw))
      // An unscored row is the likelier home for a result, and a near date likelier than the
      // reverse fixture months away — but both stay on the list, because a double round-robin
      // means "same opponent" is never proof on its own.
      .sort((a, b) => {
        if (isUnscored(a) !== isUnscored(b)) return isUnscored(a) ? -1 : 1;
        return Math.abs(daysBetween(a.game_date, m.date)) - Math.abs(daysBetween(b.game_date, m.date));
      });

    if (candidates.length === 0) {
      orphans.push(m);
      continue;
    }
    for (const c of candidates) proposed.add(c.id);
    reschedules.push({ match: m, candidates });
  }

  // Pass 3 — the other direction: a fixture whose date is well past, still unscored, and which
  // LZV never reported. Postponed, or a result the parser is no longer picking up.
  const staleFixtures = all.filter(
    (g) =>
      isUnscored(g) &&
      !consumed.has(g.id) &&
      !proposed.has(g.id) &&
      g.game_date &&
      daysBetween(todayIso, g.game_date) > staleDays
  );

  return { matched, reschedules, orphans, staleFixtures };
}

/** GitHub Actions surfaces `::warning::` in the run summary; locally it is just a prefixed line. */
function annotate(message) {
  if (process.env.GITHUB_ACTIONS) console.log(`::warning::${message}`);
  else console.warn(`[lzv-sync] WARN ${message}`);
}

/** The edit to make by hand. Moving the existing row keeps every RSVP attached to it. */
export function rescheduleSql(game, match) {
  return `update games set game_date = '${match.date}' where id = '${game.id}';`;
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars"
    );
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  console.log(`[lzv-sync] Fetching ${LZV_URL}`);
  const res = await fetch(LZV_URL, {
    headers: {
      "User-Agent":
        "caracrew-sync/1.0 (+https://github.com/matthiasverbeke93/caracrew-futsal)",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "nl-BE,nl;q=0.9,en;q=0.8",
    },
  });
  if (!res.ok) {
    throw new Error(`LZV fetch failed: ${res.status} ${res.statusText}`);
  }
  const html = await res.text();

  const parsed = parseMatches(html);
  console.log(
    `[lzv-sync] Season ${SEASON_SLUG} · Parsed ${parsed.length} played Caracrew matches.`
  );
  if (parsed.length === 0) {
    console.warn(
      "[lzv-sync] No matches parsed. The page layout may have changed."
    );
    return;
  }

  const { data: games, error } = await supabase
    .from("games")
    .select("id, game_date, opponent, home_score, away_score")
    .eq("season_slug", SEASON_SLUG);
  if (error) throw error;

  const targets = (games || []).filter(
    (g) => g.home_score == null || g.away_score == null
  );
  console.log(
    `[lzv-sync] ${targets.length} games in DB missing a final score.`
  );

  const { matched, reschedules, orphans, staleFixtures } = reconcileFixtures(parsed, games || []);

  let updated = 0;
  for (const { match: m, game } of matched) {
    // Already stored — nothing to write, and re-writing would churn a row an admin may have
    // corrected by hand.
    if (game.home_score != null && game.away_score != null) continue;
    const { error: upErr } = await supabase
      .from("games")
      .update({ home_score: m.home_score, away_score: m.away_score })
      .eq("id", game.id);
    if (upErr) {
      console.error(`[lzv-sync] Update failed for ${game.id}:`, upErr.message);
      continue;
    }
    updated += 1;
    console.log(
      `[lzv-sync] ${game.game_date} vs ${game.opponent} -> ${m.home_score}-${m.away_score}`
    );
  }

  // Nothing below writes anything. A moved fixture has to be edited in place by hand: the id
  // encodes the old date, and attendance / player_stats / guest_players / motm_votes all FK to
  // game_id, so creating a row on the new date would silently abandon every RSVP already given.
  for (const { match: m, candidates } of reschedules) {
    const best = candidates[0];
    annotate(
      `Possible reschedule: LZV has ${m.date} vs ${m.opponentRaw} ` +
        `(${m.home_score}-${m.away_score}) but no fixture is stored on that date. ` +
        `Closest unclaimed row: ${best.id} on ${best.game_date}.`
    );
    if (candidates.length > 1) {
      console.warn(
        `[lzv-sync]   ${candidates.length} candidates — pick by hand: ` +
          candidates.map((c) => `${c.id} (${c.game_date})`).join(", ")
      );
    }
    console.warn(
      `[lzv-sync]   Move the EXISTING row, do not re-import: ${rescheduleSql(best, m)}`
    );
    console.warn(
      "[lzv-sync]   Then re-run this job to fill the score. See CALENDAR-IMPORT.md."
    );
  }

  for (const m of orphans) {
    annotate(
      `No fixture stored for ${m.date} vs ${m.opponentRaw} ` +
        `(${m.home_score}-${m.away_score}), and no unclaimed row against that opponent either.`
    );
  }

  for (const g of staleFixtures) {
    annotate(
      `${g.game_date} vs ${g.opponent} is more than ${STALE_RESULT_DAYS} days past, still has no ` +
        "score, and LZV reported no result for it. Postponed, or the fixture moved."
    );
  }

  console.log(
    `[lzv-sync] Done. Updated ${updated} game(s). ` +
      `${reschedules.length} possible reschedule(s), ${orphans.length} unmatched result(s), ` +
      `${staleFixtures.length} stale fixture(s).`
  );
}

const isMain =
  import.meta.url ===
  (process.argv[1] ? new URL(`file://${process.argv[1].replace(/\\/g, "/")}`).href : null);

if (isMain) {
  main().catch((err) => {
    console.error("[lzv-sync] Fatal:", err);
    process.exit(1);
  });
}
